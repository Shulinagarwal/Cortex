const MessageModel = require("./message.model");
const ChatModel = require("../chat/chat.model");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

const { getCortexAgentApp } = require("../../agents/graph");
const { getAgentModel } = require("../../agents/modelConfig");
const { INTERNAL_LLM_TAG } = require("../../agents/internalTag");
const { DEFAULT_ALLOWED_TOOLS } = require("../../agents/guardrails");
const { stripToolCallMarkup } = require("../../agents/nodes/agentNode");
const { buildAgentMessages } = require("./stm.service");
const { recordAndMaybeExtract, retrieveRelevantFacts } = require("../memory/ltm.service");
const { sendError } = require("../../shared/utils/apiError");

const sanitizeChatTitle = (raw) => {
  const firstLine = String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return null;

  const cleaned = firstLine
    .replace(/^[-*\u2022]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^["'\u201C\u2018]|["'\u201D\u2019]$/g, "")
    .replace(/[*_`#]/g, "")
    .trim();

  if (!cleaned) return null;
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trimEnd()}...` : cleaned;
};

const PUBLIC_TOOL_NAMES = new Set(DEFAULT_ALLOWED_TOOLS);

const handleGetMessages = async (req, res) => {
  const chat = await ChatModel.findOne({
    _id: req.params.chatId,
    createdby: req.user._id,
  });

  if (!chat) {
    return sendError(res, 404, "NOT_FOUND", "Chat not found.");
  }

  const messages = await MessageModel.find({ chatId: chat._id });
  return res.status(200).json({ messages });
};

const handleSendMessage = async (req, res) => {
  const { content, chatId, idempotencyKey } = req.body;

  // A repeat of a send that already landed - a transport-level retry (e.g. the SSE client
  // re-issuing the POST on tab refocus), not a new message. Return the reply that was
  // already produced instead of saving the question twice and generating a second answer.
  if (idempotencyKey) {
    const alreadySent = await MessageModel.findOne({ idempotencyKey });

    if (alreadySent) {
      const chatMessages = await MessageModel.find({ chatId: alreadySent.chatId });
      const aiReplies = chatMessages.filter((message) => message.role === "AI");
      const chat = await ChatModel.findOne({ _id: alreadySent.chatId });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      res.write(
        `data: ${JSON.stringify({
          done: true,
          duplicate: true,
          aiMessage: aiReplies[aiReplies.length - 1] ?? null,
          newChat: chat ? { _id: chat._id, title: chat.title } : undefined,
        })}\n\n`,
      );

      return res.end();
    }
  }

  let activeChatId = chatId;
  let createdChat = null;
  let chatDoc = null;

  let fullAiResponse = "";
  let rawAiResponse = "";
  let emittedLength = 0;
  let lastModelMessage = "";
  let isClientConnected = true;
  const toolsUsed = new Set();

  if (activeChatId) {
    const chat = await ChatModel.findOne({
      _id: activeChatId,
      createdby: req.user._id,
    });

    if (!chat) {
      return sendError(res, 404, "NOT_FOUND", "Chat not found.");
    }

    activeChatId = chat._id;
    chatDoc = chat;
  } else {
    createdChat = await ChatModel.create({ createdby: req.user._id });
    activeChatId = createdChat._id;
    chatDoc = createdChat;
  }

  try {
    await MessageModel.create({ content, chatId: activeChatId, role: "USER", idempotencyKey });

    recordAndMaybeExtract(req.user._id).catch((err) =>
      console.error("LTM extraction failed:", err),
    );

    const pastMessages = await MessageModel.find({ chatId: activeChatId }).sort({
      createdAt: 1,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let generatedTitle = null;
    if (pastMessages.length === 1) {
      try {
        const titleModel = getAgentModel("greeting");
        const titleResponse = await titleModel.invoke(
          [
            new HumanMessage(
              `Write a short title for this conversation, 3 to 5 words.\n` +
                `Reply with the title only - one line, no quotes, no bullet points, no ` +
                `alternatives, no explanation.\n\nMessage: "${content}"`,
            ),
          ],
          { tags: [INTERNAL_LLM_TAG] },
        );

        generatedTitle = sanitizeChatTitle(titleResponse.content);

        if (generatedTitle) {
          await ChatModel.findByIdAndUpdate(activeChatId, { title: generatedTitle });
        }
      } catch (err) {
        console.error("Failed to generate title:", err);
      }
    }

    const langchainMessages = await buildAgentMessages({ chat: chatDoc, pastMessages });

    const relevantFacts = await retrieveRelevantFacts(req.user._id, content);
    if (relevantFacts.length > 0) {
      langchainMessages.unshift(
        new SystemMessage(`Known facts about this user:\n${relevantFacts.map((f) => `- ${f}`).join("\n")}`),
      );
    }

    req.on("close", () => {
      isClientConnected = false;
    });

    const stream = await getCortexAgentApp().streamEvents(
      { messages: langchainMessages, userId: req.user._id.toString() },
      { version: "v2" },
    );

    for await (const event of stream) {
      if (!isClientConnected) break;

      if (event?.tags?.includes(INTERNAL_LLM_TAG)) continue;

      if (event.event === "on_tool_start" && PUBLIC_TOOL_NAMES.has(event.name)) {
        toolsUsed.add(event.name);
        res.write(`data: ${JSON.stringify({ toolStart: event.name })}

`);
      }

      if (event.event === "on_chat_model_end") {
        const output = event.data?.output;
        const text = typeof output?.content === "string" ? output.content : "";
        if (text.trim()) lastModelMessage = text;
      }

      if (
        event.event === "on_chat_model_stream" &&
        event.data?.chunk?.content &&
        typeof event.data.chunk.content === "string"
      ) {
        rawAiResponse += event.data.chunk.content;
        const cleaned = stripToolCallMarkup(rawAiResponse);

        if (cleaned.length > emittedLength) {
          const delta = cleaned.slice(emittedLength);
          emittedLength = cleaned.length;
          fullAiResponse = cleaned;
          res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
        }
      }
    }

    let answer = fullAiResponse.trim();

    if (!answer) {
      answer = stripToolCallMarkup(lastModelMessage).trim();
      if (answer && isClientConnected) {
        res.write(`data: ${JSON.stringify({ chunk: answer })}\n\n`);
      }
    }

    if (!answer) {
      answer =
        "I wasn't able to produce an answer for that. Please try rephrasing, or ask for one thing at a time.";
      if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ chunk: answer })}\n\n`);
      }
    }

    const finalContent = isClientConnected ? answer : `${answer}\n\n*[Stopped by user]*`;

    const aiMessage = await MessageModel.create({
      content: finalContent,
      chatId: activeChatId,
      role: "AI",
      toolsUsed: toolsUsed.size > 0 ? [...toolsUsed] : undefined,
    });

    if (isClientConnected) {
      res.write(
        `data: ${JSON.stringify({
          done: true,
          aiMessage,
          newTitle: generatedTitle,
          newChat: createdChat ?? undefined,
        })}\n\n`,
      );
      return res.end();
    }
  } catch (error) {
    console.error("Error in LangGraph Generation:", error);

    const partial = stripToolCallMarkup(rawAiResponse).trim();
    const isOutOfCredits =
      error?.statusCode === 402 || error?.metadata?.limit_source === "openrouter_credits";
    const failureNote = isOutOfCredits
      ? "The AI provider (OpenRouter) is out of credits. Add credits at " +
        "https://openrouter.ai/settings/credits, then try again."
      : "Something went wrong while generating this response. Please try asking again.";
    const savedContent = partial ? `${partial}\n\n*${failureNote}*` : failureNote;

    try {
      await MessageModel.create({
        content: savedContent,
        chatId: activeChatId,
        role: "AI",
        toolsUsed: toolsUsed.size > 0 ? [...toolsUsed] : undefined,
      });
    } catch (saveError) {
      console.error("Also failed to save the failure message:", saveError.message);
    }

    if (!res.headersSent) {
      return res.status(500).json({
        error: { code: "GENERATION_FAILED", message: failureNote },
        chatId: activeChatId,
        newChat: createdChat ?? undefined,
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ error: failureNote, chatId: activeChatId, newChat: createdChat ?? undefined })}\n\n`,
      );
      return res.end();
    }
  }
};

module.exports = {
  handleGetMessages,
  handleSendMessage,
};
