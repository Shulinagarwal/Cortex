const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");

const ChatModel = require("../chat/chat.model");
const { getAgentModel } = require("../../agents/modelConfig");
const { INTERNAL_LLM_TAG } = require("../../agents/internalTag");

const COMPRESS_THRESHOLD = Number(process.env.STM_COMPRESS_THRESHOLD) || 20;
const KEEP_VERBATIM = Number(process.env.STM_KEEP_VERBATIM) || 10;

const toLangChainMessage = (msg) =>
  msg.role === "USER" ? new HumanMessage(msg.content) : new AIMessage(msg.content);

const formatForSummary = (messages) =>
  messages
    .map((msg) => `${msg.role === "USER" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

const summaryToSystemMessage = (summaryText) =>
  new SystemMessage(`Summary of earlier conversation:\n${summaryText}`);

async function foldIntoSummary({ previousSummary, messagesToFold }) {
  const memoryModel = getAgentModel("memory");

  const prompt =
    (previousSummary
      ? `Existing summary of the conversation so far:\n${previousSummary}\n\n`
      : "") +
    `New messages to fold into the summary:\n${formatForSummary(messagesToFold)}\n\n` +
    `Write an updated, concise summary of the whole conversation so far. Preserve important ` +
    `facts, decisions, and context a reader would need to continue the conversation naturally. ` +
    `Plain prose, no headers, no bullet points, no preamble.`;

  const response = await memoryModel.invoke([new HumanMessage(prompt)], {
    tags: [INTERNAL_LLM_TAG],
  });

  return String(response.content ?? "").trim();
}

const unsummarizedTail = (pastMessages, chat) => {
  const summarizedThroughId = chat?.summary?.summarizedThroughMessageId
    ? String(chat.summary.summarizedThroughMessageId)
    : null;

  if (!summarizedThroughId) return pastMessages;

  const cutoffIndex = pastMessages.findIndex((msg) => String(msg._id) === summarizedThroughId);
  return cutoffIndex === -1 ? pastMessages : pastMessages.slice(cutoffIndex + 1);
};

async function buildAgentMessages({ chat, pastMessages }) {
  const existingSummary = chat?.summary?.text || null;
  const unsummarized = unsummarizedTail(pastMessages, chat);

  const shouldCompress = unsummarized.length > COMPRESS_THRESHOLD && unsummarized.length > KEEP_VERBATIM;

  if (!shouldCompress) {
    if (!existingSummary) return pastMessages.map(toLangChainMessage);
    return [summaryToSystemMessage(existingSummary), ...unsummarized.map(toLangChainMessage)];
  }

  const verbatimTail = unsummarized.slice(-KEEP_VERBATIM);
  const toFold = unsummarized.slice(0, unsummarized.length - KEEP_VERBATIM);

  try {
    const newSummary = await foldIntoSummary({ previousSummary: existingSummary, messagesToFold: toFold });
    if (!newSummary) throw new Error("Summarization returned empty content");

    const summarizedThroughMessageId = toFold[toFold.length - 1]._id;

    await ChatModel.findByIdAndUpdate(chat._id, {
      summary: { text: newSummary, summarizedThroughMessageId, updatedAt: new Date() },
    });

    return [summaryToSystemMessage(newSummary), ...verbatimTail.map(toLangChainMessage)];
  } catch (err) {
    console.error("Short-term memory compression failed, falling back to full history:", err);

    if (!existingSummary) return pastMessages.map(toLangChainMessage);
    return [summaryToSystemMessage(existingSummary), ...unsummarized.map(toLangChainMessage)];
  }
}

module.exports = { buildAgentMessages };
