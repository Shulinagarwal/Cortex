const express = require("express");
const multer = require("multer");
const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const { validate } = require("../../shared/middleware/validate.middleware");
const { idParamSchema } = require("../../shared/validation/common.schema");
const { fileTypeGuard } = require("./fileTypeGuard.middleware");
const { sendError } = require("../../shared/utils/apiError");
const {
  handleUploadDocument,
  handleGetDocuments,
  handleDeleteDocument,
  handleGetDocumentContent,
} = require("./document.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["application/pdf", "text/plain"];
    if (allowedTypes.includes(file.mimetype)) return callback(null, true);
    const error = new Error("Only PDF and TXT files are supported.");
    error.isFileFilterRejection = true;
    return callback(error);
  },
});

router.use(isAuthenticated);
router.get("/", handleGetDocuments);
router.post("/upload", upload.single("file"), fileTypeGuard, handleUploadDocument);
router.get("/:id/content", validate({ params: idParamSchema }), handleGetDocumentContent);
router.delete("/:id", validate({ params: idParamSchema }), handleDeleteDocument);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 400, "FILE_TOO_LARGE", "Document upload failed: file must be 10 MB or smaller.");
    }
    return sendError(res, 400, "UPLOAD_FAILED", "Document upload failed.");
  }
  if (error?.isFileFilterRejection) {
    return sendError(res, 400, "UNSUPPORTED_FILE_TYPE", error.message);
  }
  return next(error);
});

module.exports = router;
