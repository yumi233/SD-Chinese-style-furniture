// Style profiles: what each style asks the image model for, what it must avoid,
// and how the reviewer should read "culture". The new Chinese profile is the
// default because the studio's users design contemporary furniture.

const DEFAULT_STYLE = "newChinese";

const STYLE_PROFILES = {
  newChinese: {
    label: "新中式",
    anchor: "contemporary new Chinese furniture design",
    // A prompt that already names the style keeps its own wording.
    anchorPattern: /new Chinese/i,
    positive: [
      "contemporary new Chinese furniture design",
      "simplified geometry and slender members",
      "keeps only one or two traditional Chinese cues, everything else modern",
      "mass-producible contemporary craftsmanship",
    ],
    negative: [
      "antique",
      "replica",
      "aged patina",
      "museum piece",
      "Qing dynasty palace furniture",
      "ornate carving",
      "heavy dark rosewood",
      "red lacquer with gold",
      "dragon and phoenix motifs",
      "cluttered traditional props",
    ],
    // Terms the reviewer or text model must not reintroduce into the prompt.
    banned: [
      /\bantique\b/gi,
      /\breplica\b/gi,
      /\baged patina\b/gi,
      /\bmuseum (?:piece|display|collection)\b/gi,
      /\b(?:Ming|Qing)[- ](?:dynasty|style)\b/gi,
      /\bornate(?:ly)? carv(?:ed|ing)\b/gi,
      /\bimperial\b/gi,
      /\bpalace\b/gi,
      /\bdragon\b/gi,
    ],
    cultureLabel: "文化转译",
    cultureRubric:
      "cultureAccuracy means cultural translation: is at least one traditional Chinese furniture cue recognisable, and is it abstracted with contemporary materials and proportions? Antique-looking replicas score low.",
    checksAntique: true,
  },
  ming: {
    label: "明式家具",
    anchor: "Ming-style Chinese furniture",
    // A prompt that already names the style keeps its own wording.
    anchorPattern: /\bMing\b/i,
    positive: [
      "Ming-style Chinese furniture",
      "restrained proportions and elegant silhouette",
      "mortise and tenon joinery",
    ],
    negative: ["Qing dynasty palace furniture", "ornate carving", "red lacquer with gold"],
    banned: [/\bQing[- ](?:dynasty|style)\b/gi, /\bpalace\b/gi],
    cultureLabel: "文化准确性",
    cultureRubric:
      "cultureAccuracy means faithfulness to Ming furniture form language: proportion, continuous lines, restrained decoration and correct members.",
    checksAntique: false,
  },
  // Contemporary Song-inspired: a direction of its own, not a Ming or Qing
  // reproduction and not blended with them.
  song: {
    label: "当代宋式",
    anchor: "contemporary Song-inspired furniture",
    // A prompt that already names the style keeps its own wording.
    anchorPattern: /\bSong\b/i,
    positive: [
      "contemporary Song-inspired furniture",
      "Song dynasty restraint: slender members, plain unornamented surfaces, thin tops, quiet proportions",
      "light natural finishes and generous empty space",
    ],
    negative: [
      "antique",
      "replica",
      "Ming or Qing reproduction",
      "ornate carving",
      "heavy dark hardwood",
      "saturated red and gold",
      "cluttered props",
    ],
    banned: [
      /\bantique\b/gi,
      /\breplica\b/gi,
      /\b(?:Ming|Qing)[- ](?:dynasty|style)\b/gi,
      /\bornate(?:ly)? carv(?:ed|ing)\b/gi,
      /\bpalace\b/gi,
    ],
    cultureLabel: "宋式气质",
    cultureRubric:
      "cultureAccuracy means contemporary Song character: slender members, plain surfaces, quiet proportions and empty space. Ming or Qing reproduction details (hoof feet, waisted tops, heavy carving) score low.",
    checksAntique: true,
  },
  zen: {
    label: "禅意空间",
    anchor: "zen inspired natural furniture",
    // A prompt that already names the style keeps its own wording.
    anchorPattern: /\bzen\b/i,
    positive: [
      "zen interior",
      "natural wood, linen and stone",
      "meditative composition",
    ],
    negative: ["ornate carving", "saturated colors", "cluttered props"],
    banned: [/\bpalace\b/gi],
    cultureLabel: "文化表达",
    cultureRubric:
      "cultureAccuracy means how well the piece conveys calm, natural materials and generous empty space.",
    checksAntique: false,
  },
};

// 0 = 偏传统, 100 = 偏当代.
const DEFAULT_MODERNITY = 60;

function getStyleProfile(style) {
  return STYLE_PROFILES[style] || STYLE_PROFILES[DEFAULT_STYLE];
}

function normalizeModernity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_MODERNITY;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function describeModernity(modernity) {
  if (modernity < 35) {
    return {
      label: "偏传统",
      genes: 2,
      hint: "keep two traditional cues, wood-led materials, proportions close to the classical archetype but without ornament",
    };
  }
  if (modernity < 70) {
    return {
      label: "平衡",
      genes: 1,
      hint: "keep one traditional cue, pair wood with one contemporary material, clean modern proportions",
    };
  }
  return {
    label: "偏当代",
    genes: 1,
    hint: "the traditional cue survives only as a silhouette or a single detail, contemporary materials and fabrication throughout",
  };
}

module.exports = {
  DEFAULT_STYLE,
  DEFAULT_MODERNITY,
  STYLE_PROFILES,
  getStyleProfile,
  normalizeModernity,
  describeModernity,
};
