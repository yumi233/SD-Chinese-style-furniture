function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function readErrorDetails(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function createProviderError(message, response, details) {
  const error = new Error(`${message}: ${response.status}`);
  error.statusCode = response.status;
  error.details = details;
  return error;
}

module.exports = {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
};
