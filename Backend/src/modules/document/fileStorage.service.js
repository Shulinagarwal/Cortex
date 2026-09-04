const mongoose = require("mongoose");
const { Readable } = require("stream");

const BUCKET_NAME = "fileStorage";

const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("Mongo connection is not established yet.");
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
};

const storeFile = (buffer, filename, contentType) =>
  new Promise((resolve, reject) => {
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType });
    Readable.from(buffer)
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id));
  });

const streamFileTo = (fileId, res) => {
  const bucket = getBucket();
  return new Promise((resolve, reject) => {
    bucket
      .openDownloadStream(fileId)
      .on("error", reject)
      .on("end", resolve)
      .pipe(res);
  });
};

const deleteFile = async (fileId) => {
  const bucket = getBucket();
  try {
    await bucket.delete(fileId);
  } catch (error) {
    if (!/file.*not found/i.test(error.message)) throw error;
  }
};

module.exports = { storeFile, streamFileTo, deleteFile };
