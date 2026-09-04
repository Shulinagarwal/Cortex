const Document = require("./document.model");
const { extractText } = require("./document.service");
const { sendError } = require("../../shared/utils/apiError");
const {
  indexDocument,
  deleteDocumentVectors,
} = require("./qdrant.service");
const { storeFile, streamFileTo, deleteFile } = require("./fileStorage.service");

const handleUploadDocument = async (req, res) => {
  try {
    const text = await extractText(req.file);
    if (!text.trim()) {
      return sendError(res, 400, "NO_TEXT_FOUND", "No readable text was found in this document.");
    }

    const storageId = await storeFile(req.file.buffer, req.file.safeFilename, req.file.detectedMimeType);

    const document = await Document.create({
      owner: req.user._id,
      filename: req.file.safeFilename,
      mimeType: req.file.mimetype,
      detectedMimeType: req.file.detectedMimeType,
      size: req.file.size,
      chunkCount: 0,
      storageId,
    });

    try {
      const chunkCount = await indexDocument({
        text,
        ownerId: req.user._id.toString(),
        documentId: document._id.toString(),
        filename: document.filename,
      });

      document.chunkCount = chunkCount;
      await document.save();
      return res.status(201).json({
        msg: "Document uploaded and indexed successfully.",
        document,
      });
    } catch (error) {
      await Document.findByIdAndDelete(document._id);
      await deleteFile(storageId);
      throw error;
    }
  } catch (error) {
    console.error("Document upload failed:", error);
    return sendError(res, 500, "INDEXING_FAILED", "Could not index this document.");
  }
};

const handleGetDocumentContent = async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, owner: req.user._id });

  if (!document) {
    return sendError(res, 404, "NOT_FOUND", "File not found.");
  }
  if (!document.storageId) {
    return sendError(res, 404, "NO_CONTENT", "This file was uploaded before previews were supported.");
  }

  res.setHeader("Content-Type", document.detectedMimeType);
  res.setHeader("Content-Disposition", `inline; filename="${document.filename}"`);
  try {
    await streamFileTo(document.storageId, res);
  } catch (error) {
    console.error("Streaming file content failed:", error);
    if (!res.headersSent) sendError(res, 500, "STREAM_FAILED", "Could not load this file.");
  }
};

const handleGetDocuments = async (req, res) => {
  const documents = await Document.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .select("filename mimeType detectedMimeType size chunkCount storageId createdAt");
  return res.status(200).json({ documents });
};

const handleDeleteDocument = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });

  if (!document) {
    return sendError(res, 404, "NOT_FOUND", "Document not found.");
  }

  try {
    await deleteDocumentVectors(req.user._id.toString(), document._id.toString());
    if (document.storageId) await deleteFile(document.storageId);
    await Document.deleteOne({ _id: document._id });
    return res.status(200).json({ msg: "Deleted successfully." });
  } catch (error) {
    console.error("Document deletion failed:", error);
    return sendError(res, 500, "DELETE_FAILED", "Could not delete this file.");
  }
};

module.exports = {
  handleUploadDocument,
  handleGetDocuments,
  handleDeleteDocument,
  handleGetDocumentContent,
};
