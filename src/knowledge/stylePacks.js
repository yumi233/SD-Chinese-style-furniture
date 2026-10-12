// Style packs fix one new Chinese design direction (like an image "skill"):
// preferred cues and form moves, a prompt recipe, things to avoid and a review
// checklist. Reference images for each pack live outside Git (see
// src/styleReferences.js).
const { packs } = require("./stylePacks.json");

const BY_ID = new Map(packs.map((pack) => [pack.id, pack]));

function getStylePack(id) {
  return BY_ID.get(String(id || "")) || null;
}

function listStylePacks() {
  return packs.map(({ id, title, summary, checklist, fits }) => ({ id, title, summary, checklist, fits }));
}

module.exports = {
  getStylePack,
  listStylePacks,
};
