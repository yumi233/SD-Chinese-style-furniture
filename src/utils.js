function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

module.exports = {
  sleep,
  toDataUrl,
  safeJsonParse,
};
