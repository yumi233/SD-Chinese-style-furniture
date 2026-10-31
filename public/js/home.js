import "./modules/dock.js";
import {
  createSettings,
  mountAsciiField,
  updateFilterSettings,
} from "./modules/ascii-field.js";

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = () => reduceMotionQuery.matches;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("主视觉素材读取失败")), { once: true });
    image.src = source;
  });
}

const promptForm = document.getElementById("heroPromptForm");
const promptInput = document.getElementById("homePrompt");
const stepHost = document.getElementById("stepField");
const granularityRange = document.getElementById("granularityRange");
const granularityValue = document.getElementById("granularityValue");
const disintegrateRange = document.getElementById("disintegrateRange");
const disintegrateValue = document.getElementById("disintegrateValue");
const stepFilterButtons = [...document.querySelectorAll("[data-step-filter]")];
const cropDemo = document.getElementById("cropDemo");
const cropCanvas = document.getElementById("chairCropCanvas");
const cropFrame = document.getElementById("cropFrame");
const refineBubble = document.getElementById("refineBubble");
const refineButton = document.getElementById("refineButton");
const refineVersion = document.getElementById("refineVersion");
const refineStatus = document.getElementById("refineStatus");
const refineDither = document.getElementById("refineDither");
const growthRings = document.getElementById("growthRings");

let heroImage;
try {
  heroImage = await loadImage("/assets/hero-meadow.png");
} catch (error) {
  document.body.dataset.error = error.message;
}

const heroField = mountAsciiField(document.getElementById("heroField"), {
  source: heroImage,
  look: "paper",
  titleZone: { x: 0.02, y: 0.62, w: 0.54, h: 0.32 },
  drift: true,
  ripple: true,
  settings: createSettings({ filter: "ascii" }),
});

let stepSettings = createSettings({ filter: "ascii" });
stepSettings = updateFilterSettings(stepSettings, {
  ascii: { strength: Number(granularityRange.value) },
  dither: {
    strength: Number(granularityRange.value),
    mask: 52,
    size: 45,
    spacing: 12,
  },
});
const stepField = mountAsciiField(stepHost, {
  source: heroImage,
  look: "paper",
  drift: false,
  ripple: true,
  settings: stepSettings,
});

function studioPromptUrl(value) {
  const prompt = String(value || "").trim();
  return prompt ? `/studio?prompt=${encodeURIComponent(prompt)}` : "/studio";
}

promptForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput?.value.trim() || "";
  if (!prompt) {
    promptInput?.focus();
    return;
  }
  window.location.assign(studioPromptUrl(prompt));
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!promptInput) return;
    promptInput.value = button.dataset.prompt || "";
    promptInput.focus();
    promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
  });
});

function setGranularity(value) {
  const amount = Number(value);
  granularityValue.textContent = String(amount);
  stepSettings = updateFilterSettings(stepSettings, {
    ascii: { strength: amount },
    dither: { strength: amount },
  });
  stepField.setSettings(stepSettings);
}

granularityRange?.addEventListener("input", () => setGranularity(granularityRange.value));

let scatterTimers = [];
function scatterFrom(value) {
  const amount = Number(value);
  if (!amount || reducedMotion()) return;
  scatterTimers.forEach((timer) => window.clearTimeout(timer));
  scatterTimers = [];
  const rect = stepHost.getBoundingClientRect();
  const count = Math.max(1, Math.min(3, Math.round(amount / 34)));
  for (let index = 0; index < count; index += 1) {
    scatterTimers.push(window.setTimeout(() => {
      const offset = (index - (count - 1) / 2) * rect.width * 0.16;
      stepHost.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.52 + offset,
        clientY: rect.top + rect.height * 0.5,
        pointerType: "touch",
      }));
    }, index * 72));
  }
}

disintegrateRange?.addEventListener("input", () => {
  disintegrateValue.textContent = disintegrateRange.value;
  scatterFrom(disintegrateRange.value);
});

stepFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stepSettings = updateFilterSettings(stepSettings, { filter: button.dataset.stepFilter });
    stepField.setSettings(stepSettings);
    stepFilterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  });
});

function drawChairCrop() {
  if (!heroImage || !cropCanvas) return null;
  const source = { x: 470, y: 135, width: 1066, height: 720 };
  cropCanvas.width = source.width;
  cropCanvas.height = source.height;
  const context = cropCanvas.getContext("2d");
  context.drawImage(
    heroImage,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );
  return cropCanvas;
}

const chairCrop = drawChairCrop();
let refineField = null;
if (chairCrop) {
  refineField = mountAsciiField(refineDither, {
    source: chairCrop,
    look: "overlay",
    settings: {
      filter: "dither",
      mask: 34,
      palette: "meadow",
      inkTone: "dark",
      strength: 78,
      size: 38,
      spacing: 16,
    },
  });
}

const framePosition = { x: 0.5, y: 0.22, width: 0.34, height: 0.48 };
let frameDrag = null;

function applyFramePosition() {
  if (!cropFrame) return;
  cropFrame.style.left = `${framePosition.x * 100}%`;
  cropFrame.style.top = `${framePosition.y * 100}%`;
  cropFrame.style.width = `${framePosition.width * 100}%`;
  cropFrame.style.height = `${framePosition.height * 100}%`;
}

function revealRefineBubble() {
  if (!refineBubble || !cropDemo || !cropFrame) return;
  refineBubble.hidden = false;
  const stage = cropDemo.getBoundingClientRect();
  const bubbleWidth = refineBubble.offsetWidth || 132;
  const left = Math.min(
    stage.width - bubbleWidth - 12,
    Math.max(12, cropFrame.offsetLeft + cropFrame.offsetWidth + 12),
  );
  const top = Math.min(
    stage.height - refineBubble.offsetHeight - 12,
    Math.max(12, cropFrame.offsetTop + cropFrame.offsetHeight - 4),
  );
  refineBubble.style.left = `${left}px`;
  refineBubble.style.top = `${top}px`;
  refineStatus.textContent = "已选择区域，可以改为更薄";
}

function moveFrameWithinStage(nextX, nextY) {
  framePosition.x = Math.max(0, Math.min(1 - framePosition.width, nextX));
  framePosition.y = Math.max(0, Math.min(1 - framePosition.height, nextY));
  applyFramePosition();
}

cropFrame?.addEventListener("pointerdown", (event) => {
  const rect = cropDemo.getBoundingClientRect();
  frameDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: framePosition.x,
    originY: framePosition.y,
    width: rect.width,
    height: rect.height,
  };
  cropFrame.setPointerCapture?.(event.pointerId);
  refineBubble.hidden = true;
  event.preventDefault();
});

cropFrame?.addEventListener("pointermove", (event) => {
  if (!frameDrag || frameDrag.pointerId !== event.pointerId) return;
  moveFrameWithinStage(
    frameDrag.originX + (event.clientX - frameDrag.startX) / frameDrag.width,
    frameDrag.originY + (event.clientY - frameDrag.startY) / frameDrag.height,
  );
});

cropFrame?.addEventListener("pointerup", (event) => {
  if (!frameDrag || frameDrag.pointerId !== event.pointerId) return;
  frameDrag = null;
  revealRefineBubble();
});

cropFrame?.addEventListener("pointercancel", () => {
  frameDrag = null;
});

cropFrame?.addEventListener("focus", revealRefineBubble);
cropFrame?.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 0.04 : 0.012;
  const deltas = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  if (!deltas[event.key]) return;
  event.preventDefault();
  moveFrameWithinStage(
    framePosition.x + deltas[event.key][0],
    framePosition.y + deltas[event.key][1],
  );
  revealRefineBubble();
});

let refining = false;
refineButton?.addEventListener("click", () => {
  if (refining || !refineVersion || !refineDither) return;
  refining = true;
  refineVersion.textContent = "v2";
  refineStatus.textContent = "已改为更薄，正在重新显影";
  refineButton.disabled = true;
  refineButton.textContent = "已改为更薄";
  refineDither.classList.add("is-visible");
  refineField?.setSettings({
    filter: "dither",
    dither: {
      filter: "dither",
      mask: 28,
      palette: "meadow",
      inkTone: "dark",
      strength: 84,
      size: 34,
      spacing: 10,
    },
  });
  window.setTimeout(() => {
    refineDither.classList.remove("is-visible");
    refineButton.disabled = false;
    refineButton.textContent = "再薄一点";
    refining = false;
  }, reducedMotion() ? 220 : 900);
});

applyFramePosition();

function revealGrowthRings() {
  growthRings?.classList.add("is-visible");
}

if (growthRings) {
  if (reducedMotion() || typeof IntersectionObserver !== "function") {
    revealGrowthRings();
  } else {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      revealGrowthRings();
      observer.disconnect();
    }, { threshold: 0.32 });
    observer.observe(growthRings);
  }
  reduceMotionQuery.addEventListener?.("change", (event) => {
    if (event.matches) revealGrowthRings();
  });
}

window.mushengHome = {
  heroField,
  stepField,
  getRefineField: () => refineField,
  studioPromptUrl,
};

requestAnimationFrame(() => {
  document.body.dataset.ready = "true";
});
