const { ChatOpenRouter } = require("@langchain/openrouter");
const { ChatAnthropic } = require("@langchain/anthropic");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatGroq } = require("@langchain/groq");

const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL || "deepseek/deepseek-v4-flash";
const GREETING_MODEL = process.env.GREETING_MODEL || "deepseek/deepseek-v4-flash";
const GENERAL_MODEL = process.env.GENERAL_MODEL || "deepseek/deepseek-chat";
const RAG_MODEL = process.env.RAG_MODEL || "deepseek/deepseek-chat";
const CODING_MODEL = process.env.CODING_MODEL || "deepseek/deepseek-r1";
const SEARCH_MODEL = process.env.SEARCH_MODEL || "deepseek/deepseek-chat";
const MEMORY_MODEL = process.env.MEMORY_MODEL || "deepseek/deepseek-v4-flash";

// TEMPORARY testing fallback: when OpenRouter's shared free tier is exhausted, set
// AI_PROVIDER to "anthropic" | "gemini" | "groq" (+ the matching API key) to route every
// role through a different provider instead - each is a separate account/billing pool,
// untouched by OpenRouter's limits. Model defaults below were picked by testing each
// provider's tool-calling live, not guessed - see docs/services for the comparison.
const AI_PROVIDER = process.env.AI_PROVIDER || "openrouter";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest";
const GROQ_CHAT_MODEL_ID = process.env.GROQ_CHAT_MODEL_ID || "openai/gpt-oss-120b";

const openRouter = (model, options) =>
  new ChatOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    model,
    ...options,
  });

const anthropic = (options) =>
  new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: ANTHROPIC_MODEL,
    ...options,
  });

const gemini = (options) =>
  new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: GEMINI_CHAT_MODEL,
    ...options,
  });

const groq = (options) =>
  new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: GROQ_CHAT_MODEL_ID,
    ...options,
  });

const buildModel = (openRouterModelId, options) => {
  switch (AI_PROVIDER) {
    case "anthropic":
      return anthropic(options);
    case "gemini":
      return gemini(options);
    case "groq":
      return groq(options);
    default:
      return openRouter(openRouterModelId, options);
  }
};

const OrchestratorModel = () => buildModel(ORCHESTRATOR_MODEL, { temperature: 0.2, maxTokens: 1024 });

const GreetingModel = () => buildModel(GREETING_MODEL, { temperature: 0.4, maxTokens: 200 });

const GeneralModel = () => buildModel(GENERAL_MODEL, { temperature: 0.3, maxTokens: 1024 });

const CodingModel = () => buildModel(CODING_MODEL, { temperature: 0.1, maxTokens: 1024 });

const SearchModel = () => buildModel(SEARCH_MODEL, { temperature: 0, maxTokens: 512 });

const RagModel = () => buildModel(RAG_MODEL, { temperature: 0, maxTokens: 768 });

const MemoryModel = () => buildModel(MEMORY_MODEL, { temperature: 0.2, maxTokens: 500 });

function getAgentModel(agentType) {
  switch (agentType) {
    case "orchestrator":
      return OrchestratorModel();

    case "greeting":
      return GreetingModel();

    case "coding":
      return CodingModel();

    case "search":
      return SearchModel();

    case "rag":
      return RagModel();

    case "memory":
      return MemoryModel();

    case "general":
    default:
      return GeneralModel();
  }
}

module.exports = {
  getAgentModel,
  ORCHESTRATOR_MODEL,
  GREETING_MODEL,
  GENERAL_MODEL,
  RAG_MODEL,
  CODING_MODEL,
  SEARCH_MODEL,
  MEMORY_MODEL,
  AI_PROVIDER,
  ANTHROPIC_MODEL,
  GEMINI_CHAT_MODEL,
  GROQ_CHAT_MODEL_ID,
};
