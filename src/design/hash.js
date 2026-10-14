// 32-bit FNV-1a. Stable for any input length: the previous `sum * 31 + code`
// overflowed to Infinity on long prompts, and `Infinity >>> 0` is 0, so every
// long request picked the same design method.
function stableHash(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pickStable(list, key) {
  if (!list.length) return null;
  return list[stableHash(key) % list.length];
}

module.exports = {
  pickStable,
  stableHash,
};
