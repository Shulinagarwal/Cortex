
require("dotenv").config();

const mongoose = require("mongoose");
const DocumentModel = require("../src/modules/document/document.model");
const { indexDocument, deleteDocumentVectors } = require("../src/modules/document/qdrant.service");
const { getCortexAgentApp } = require("../src/agents/graph");
const { stripToolCallMarkup } = require("../src/agents/nodes/agentNode");
const { INTERNAL_LLM_TAG } = require("../src/agents/internalTag");
const { DEFAULT_ALLOWED_TOOLS, MAX_TOOL_CALLS_PER_TURN } = require("../src/agents/guardrails");
const { HumanMessage } = require("@langchain/core/messages");

const PUBLIC_TOOLS = new Set(DEFAULT_ALLOWED_TOOLS);
const FULLWIDTH_BAR = String.fromCharCode(0xff5c);
const OWNER = "000000000000000000000042";

const ok = (label, pass, extra = "") =>
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

const run = async (text, allowedTools) => {
  const tools = [];
  let raw = "";
  let clean = "";
  let emitted = 0;
  const startedAt = Date.now();

  const stream = await getCortexAgentApp().streamEvents(
    { messages: [new HumanMessage(text)], userId: OWNER, allowedTools },
    { version: "v2" },
  );

  for await (const event of stream) {
    if (event.event === "on_tool_start" && PUBLIC_TOOLS.has(event.name)) tools.push(event.name);
    if (event?.tags?.includes(INTERNAL_LLM_TAG)) continue;
    if (event.event === "on_chat_model_stream" && typeof event.data?.chunk?.content === "string") {
      raw += event.data.chunk.content;
      const cleaned = stripToolCallMarkup(raw);
      if (cleaned.length > emitted) {
        emitted = cleaned.length;
        clean = cleaned;
      }
    }
  }

  return { tools, clean, ms: Date.now() - startedAt };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const doc = await DocumentModel.create({
    owner: OWNER,
    filename: "package-notes.txt",
    mimeType: "text/plain",
    detectedMimeType: "text/plain",
    size: 120,
    chunkCount: 1,
  });
  await indexDocument({
    text: "Project setup notes.\n\nOur package.json requires node >=20.11.0 and npm >=10.",
    ownerId: OWNER,
    documentId: doc._id.toString(),
    filename: "package-notes.txt",
  });

  console.log(`\n=== SVC-2 orchestrator (tool budget: ${MAX_TOOL_CALLS_PER_TURN}) ===\n`);

  const greeting = await run("hi");
  ok("FR-AGENT-04 greeting short-circuits, no tools", greeting.tools.length === 0, `${greeting.ms}ms`);

  const compound = await run(
    "Look up the current Node.js LTS version AND check what my uploaded documents require.",
  );
  const distinct = new Set(compound.tools);
  ok(
    "FR-AGENT-01/02/03 compound query uses >=2 DISTINCT tools",
    distinct.size >= 2,
    JSON.stringify([...distinct]),
  );
  ok("FR-AGENT-03 the loop terminated with an answer", compound.clean.length > 20);

  const code = await run("write a python function to reverse a list");
  ok("FR-AGENT-02 coding is a tool, not a route", code.tools.includes("write_code"));

  const cited = await run("what does my package-notes document say about npm?");
  ok(
    "FR-AGENT-07 answer cites the retrieved chunk",
    /package-notes\.txt/i.test(cited.clean),
    cited.clean.slice(0, 60).replace(/\s+/g, " "),
  );

  const restricted = await run("What does my uploaded document say about node?", ["web_search"]);
  ok(
    "FR-AGENT-05 allowlist blocks a tool for this session",
    !restricted.tools.includes("search_my_documents"),
    JSON.stringify(restricted.tools),
  );

  const listed = await run("What files or documents do I have uploaded?");
  ok(
    "list_my_documents names the actual file",
    listed.tools.includes("list_my_documents") && /package-notes\.txt/i.test(listed.clean),
    listed.clean.slice(0, 60).replace(/\s+/g, " "),
  );

  const readUrl = await run("Read https://nodejs.org/en/about/previous-releases and tell me the current LTS codename.");
  ok(
    "read_url fetches a specific page without a web_search round-trip first",
    readUrl.tools.includes("read_url"),
    JSON.stringify(readUrl.tools),
  );

  const dated = await run("What is today's date?");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [year, , day] = todayIso.split("-");
  ok(
    "the orchestrator prompt carries today's date, no tool needed",
    dated.tools.length === 0 && dated.clean.includes(year) && dated.clean.includes(String(Number(day))),
    dated.clean.slice(0, 60),
  );

  const debugCase = await run(
    "debug this: function fib(n){ if(n<=1)return n; return fib(n-1)+fib(n-2) } why is it slow and fix it",
  );
  ok(
    "FR-AGENT-02 even a request the orchestrator COULD answer itself still routes to write_code",
    debugCase.tools.includes("write_code"),
    JSON.stringify(debugCase.tools),
  );

  const noMarkup = [greeting, compound, code, cited, restricted, listed, readUrl, dated, debugCase].every(
    (r) => !r.clean.includes(FULLWIDTH_BAR) && !r.clean.includes("DSML"),
  );
  ok("no internal tool-call markup leaked into any answer", noMarkup);

  await deleteDocumentVectors(OWNER, doc._id.toString());
  await DocumentModel.deleteOne({ _id: doc._id });
  await mongoose.disconnect();
  console.log("\ncleaned up.\n");
};

main().catch(async (error) => {
  console.error("VERIFY FAILED:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
