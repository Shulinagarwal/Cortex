const { PDFParse } = require("pdf-parse");

const extractText = async (file) => {
  const type = file.detectedMimeType;
  if (!type) {
    throw new Error("File type was not verified before extraction.");
  }
  if (type === "text/plain") {
    return file.buffer.toString("utf8");
  }
  const parser = new PDFParse({ data: file.buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
};

module.exports = { extractText };
