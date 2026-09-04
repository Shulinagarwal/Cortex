const { z } = require("zod");
const { tool } = require("@langchain/core/tools");
const { TavilySearch, TavilyExtract } = require("@langchain/tavily");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const Document = require("../../modules/document/document.model");
const { retrieveRelevantDocuments } = require("../../modules/document/qdrant.service");
const { getUserMcpServers } = require("../../modules/connectors/connector.service");
const { getAgentModel } = require("../modelConfig");
const { INTERNAL_LLM_TAG } = require("../internalTag");
const { codingPrompt } = require("../prompts/codingAgent");

const MAX_TAVILY_RESULTS = 3;

const webSearchTool = () => {
  const tavily = new TavilySearch({ maxResults: MAX_TAVILY_RESULTS });

  return tool(
    async ({ query }) => {
      const raw = await tavily.invoke({ query });
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    },
    {
      name: "web_search",
      description:
        "Search the public web for current, up-to-date or factual information: news, releases, " +
        "latest versions, prices, or anything that may have changed recently. Do NOT use for the " +
        "user's own uploaded files.",
      schema: z.object({
        query: z.string().min(1).max(400).describe("The search query to send to the web."),
      }),
    },
  );
};

const MAX_URL_CHARS = 8000;

const readUrlTool = () => {
  const extractor = new TavilyExtract({ tavilyApiKey: process.env.TAVILY_API_KEY });

  return tool(
    async ({ url }) => {
      const result = await extractor.invoke({ urls: [url] });
      const page = result?.results?.[0];

      if (!page) {
        const failure = result?.failed_results?.[0];
        return `Could not read that URL${failure?.error ? `: ${failure.error}` : "."}`;
      }

      const content = String(page.raw_content || "").slice(0, MAX_URL_CHARS);
      return `[${page.title || url}]\n${content}`;
    },
    {
      name: "read_url",
      description:
        "Read the actual content of a SPECIFIC web page or URL, given its exact address. " +
        "Use this when the user gives you a link and asks about it, or after web_search " +
        "returns a promising result you need the full content of. Do NOT use web_search " +
        "again for a URL you already have - use this instead.",
      schema: z.object({
        url: z.string().url().describe("The exact URL to read, including https://"),
      }),
    },
  );
};

const searchMyDocumentsTool = (userId) =>
  tool(
    async ({ question }) => {
      const recentDocs = await Document.find({ owner: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("filename");

      if (recentDocs.length === 0) {
        return "The user has not uploaded any documents yet.";
      }

      const names = recentDocs.map((d) => d.filename).join(", ");

      const reformulation = await getAgentModel("general").invoke(
        [
          new HumanMessage(
            `You write search queries for a vector database.\n` +
              `The user's uploaded documents are: [${names}] (most recent first).\n` +
              `If their question is generic ("summarize the document"), assume the most recent one and ` +
              `include its name and likely concepts.\n` +
              `Output ONLY the raw search query.\n\nUser's request: "${question}"`,
          ),
        ],
        { tags: [INTERNAL_LLM_TAG] },
      );

      const optimizedQuery = String(reformulation.content).trim() || question;
      const documents = await retrieveRelevantDocuments(userId, optimizedQuery);

      if (documents.length === 0) {
        return `No relevant passages found in the user's documents. Their uploads are: ${names}.`;
      }

      return documents
        .map(
          (d) =>
            `[${d.metadata.filename}, section ${d.metadata.chunkIndex + 1}]\n${d.pageContent}`,
        )
        .join("\n\n---\n\n");
    },
    {
      name: "search_my_documents",
      description:
        "Search the USER'S OWN uploaded documents and files. Use whenever they refer to 'my' " +
        "documents, files, uploads, notes, PDF, or ask about something they say they uploaded. " +
        "Returns passages tagged with filename and section, which you must cite.",
      schema: z.object({
        question: z
          .string()
          .min(1)
          .max(400)
          .describe("What to look for in the user's documents."),
      }),
    },
  );

const listMyDocumentsTool = (userId) =>
  tool(
    async () => {
      const documents = await Document.find({ owner: userId })
        .sort({ createdAt: -1 })
        .select("filename detectedMimeType size chunkCount createdAt");

      if (documents.length === 0) {
        return "The user has not uploaded any documents.";
      }

      return documents
        .map((d, i) => {
          const kb = Math.round(d.size / 1024);
          const when = d.createdAt.toISOString().slice(0, 10);
          return `${i + 1}. ${d.filename} (${kb} KB, ${d.chunkCount} indexed section${d.chunkCount === 1 ? "" : "s"}, uploaded ${when})`;
        })
        .join("\n");
    },
    {
      name: "list_my_documents",
      description:
        "List the NAMES of all documents the user has uploaded. Use when they ask 'what " +
        "files do I have', 'what have I uploaded', or need to know which document to ask " +
        "about. Does NOT search inside the documents - use search_my_documents for that.",
      schema: z.object({}),
    },
  );

const writeCodeTool = () =>
  tool(
    async ({ request, language }) => {
      const response = await getAgentModel("coding").invoke(
        [
          new SystemMessage(codingPrompt),
          new HumanMessage(language ? `Language: ${language}\n\n${request}` : request),
        ],
        { tags: [INTERNAL_LLM_TAG] },
      );
      return String(response.content);
    },
    {
      name: "write_code",
      description:
        "Write, explain, review or debug source code using a model specialised for programming. " +
        "Use for anything involving code, algorithms, stack traces or configuration files. " +
        "This only produces and explains code - it never runs it.",
      schema: z.object({
        request: z
          .string()
          .min(1)
          .max(4000)
          .describe("The full coding request, including any code to review."),
        language: z.string().max(40).optional().describe("Programming language, if known."),
      }),
    },
  );

const buildMcpTools = async (userId) => {
  if (!userId) return [];

  try {
    const servers = await getUserMcpServers(userId);
    if (Object.keys(servers).length === 0) return [];

    const client = new MultiServerMCPClient(servers);
    return await client.getTools();
  } catch (error) {
    console.error("MCP tool discovery failed, continuing without connector tools:", error.message);
    return [];
  }
};

const buildTools = async (userId) => {
  const mcpTools = await buildMcpTools(userId);

  return [
    webSearchTool(),
    readUrlTool(),
    searchMyDocumentsTool(userId),
    listMyDocumentsTool(userId),
    writeCodeTool(),
    ...mcpTools,
  ];
};

module.exports = {
  buildTools,
  buildMcpTools,
  webSearchTool,
  readUrlTool,
  searchMyDocumentsTool,
  listMyDocumentsTool,
  writeCodeTool,
};
