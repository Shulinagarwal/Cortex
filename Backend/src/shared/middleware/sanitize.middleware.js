const FORBIDDEN_KEY = /[$.]/;

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const MAX_DEPTH = 20;

const sanitizeValue = (input, depth = 0, path = "", removed = []) => {
  if (depth > MAX_DEPTH || input === null || typeof input !== "object") {
    return { value: input, removed };
  }

  if (Array.isArray(input)) {
    const value = input.map(
      (item, i) => sanitizeValue(item, depth + 1, `${path}[${i}]`, removed).value,
    );
    return { value, removed };
  }

  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    return { value: input, removed };
  }

  const value = {};
  for (const key of Object.keys(input)) {
    const keyPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_KEY.test(key) || PROTO_KEYS.has(key)) {
      removed.push(keyPath);
      continue;
    }

    value[key] = sanitizeValue(input[key], depth + 1, keyPath, removed).value;
  }
  return { value, removed };
};

const replaceOn = (req, key, value) => {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

const sanitizeRequest = (req, _res, next) => {
  const removed = [];

  for (const key of ["body", "query", "params"]) {
    const current = req[key];
    if (current === undefined || current === null || typeof current !== "object") continue;

    const result = sanitizeValue(current, 0, key, removed);
    replaceOn(req, key, result.value);
  }

  req.sanitizedKeys = removed;
  next();
};

module.exports = { sanitizeRequest, sanitizeValue, MAX_DEPTH };
