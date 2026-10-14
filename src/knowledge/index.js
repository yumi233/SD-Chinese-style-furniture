// Loads every knowledge file into one list. Files are split by purpose so
// editors can find things: entries.json (forms, cues, materials, scenes, sizes,
// anti-patterns), methods.json (form translation moves), motifs.json (sources
// outside furniture), cases.json (contemporary cases, extra forms, materials)
// and song.json (the contemporary Song-inspired direction).
//
// Every entry carries `evidence`: "sourced" when it cites at least one source,
// otherwise "heuristic" (a design rule of thumb awaiting validation). Real
// furniture cases live separately in realCases.json and are never mixed with
// heuristics or AI-generated images.
const FILES = ["entries.json", "methods.json", "motifs.json", "cases.json", "song.json"];

const entries = FILES.flatMap((file) => require(`./${file}`).entries.map((entry) => ({
  ...entry,
  evidence: entry.evidence || (entry.sources?.length ? "sourced" : "heuristic"),
  file,
})));

module.exports = {
  FILES,
  entries,
};
