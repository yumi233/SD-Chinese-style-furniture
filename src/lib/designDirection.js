const { createHash } = require("node:crypto");

const HIGHLIGHT_DIRECTION = "Give each piece exactly one memorable design feature that serves its structure or use. Specify its precise component location, how its shape differs from the usual construction, and the use or support made visible by that change. Refine the feature requested in the brief or revision. Examples include mating half-ring pulls at the door seam with a visible finger gap, or a bent arm continuing down to the floor as its front support. A standard curved back rail, inset slab legs or ordinary slatted doors alone are insufficient. Keep secondary details quiet. Preserve requested timber color, joinery and traditional silhouettes. Use contemporary proportions and clean new finishes.";

const IMAGE_DIRECTION = "The user's specified setting, light and camera take priority. Use the planned scene, lighting and framing as independent defaults. Choose the angle based on the feature: near front for a door seam, front three-quarter for an arm flowing into a leg, and both ends in frame for asymmetric supports. Keep the changed part and the visible use unobstructed. Pair dark timber with mid-light or light walls and soft fill so its edges stay readable. Use dark-on-dark presentation only when requested.";

const STYLE_DIRECTION = {
  ming: "Keep the Ming silhouette and slender proportions. Let a working joint or continuous structural line carry the design.",
  newChinese: "Use contemporary massing with a Chinese construction cue. Let one functional material junction or supported asymmetric volume carry the design.",
  song: "Keep the economical outline and legible frame. Let one precisely shaped void or rhythmic structural connection carry the design.",
  zen: "Keep the form quiet and grounded. Let a single suspended plane, functional material inset or purposeful opening carry the design.",
};

const SCENES = [
  "light gray contemporary study with clear surfaces",
  "warm off-white contemporary dining room with a warm neutral floor",
  "contemporary home with a muted pale clay or sage wall",
  "bright neutral design studio with a light background",
];
const LIGHTING = [
  "broad diffuse daylight with soft shadow edges",
  "even bounced window light with gentle fill",
  "soft directional daylight with a lit background and readable joinery",
  "bright neutral studio light with soft fill and a restrained contact shadow",
];
const FRAMING = [
  "eye-level framing with the whole piece in view",
  "front three-quarter framing showing the nearest joint clearly",
  "near-front framing when it reveals the feature, with room around the full silhouette",
  "slightly raised framing when useful for revealing the top and both supports",
];

function photographyDirection(brief = "", caseIndex) {
  // The benchmark uses the fixed case order. Live revisions keep the original brief as the key.
  const indices = Number.isInteger(caseIndex) && caseIndex >= 0
    ? [caseIndex, 3 * caseIndex + Math.floor(caseIndex / 4), 2 * caseIndex + Math.floor(caseIndex / 3)]
    : createHash("sha256").update(brief).digest().subarray(0, 3);
  return {
    scene: SCENES[indices[0] % SCENES.length],
    lighting: LIGHTING[indices[1] % LIGHTING.length],
    framing: FRAMING[indices[2] % FRAMING.length],
  };
}

function designDirection(style, photography = photographyDirection()) {
  const styleDirection = Object.hasOwn(STYLE_DIRECTION, style) ? STYLE_DIRECTION[style] : "";
  const plan = "Scene: " + photography.scene + ". Lighting: " + photography.lighting + ". Framing: " + photography.framing + ".";
  return [HIGHLIGHT_DIRECTION, styleDirection, IMAGE_DIRECTION, plan].filter(Boolean).join(" ");
}

module.exports = { HIGHLIGHT_DIRECTION, designDirection, photographyDirection };
