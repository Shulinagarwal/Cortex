
const path = require("path");
const Module = require("module");

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-api-secret";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const BACKEND_ROOT = path.join(__dirname, "..", "..");
const resolve = (relative) => require.resolve(path.join(BACKEND_ROOT, relative));

const stubModule = (relative, exports) => {
  const filename = resolve(relative);
  const stub = new Module(filename, null);
  stub.filename = filename;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[filename] = stub;
};

class FakeModel {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.calls = [];
  }

  _record(op, filter) {
    this.calls.push({ op, filter });
  }

  static _matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => String(row[key]) === String(value));
  }

  async create(doc) {
    const row = { _id: doc._id || `id_${this.rows.length + 1}_${this.name}`, ...doc };
    Object.defineProperty(row, "save", {
      enumerable: false,
      value: async () => row,
    });
    this.rows.push(row);
    return row;
  }

  async findByIdAndUpdate(id, update) {
    this._record("findByIdAndUpdate", { _id: id });
    const row = this.rows.find((candidate) => String(candidate._id) === String(id));
    if (row) Object.assign(row, update);
    return row || null;
  }

  async findByIdAndDelete(id) {
    this._record("findByIdAndDelete", { _id: id });
    const index = this.rows.findIndex((row) => String(row._id) === String(id));
    if (index === -1) return null;
    return this.rows.splice(index, 1)[0];
  }

  async findOne(filter) {
    this._record("findOne", filter);
    return this.rows.find((row) => FakeModel._matches(row, filter)) || null;
  }

  async findOneAndDelete(filter) {
    this._record("findOneAndDelete", filter);
    const index = this.rows.findIndex((row) => FakeModel._matches(row, filter));
    if (index === -1) return null;
    return this.rows.splice(index, 1)[0];
  }

  async deleteMany(filter) {
    this._record("deleteMany", filter);
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !FakeModel._matches(row, filter));
    return { deletedCount: before - this.rows.length };
  }

  find(filter) {
    this._record("find", filter);
    const results = this.rows.filter((row) => FakeModel._matches(row, filter));
    const chain = {
      sort: () => chain,
      select: () => chain,
      then: (onFulfilled, onRejected) => Promise.resolve(results).then(onFulfilled, onRejected),
    };
    return chain;
  }
}

const defaultMemoryQdrant = {
  embed: async () => [0.1, 0.2, 0.3],
  upsertFact: async () => {},
  searchByVector: async () => [],
  listFacts: async () => [],
  deleteFacts: async () => {},
  isConfigured: () => false,
};

const buildTestApp = ({
  authenticatedUser = { _id: "user_a" },
  cortexAgentApp = { streamEvents: async function* () {} },
  memoryQdrant = {},
} = {}) => {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BACKEND_ROOT) && !key.includes("node_modules")) delete require.cache[key];
  }

  const models = {
    Chat: new FakeModel("Chat"),
    Message: new FakeModel("Message"),
    User: new FakeModel("User"),
    Document: new FakeModel("Document"),
    UserMemoryState: new FakeModel("UserMemoryState"),
  };

  stubModule("src/modules/chat/chat.model.js", models.Chat);
  stubModule("src/modules/message/message.model.js", models.Message);
  stubModule("src/modules/user/user.model.js", models.User);
  stubModule("src/modules/document/document.model.js", models.Document);
  stubModule("src/modules/memory/userMemoryState.model.js", models.UserMemoryState);

  stubModule("src/modules/auth/passport.js", {
    initialize: () => (_req, _res, next) => next(),
    session: () => (_req, _res, next) => next(),
    authenticate: () => (_req, _res, next) => next(),
  });

  stubModule("src/shared/middleware/auth.middleware.js", {
    isAuthenticated: (req, res, next) => {
      if (!authenticatedUser) {
        return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "No token." } });
      }
      req.user = authenticatedUser;
      return next();
    },
    restrictedto: () => (_req, _res, next) => next(),
  });

  stubModule("src/agents/graph.js", {
    getCortexAgentApp: () => cortexAgentApp,
  });
  stubModule("src/agents/modelConfig.js", { getAgentModel: () => ({ invoke: async () => ({ content: "Title" }) }) });
  stubModule("src/modules/document/qdrant.service.js", {
    indexDocument: async () => 3,
    deleteDocumentVectors: async () => {},
  });
  stubModule("src/modules/document/fileStorage.service.js", {
    storeFile: async () => "fake-storage-id",
    streamFileTo: async () => {},
    deleteFile: async () => {},
  });
  stubModule("src/modules/memory/memoryQdrant.service.js", { ...defaultMemoryQdrant, ...memoryQdrant });

  const { createApp } = require(resolve("src/app.js"));
  return { app: createApp(), models };
};

module.exports = { buildTestApp, FakeModel };
