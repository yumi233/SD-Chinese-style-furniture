function dispatchModelRequest(url, options, onDispatch) {
  const endpoint = new URL(url);
  if (!/^https?:$/.test(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("Model endpoint must use HTTP or HTTPS without URL credentials.");
  options.signal?.throwIfAborted();
  onDispatch?.();
  return fetch(url, options);
}

module.exports = { dispatchModelRequest };
