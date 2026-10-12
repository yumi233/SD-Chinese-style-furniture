// Loads every knowledge file into one list. Files are split by purpose so
// editors can find things: entries.json (forms, cues, materials, scenes, sizes,
// anti-patterns), methods.json (form translation moves), motifs.json (sources
// outside furniture) and cases.json (contemporary cases, extra forms, materials).
const FILES = ["entries.json", "methods.json", "motifs.json", "cases.json"];

const entries = FILES.flatMap((file) => require(`./${file}`).entries.map((entry) => ({ ...entry, file })));

module.exports = {
  FILES,
  entries,
};
