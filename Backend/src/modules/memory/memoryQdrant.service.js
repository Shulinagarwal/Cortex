require("dotenv").config();

const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const collectionName = process.env.QDRANT_MEMORY_COLLECTION || "cortex_user_memory";

let embeddingsInstance;
const getEmbeddings = () => {
  if (!embeddingsInstance) {
    embeddingsInstance = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    });
  }
  return embeddingsInstance;
};

const isConfigured = () =>
  Boolean(process.env.QDRANT_URL && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY));

const embed = async (text) => getEmbeddings().embedQuery(text);

// --- in-memory fallback, mirrors qdrantService.js's degrade-gracefully pattern (NFR-AVAIL-01) ---
const fallbackFacts = new Map(); // userId -> [{id, text, embedding}]

const cosineSimilarity = (a, b) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
};

let collectionEnsured = false;

const request = async (path, options = {}) => {
  const response = await fetch(`${process.env.QDRANT_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.QDRANT_API_KEY && { "api-key": process.env.QDRANT_API_KEY }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Qdrant memory request failed (${response.status}): ${details}`);
  }

  return response.json();
};

const ensureCollection = async () => {
  if (collectionEnsured) return;

  const sample = await embed("dimension probe");

  try {
    await request(`/collections/${collectionName}`, {
      method: "PUT",
      body: JSON.stringify({ vectors: { size: sample.length, distance: "Cosine" } }),
    });
  } catch (error) {
    // Collection likely already exists - subsequent calls surface any real problem.
  }

  try {
    await request(`/collections/${collectionName}/index`, {
      method: "PUT",
      body: JSON.stringify({ field_name: "userId", field_schema: "keyword", wait: true }),
    });
  } catch (error) {
    console.warn("Could not ensure the userId payload index on the memory collection:", error.message);
  }

  collectionEnsured = true;
};

const upsertFact = async (userId, { id, text, embedding }) => {
  if (!isConfigured()) {
    const rows = (fallbackFacts.get(String(userId)) || []).filter((row) => row.id !== id);
    rows.push({ id, text, embedding });
    fallbackFacts.set(String(userId), rows);
    return;
  }

  await ensureCollection();
  await request(`/collections/${collectionName}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: [{ id, vector: embedding, payload: { userId: String(userId), text } }],
    }),
  });
};

const searchByVector = async (userId, embedding, limit) => {
  if (!isConfigured()) {
    const rows = fallbackFacts.get(String(userId)) || [];
    return rows
      .map((row) => ({ id: row.id, text: row.text, score: cosineSimilarity(embedding, row.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  await ensureCollection();
  const result = await request(`/collections/${collectionName}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: embedding,
      filter: { must: [{ key: "userId", match: { value: String(userId) } }] },
      limit,
      with_payload: true,
    }),
  });

  return (result.result || []).map((point) => ({
    id: point.id,
    text: point.payload?.text,
    score: point.score,
  }));
};

const listFacts = async (userId) => {
  if (!isConfigured()) {
    return (fallbackFacts.get(String(userId)) || []).map(({ id, text }) => ({ id, text }));
  }

  await ensureCollection();
  const result = await request(`/collections/${collectionName}/points/scroll`, {
    method: "POST",
    body: JSON.stringify({
      filter: { must: [{ key: "userId", match: { value: String(userId) } }] },
      limit: 1000,
      with_payload: true,
      with_vector: false,
    }),
  });

  return (result.result?.points || []).map((point) => ({ id: point.id, text: point.payload?.text }));
};

const deleteFacts = async (userId, ids) => {
  if (ids.length === 0) return;

  if (!isConfigured()) {
    const rows = (fallbackFacts.get(String(userId)) || []).filter((row) => !ids.includes(row.id));
    fallbackFacts.set(String(userId), rows);
    return;
  }

  await ensureCollection();
  await request(`/collections/${collectionName}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({ points: ids }),
  });
};

module.exports = { embed, upsertFact, searchByVector, listFacts, deleteFacts, isConfigured };
