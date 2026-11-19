const HIGHLIGHT_DIRECTION = "Give each piece exactly one memorable design feature that serves its structure or use. Refine the feature requested in the brief or revision. Otherwise choose one: a continuous bent member spanning an arm and leg, an enlarged exposed working joint, a single functional contrast in cane, stone, brass or color lacquer, a supported cantilever or asymmetric volume, or a cutout that defines the silhouette. Keep secondary details quiet. Preserve requested dark wood, joinery and traditional silhouettes. Use contemporary proportions, clean new finishes and a present-day setting.";

const IMAGE_DIRECTION = "Choose a deliberate furniture-led composition and directional light that reveal the chosen feature. Consider side lighting, defined shadows or a distinct background color suited to the brief. Vary the setting and palette. Avoid the generic white-wall, tree-shadow and pale-wood formula.";

const STYLE_DIRECTION = {
  ming: "Keep the Ming silhouette and slender proportions. Let a working joint or continuous structural line carry the design. Rich dark timber is welcome.",
  newChinese: "Use contemporary massing with a Chinese construction cue. Let one functional material junction or supported asymmetric volume carry the design.",
  song: "Keep the economical outline and legible frame. Let one precisely shaped void or rhythmic structural connection carry the design.",
  zen: "Keep the form quiet and grounded. Let a single suspended plane, functional material inset or purposeful opening carry the design.",
};

function designDirection(style) {
  const styleDirection = Object.hasOwn(STYLE_DIRECTION, style) ? STYLE_DIRECTION[style] : "";
  return [HIGHLIGHT_DIRECTION, styleDirection, IMAGE_DIRECTION].filter(Boolean).join(" ");
}

module.exports = { HIGHLIGHT_DIRECTION, IMAGE_DIRECTION, designDirection };
