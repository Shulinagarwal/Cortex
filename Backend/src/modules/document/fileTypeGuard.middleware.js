const { ApiError } = require("../../shared/utils/apiError");

let fileTypeModule = null;
const loadFileType = async () => {
  if (!fileTypeModule) fileTypeModule = await import("file-type");
  return fileTypeModule;
};

const ACCEPTED_BINARY_MIME = new Set(["application/pdf"]);

const looksLikePlainText = (buffer) => {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0x00)) return false;

  const decoded = sample.toString("utf8");
  if (decoded.includes("\uFFFD")) return false;

  let control = 0;
  for (const char of decoded) {
    const code = char.codePointAt(0);
    const isAllowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    if (!isAllowedWhitespace && (code < 0x20 || code === 0x7f)) control += 1;
  }
  return control / decoded.length < 0.05;
};

const sanitizeFilename = (rawName) => {
  const fallback = "upload";
  if (typeof rawName !== "string" || rawName.trim() === "") return fallback;

  const base = rawName.split(/[/\\]/).pop() || "";

  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._\- ]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+/, "")
    .trim();

  if (cleaned === "" || cleaned === ".") return fallback;
  return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
};

const detectAcceptedType = async (buffer) => {
  const { fileTypeFromBuffer } = await loadFileType();
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    if (ACCEPTED_BINARY_MIME.has(detected.mime)) return detected.mime;
    throw new ApiError(
      400,
      "UNSUPPORTED_FILE_TYPE",
      `This file is a ${detected.ext.toUpperCase()} file, not a PDF or text file. ` +
        `Only PDF and plain-text uploads are supported.`,
    );
  }

  if (looksLikePlainText(buffer)) return "text/plain";

  throw new ApiError(
    400,
    "UNSUPPORTED_FILE_TYPE",
    "This file's contents are not a PDF or readable text. Only PDF and plain-text uploads are supported.",
  );
};

const fileTypeGuard = async (req, _res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, "FILE_REQUIRED", "Upload a PDF or TXT file.");
    }
    req.file.detectedMimeType = await detectAcceptedType(req.file.buffer);
    req.file.safeFilename = sanitizeFilename(req.file.originalname);
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { fileTypeGuard, detectAcceptedType, sanitizeFilename, looksLikePlainText };
