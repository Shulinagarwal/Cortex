const crypto = require("crypto");

const { HumanMessage } = require("@langchain/core/messages");

const ChatModel = require("../chat/chat.model");
const MessageModel = require("../message/message.model");
const UserModel = require("../user/user.model");
const UserMemoryStateModel = require("./userMemoryState.model");
const memoryQdrant = require("./memoryQdrant.service");
const { getAgentModel } = require("../../agents/modelConfig");
const { INTERNAL_LLM_TAG } = require("../../agents/internalTag");

const BATCH_THRESHOLD = Number(process.env.LTM_BATCH_THRESHOLD) || 20;
const CONSOLIDATE_CAP = Number(process.env.LTM_CONSOLIDATE_CAP) || 40;
const RETRIEVE_TOP_K = Number(process.env.LTM_RETRIEVE_TOP_K) || 5;
const DEDUP_SIMILARITY_THRESHOLD = Number(process.env.LTM_DEDUP_SIMILARITY_THRESHOLD) || 0.92;

const NONE_MARKER = /^none$/i;

const parseFactLines = (raw) =>
  String(raw ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter((line) => line.length > 0 && !NONE_MARKER.test(line));

const collectMessagesSince = async (userId, since) => {
  const chats = await ChatModel.find({ createdby: userId });
  const allMessages = [];

  for (const chat of chats) {
    const chatMessages = await MessageModel.find({ chatId: chat._id });
    allMessages.push(...chatMessages);
  }

  return allMessages
    .filter((msg) => msg.role === "USER" && (!since || new Date(msg.createdAt) > new Date(since)))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

const saveFactIfNew = async (userId, text, { skipDedup = false } = {}) => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { created: false, reason: "empty" };

  const embedding = await memoryQdrant.embed(trimmed);

  if (!skipDedup) {
    const [closest] = await memoryQdrant.searchByVector(userId, embedding, 1);
    if (closest && closest.score >= DEDUP_SIMILARITY_THRESHOLD) {
      return { created: false, reason: "duplicate", existing: { id: closest.id, text: closest.text } };
    }
  }

  const fact = { id: crypto.randomUUID(), text: trimmed };
  await memoryQdrant.upsertFact(userId, { ...fact, embedding });
  return { created: true, fact };
};

const consolidateIfOverCap = async (userId) => {
  const facts = await memoryQdrant.listFacts(userId);
  if (facts.length <= CONSOLIDATE_CAP) return;

  const prompt =
    `You maintain a long-term memory of facts about a user. There are too many stored facts - ` +
    `merge and condense them into a smaller set of denser, non-overlapping facts that preserve ` +
    `every important detail. Combine related facts into one line where natural. Do not lose any ` +
    `distinct piece of information.\n\nCurrent facts:\n${facts.map((f) => `- ${f.text}`).join("\n")}` +
    `\n\nReply with one consolidated fact per line, plain prose, no numbering, no bullets.`;

  const memoryModel = getAgentModel("memory");
  const response = await memoryModel.invoke([new HumanMessage(prompt)], { tags: [INTERNAL_LLM_TAG] });
  const consolidated = parseFactLines(response.content);

  if (consolidated.length === 0) return;

  await memoryQdrant.deleteFacts(userId, facts.map((f) => f.id));
  for (const text of consolidated) {
    await saveFactIfNew(userId, text, { skipDedup: true });
  }
};

const runExtractionBatch = async (userId, since) => {
  const messages = await collectMessagesSince(userId, since);
  if (messages.length === 0) return;

  const prompt =
    `You are extracting durable facts about a user from their recent messages, for long-term ` +
    `personalization memory.\n\nMessages:\n${messages.map((m) => `- ${m.content}`).join("\n")}` +
    `\n\nTask: identify any durable facts about the user worth remembering long-term - their ` +
    `name, role, job, ongoing projects, stable preferences, goals. Ignore anything transient ` +
    `(today's mood, a one-off question, small talk).\n\n` +
    `Reply with one fact per line, plain prose, no numbering, no bullets. If there is nothing ` +
    `worth remembering, reply with exactly: NONE`;

  const memoryModel = getAgentModel("memory");
  const response = await memoryModel.invoke([new HumanMessage(prompt)], { tags: [INTERNAL_LLM_TAG] });
  const candidates = parseFactLines(response.content);

  for (const text of candidates) {
    await saveFactIfNew(userId, text);
  }

  await consolidateIfOverCap(userId);
};

const isLtmEnabled = async (userId) => {
  const user = await UserModel.findOne({ _id: userId });
  return Boolean(user?.ltmEnabled);
};

const recordAndMaybeExtract = async (userId) => {
  if (!(await isLtmEnabled(userId))) return;

  let state = await UserMemoryStateModel.findOne({ userId });
  if (!state) {
    state = await UserMemoryStateModel.create({ userId, unprocessedCount: 0, lastProcessedAt: null });
  }

  const newCount = (state.unprocessedCount || 0) + 1;
  await UserMemoryStateModel.findByIdAndUpdate(state._id, { unprocessedCount: newCount });

  if (newCount < BATCH_THRESHOLD) return;

  try {
    await runExtractionBatch(userId, state.lastProcessedAt);
  } finally {
    await UserMemoryStateModel.findByIdAndUpdate(state._id, {
      unprocessedCount: 0,
      lastProcessedAt: new Date(),
    });
  }
};

const retrieveRelevantFacts = async (userId, queryText) => {
  try {
    if (!(await isLtmEnabled(userId))) return [];

    const embedding = await memoryQdrant.embed(queryText);
    const results = await memoryQdrant.searchByVector(userId, embedding, RETRIEVE_TOP_K);
    return results.map((r) => r.text).filter(Boolean);
  } catch (error) {
    console.error("LTM retrieval failed, continuing without personalization:", error);
    return [];
  }
};

const addUserFact = async (userId, text) => {
  if (!(await isLtmEnabled(userId))) return { created: false, reason: "disabled" };
  return saveFactIfNew(userId, text);
};

const listUserFacts = async (userId) => memoryQdrant.listFacts(userId);

const updateUserFact = async (userId, factId, text) => {
  const facts = await memoryQdrant.listFacts(userId);
  if (!facts.some((f) => f.id === factId)) return null;

  const trimmed = String(text ?? "").trim();
  const embedding = await memoryQdrant.embed(trimmed);
  await memoryQdrant.upsertFact(userId, { id: factId, text: trimmed, embedding });

  return { id: factId, text: trimmed };
};

const deleteUserFact = async (userId, factId) => {
  const facts = await memoryQdrant.listFacts(userId);
  if (!facts.some((f) => f.id === factId)) return false;

  await memoryQdrant.deleteFacts(userId, [factId]);
  return true;
};

const getLtmSettings = async (userId) => ({ enabled: await isLtmEnabled(userId) });

const setLtmEnabled = async (userId, enabled) => {
  await UserModel.findByIdAndUpdate(userId, { ltmEnabled: Boolean(enabled) });
  return { enabled: Boolean(enabled) };
};

module.exports = {
  recordAndMaybeExtract,
  retrieveRelevantFacts,
  addUserFact,
  listUserFacts,
  updateUserFact,
  deleteUserFact,
  getLtmSettings,
  setLtmEnabled,
};
