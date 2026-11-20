const { createHash } = require("node:crypto");

const HIGHLIGHT_DIRECTION = "Give each piece exactly one memorable design feature that serves its structure or use. Specify its precise component location, how its shape differs from the usual construction, and the use or support made visible by that change. Refine the feature requested in the brief or revision. Examples include mating half-ring pulls at the door seam with a visible finger gap, or a bent arm continuing down to the floor as its front support. A standard curved back rail, inset slab legs or ordinary slatted doors alone are insufficient. Keep secondary details quiet. Preserve requested timber color, joinery and traditional silhouettes. Use contemporary proportions and clean new finishes.";

const WHITE_BACKDROP = "seamless pure white studio backdrop";
const SOFT_LIGHT = "soft studio lighting with a soft contact shadow only";
const PRODUCT_PHOTO_DIRECTION = "Render the complete furniture centered on a seamless pure white studio backdrop, with clear white margins on every side and a soft contact shadow only. Keep the furniture unobstructed. Use soft studio lighting, with soft side light if it clarifies the design, and keep the background pure white. Treat any room, furnishing, scene, time of day, weather or lighting phrase in the brief as use context only: wording such as tea room, morning light, sunlight, window light or an outdoor setting never changes the pure white backdrop or the studio lighting. Do not depict a room, windows, plants, rugs, tableware, books, people or other props.";
const CAMERA_DIRECTION = "Choose the angle based on the feature: near front for a door seam, front three-quarter for an arm flowing into a leg, and both ends in frame for asymmetric supports. Keep the feature visible within the frame of the whole piece.";
const PARENT_FRAMING_DIRECTION = "Replace the entire scene with pure white and remove all props, including outside the selected region. Preserve the original camera angle where it keeps the complete furniture centered and unobstructed. Adjust framing only as needed to meet the product presentation.";

const STYLE_DIRECTION = {
  ming: "Keep the Ming silhouette and slender proportions. Let a working joint or continuous structural line carry the design.",
  newChinese: "Use contemporary massing with a Chinese construction cue. Let one functional material junction or supported asymmetric volume carry the design.",
  song: "Keep the economical outline and legible frame. Let one precisely shaped void or rhythmic structural connection carry the design.",
  zen: "Keep the form quiet and grounded. Let a single suspended plane, functional material inset or purposeful opening carry the design.",
};

const FRAMING = [
  "eye-level framing with the whole piece in view",
  "front three-quarter framing showing the nearest joint clearly",
  "near-front framing when it reveals the feature, with room around the full silhouette",
  "slightly raised framing when useful for revealing the top and both supports",
];

function photographyDirection(brief = "", caseIndex) {
  // The benchmark uses the fixed case order. Live revisions keep the original brief as the key.
  const index = Number.isInteger(caseIndex) && caseIndex >= 0
    ? caseIndex
    : createHash("sha256").update(brief).digest()[0];
  return {
    scene: WHITE_BACKDROP,
    lighting: SOFT_LIGHT,
    framing: FRAMING[index % FRAMING.length],
  };
}

function designDirection(style, photography = photographyDirection()) {
  const styleDirection = Object.hasOwn(STYLE_DIRECTION, style) ? STYLE_DIRECTION[style] : "";
  return [HIGHLIGHT_DIRECTION, styleDirection, PRODUCT_PHOTO_DIRECTION, CAMERA_DIRECTION, "Framing: " + photography.framing + "."].filter(Boolean).join(" ");
}

module.exports = { HIGHLIGHT_DIRECTION, PRODUCT_PHOTO_DIRECTION, PARENT_FRAMING_DIRECTION, designDirection, photographyDirection };
