require("dotenv").config();

const { Document } = require("@langchain/core/documents");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { QdrantVectorStore } = require("@langchain/qdrant");

const collectionName = process.env.QDRANT_COLLECTION || "cortex_documents";

let vectorStorePromise;
const fallbackDocuments = new Map();
let usingFallbackStore = false;

const getOwnerIdFromFilter = (filter) => {
  const mustClauses = filter?.must ?? [];
  const ownerClause = mustClauses.find(
    (condition) => condition?.key === "metadata.ownerId",
  );
  return ownerClause?.match?.value ? String(ownerClause.match.value) : null;
};

const createFallbackVectorStore = () => ({
  async addDocuments(chunks) {
    const ownerId = chunks[0]?.metadata?.ownerId;
    if (!ownerId) {
      return chunks.length;
    }

    const existing = fallbackDocuments.get(String(ownerId)) || [];
    const normalizedChunks = chunks.map((chunk) => ({
      pageContent: chunk.pageContent,
      metadata: { ...chunk.metadata },
    }));

    fallbackDocuments.set(String(ownerId), [...existing, ...normalizedChunks]);
    return normalizedChunks.length;
  },

  async similaritySearch(question, k = 5, filter) {
    const ownerId = getOwnerIdFromFilter(filter);
    const candidates = ownerId
      ? fallbackDocuments.get(String(ownerId)) || []
      : [...fallbackDocuments.values()].flat();

    const normalizedQuestion = String(question || "").toLowerCase();
    const tokens = normalizedQuestion.split(/\s+/).filter(Boolean);
    const tokenRegex =
      tokens.length > 0 ? new RegExp(tokens.join("|"), "gi") : null;

    return candidates
      .map((doc) => {
        const content = String(doc.pageContent || "").toLowerCase();
        const metadataText = Object.values(doc.metadata || {})
          .join(" ")
          .toLowerCase();
        const overlap = tokenRegex
          ? (content.match(tokenRegex) || []).length
          : 0;
        const score =
          overlap * 3 +
          (content.includes(normalizedQuestion) ? 4 : 0) +
          (metadataText.includes(normalizedQuestion) ? 2 : 0);
        return { doc, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, k)
      .map(({ doc }) => doc);
  },
});

const FILTERED_PAYLOAD_FIELDS = ["metadata.ownerId", "metadata.documentId"];

const ensurePayloadIndexes = async (store) => {
  for (const field of FILTERED_PAYLOAD_FIELDS) {
    try {
      await store.client.createPayloadIndex(collectionName, {
        field_name: field,
        field_schema: "keyword",
        wait: true,
      });
    } catch (error) {
      console.warn(`Could not ensure the ${field} payload index:`, error.message);
    }
  }
};

const getVectorStore = async () => {
  if (!vectorStorePromise) {
    vectorStorePromise = (async () => {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey || !process.env.QDRANT_URL) {
        usingFallbackStore = true;
        return createFallbackVectorStore();
      }

      try {
        const embeddings = new GoogleGenerativeAIEmbeddings({
          apiKey,
          model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
        });

        const store = await QdrantVectorStore.fromExistingCollection(embeddings, {
          url: process.env.QDRANT_URL,
          apiKey: process.env.QDRANT_API_KEY,
          collectionName,
        });

        await ensurePayloadIndexes(store);
        return store;
      } catch (error) {
        console.warn(
          "Falling back to in-memory RAG storage because Qdrant is unavailable:",
          error.message,
        );
        usingFallbackStore = true;
        return createFallbackVectorStore();
      }
    })();
  }

  return vectorStorePromise;
};

const indexDocument = async ({ text, ownerId, documentId, filename }) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  const sourceDocument = new Document({
    pageContent: text,
    metadata: {
      ownerId,
      documentId,
      filename,
    },
  });

  const chunks = await splitter.splitDocuments([sourceDocument]);

  chunks.forEach((chunk, chunkIndex) => {
    chunk.metadata.chunkIndex = chunkIndex;
  });

  const vectorStore = await getVectorStore();
  await vectorStore.addDocuments(chunks);

  return chunks.length;
};

const retrieveRelevantDocuments = async (ownerId, question) => {
  const vectorStore = await getVectorStore();

  const filter = {
    must: [
      {
        key: "metadata.ownerId",
        match: { value: String(ownerId) },
      },
    ],
  };

  return vectorStore.similaritySearch(question, 5, filter);
};

const deleteDocumentVectors = async (ownerId, documentId) => {
  if (usingFallbackStore || !process.env.QDRANT_URL) {
    const key = String(ownerId);
    const documents = (fallbackDocuments.get(key) || []).filter(
      (chunk) => String(chunk.metadata?.documentId) !== String(documentId),
    );

    if (documents.length > 0) {
      fallbackDocuments.set(key, documents);
    } else {
      fallbackDocuments.delete(key);
    }

    return;
  }

  const response = await fetch(
    `${process.env.QDRANT_URL}/collections/${collectionName}/points/delete?wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QDRANT_API_KEY && {
          "api-key": process.env.QDRANT_API_KEY,
        }),
      },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: "metadata.ownerId",
              match: { value: String(ownerId) },
            },
            {
              key: "metadata.documentId",
              match: { value: String(documentId) },
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Failed to remove document vectors from Qdrant: ${details}`,
    );
  }
};

module.exports = {
  indexDocument,
  retrieveRelevantDocuments,
  deleteDocumentVectors,
};
