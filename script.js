const styleTemplates = {
  ming:
    "Ming-style Chinese furniture, horseshoe-back armchair, mortise and tenon joinery, walnut wood texture, restrained proportions, elegant silhouette, premium studio photography",
  newChinese:
    "new Chinese furniture design, contemporary oriental aesthetics, warm wood grain, stone and wood pairing, soft layered lighting, refined interior styling",
  song:
    "Song dynasty aesthetics, calm tea room, subtle texture, light ink-like palette, minimal composition, quiet spatial rhythm, poetic atmosphere",
  zen:
    "zen interior scene, natural wood, linen and stone materials, meditative composition, diffused daylight, calm and airy atmosphere, contemplative mood",
};

const styleLabels = {
  ming: "\u660e\u5f0f\u5bb6\u5177",
  newChinese: "\u65b0\u4e2d\u5f0f",
  song: "\u5b8b\u97f5",
  zen: "\u7985\u610f\u7a7a\u95f4",
};

const qualityMap = {
  standard: "clean furniture form, clear structure",
  hd: "ultra detailed wood grain, high resolution, refined craftsmanship",
  ultra: "extremely detailed joinery, premium material texture, showroom-grade rendering",
};

const qualityLabels = {
  standard: "\u666e\u901a",
  hd: "\u9ad8\u6e05",
  ultra: "\u8d85\u7cbe\u7ec6",
};

const rerollVariants = [
  {
    key: "same",
    label: "\u540c\u53c2\u6570\u91cd\u8dd1",
    promptSuffix: "",
    moodDelta: 0,
  },
  {
    key: "angle",
    label: "\u6362\u4e2a\u89d2\u5ea6",
    promptSuffix: "alternate camera angle, slightly changed perspective, refined product framing",
    moodDelta: 4,
  },
  {
    key: "lighting",
    label: "\u66f4\u5f3a\u5149\u5f71",
    promptSuffix: "stronger light contrast, richer shadow layering, more dramatic atmosphere",
    moodDelta: 10,
  },
  {
    key: "minimal",
    label: "\u66f4\u514b\u5236\u9648\u8bbe",
    promptSuffix: "cleaner staging, more negative space, reduced surrounding props, minimalist styling",
    moodDelta: -8,
  },
];

const translationDictionary = [
  ["中式家具", "Chinese furniture"],
  ["新中式", "new Chinese style"],
  ["明式", "Ming style"],
  ["宋韵", "Song dynasty aesthetic"],
  ["禅意", "zen atmosphere"],
  ["圈椅", "round-back armchair"],
  ["官帽椅", "official hat chair"],
  ["罗汉床", "daybed"],
  ["茶桌", "tea table"],
  ["茶室", "tea room"],
  ["边几", "side table"],
  ["条案", "console table"],
  ["木作", "wood craftsmanship"],
  ["榫卯结构", "mortise and tenon joinery"],
  ["榫卯", "mortise and tenon"],
  ["黑胡桃木", "black walnut wood"],
  ["胡桃木", "walnut wood"],
  ["红木", "rosewood"],
  ["原木", "natural wood"],
  ["木纹细节", "detailed wood grain"],
  ["产品摄影", "product photography"],
  ["产品定妆图", "hero product shot"],
  ["室内设计", "interior design"],
  ["极简", "minimalist"],
  ["留白", "negative space"],
  ["留白克制", "restrained negative space"],
  ["素雅", "elegant and understated"],
  ["高级感", "premium aesthetic"],
  ["高级产品摄影", "high-end product photography"],
  ["工作室打光", "studio lighting"],
  ["自然光影", "natural light and shadow"],
  ["晨光", "morning sunlight"],
  ["晨光斜照", "diagonal morning sunlight"],
  ["斜照", "diagonal sunlight"],
  ["柔和光线", "soft lighting"],
  ["暖色调", "warm tone"],
  ["暖光", "warm lighting"],
  ["阴影层次", "layered shadows"],
  ["干净背景", "clean background"],
  ["米白墙面", "neutral beige wall"],
  ["空间陈设", "interior styling"],
  ["简洁构图", "clean composition"],
  ["构图", "composition"],
  ["真实材质", "realistic material texture"],
  ["真实纹理", "realistic texture"],
  ["写实", "photorealistic"],
  ["超精细", "ultra detailed"],
  ["高清", "high resolution"],
  ["单品", "single furniture piece"],
  ["一把椅子", "single chair"],
  ["一张椅子", "single chair"],
  ["一张桌子", "single table"],
  ["展示图", "showcase render"],
  ["渲染图", "rendered image"],
  ["背景墙", "background wall"],
  ["米色墙面", "beige wall"],
  ["地面", "flooring"],
];

const negativeTemplate =
  "deformed structure, wrong proportions, broken joints, unrealistic chair, extra legs, asymmetry, distorted geometry, plastic texture, low quality, blurry, noisy, overexposed, oversaturated, cartoon, CGI look, fake wood, cluttered background, messy scene, too many objects";

const uiText = {
  generating: "\u751f\u6210\u4e2d",
  completed: "\u5df2\u751f\u6210",
  failed: "\u751f\u6210\u5931\u8d25",
  loadingTitle: "\u6b63\u5728\u8c03\u7528\u672c\u5730\u5bb6\u5177\u751f\u6210\u5f15\u64ce",
  loadingDesc:
    "\u540e\u7aef\u4f1a\u6839\u636e\u914d\u7f6e\u81ea\u52a8\u8f6c\u53d1\u5230 ComfyUI \u6216 Stable Diffusion WebUI\u3002",
  idleTitle: "\u7b49\u5f85\u4e0b\u4e00\u6b21\u751f\u6210",
  idleDesc:
    "\u70b9\u51fb\u4e0a\u65b9\u6309\u94ae\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u672c\u5730\u6a21\u578b\u7684\u751f\u6210\u8fdb\u5ea6\u3002",
  zoom: "\u653e\u5927",
  download: "\u4e0b\u8f7d",
  reroll: "\u518d\u6765\u4e00\u7248",
  rerollMenu: "\u53d8\u5316\u65b9\u5f0f",
  refinePrefix: "\u57fa\u4e8e\u4e0a\u4e00\u7248\u7ee7\u7eed\u7ec6\u5316\uff1a",
  configSaved: "\u5df2\u4fdd\u5b58",
  configSaving: "\u4fdd\u5b58\u4e2d",
};

const apiBase =
  window.location.protocol === "file:"
    ? "http://127.0.0.1:3000/api"
    : `${window.location.origin}/api`;

const input = document.getElementById("promptInput");
const originalPromptView = document.getElementById("originalPromptView");
const translatedPromptView = document.getElementById("translatedPrompt");
const enhancedPrompt = document.getElementById("enhancedPrompt");
const negativePrompt = document.getElementById("negativePrompt");
const styleChips = document.getElementById("styleChips");
const qualitySegment = document.getElementById("qualitySegment");
const sizeSegment = document.getElementById("sizeSegment");
const moodRange = document.getElementById("moodRange");
const moodValue = document.getElementById("moodValue");
const generateButton = document.getElementById("generateButton");
const modelConfigButton = document.getElementById("modelConfigButton");
const galleryGrid = document.getElementById("galleryGrid");
const loadingCard = document.getElementById("loadingCard");
const statusChip = document.querySelector(".status-chip");
const refinePanel = document.getElementById("refinePanel");
const refineSummary = document.getElementById("refineSummary");
const refineButton = document.getElementById("refineButton");
const refinePreview = document.getElementById("refinePreview");
const refineMeta = document.getElementById("refineMeta");
const configModal = document.getElementById("configModal");
const configStatus = document.getElementById("configStatus");
const engineSelect = document.getElementById("engineSelect");
const auto1111BaseUrlInput = document.getElementById("auto1111BaseUrlInput");
const auto1111ModelInput = document.getElementById("auto1111ModelInput");
const comfyBaseUrlInput = document.getElementById("comfyBaseUrlInput");
const comfyCheckpointInput = document.getElementById("comfyCheckpointInput");
const comfyWorkflowFileInput = document.getElementById("comfyWorkflowFileInput");
const configCancelButton = document.getElementById("configCancelButton");
const configSaveButton = document.getElementById("configSaveButton");
const generationStore = new Map();
const lightbox = createLightbox();

let selectedStyle = "ming";
let selectedQuality = "hd";
let selectedSize = "512";
let lastGeneratedPrompt = "";
let defaultEngine = "automatic1111";
let cardSequence = 0;
let currentConfig = null;

function composePrompt() {
  const basePrompt = input.value.trim();
  originalPromptView.value = basePrompt;

  if (!basePrompt) {
    translatedPromptView.value = "";
    enhancedPrompt.value = "";
    return;
  }

  if (looksLikeStructuredPrompt(basePrompt)) {
    translatedPromptView.value = basePrompt;
    enhancedPrompt.value = basePrompt;
    return;
  }

  const translatedPrompt = containsChinese(basePrompt)
    ? translateChinesePrompt(basePrompt)
    : basePrompt;
  translatedPromptView.value = translatedPrompt;

  const moodTone =
    Number(moodRange.value) > 65
      ? "soft directional light, clearer atmosphere, restrained dramatic shadow"
      : "balanced studio light, restrained composition, product-focused framing";

  enhancedPrompt.value = [
    translatedPrompt,
    styleTemplates[selectedStyle],
    "single hero furniture piece, physically correct structure, refined woodworking detail, realistic material response",
    qualityMap[selectedQuality],
    moodTone,
  ]
    .filter(Boolean)
    .join(", ");
}

function looksLikeStructuredPrompt(prompt) {
  const commaCount = (prompt.match(/,/g) || []).length;
  const englishWordCount = (prompt.match(/[A-Za-z][A-Za-z-]*/g) || []).length;
  return prompt.includes("<lora:") || commaCount >= 8 || englishWordCount >= 14;
}

function containsChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function translateChinesePrompt(text) {
  let translated = text;

  for (const [source, target] of translationDictionary.sort((a, b) => b[0].length - a[0].length)) {
    translated = translated.replaceAll(source, target);
  }

  translated = translated
    .replace(/[，、；]/g, ", ")
    .replace(/[。]/g, "")
    .replace(/[：]/g, ": ")
    .replace(/[（）]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ", ")
    .trim();

  if (containsChinese(translated)) {
    translated = translated
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => (containsChinese(segment) ? segment.replace(/[\u4e00-\u9fff]+/g, "").trim() : segment))
      .filter(Boolean)
      .join(", ");
  }

  return translated || text;
}

function bindSegment(segmentRoot, onChange) {
  segmentRoot.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }

    segmentRoot.querySelectorAll("button").forEach((button) => {
      button.classList.remove("active");
    });
    target.classList.add("active");
    onChange(target.dataset.value);
    composePrompt();
  });
}

function renderArtMarkup(imageUrl, fallbackClass) {
  if (imageUrl) {
    return `
      <div class="art has-image">
        <img class="art-image" src="${imageUrl}" alt="Generated furniture concept" />
      </div>
    `;
  }

  return `<div class="art ${fallbackClass}"></div>`;
}

function buildRerollMenu() {
  return `
    <div class="reroll-group">
      <button data-action="reroll" type="button">${uiText.reroll}</button>
      <button data-action="toggle-reroll-menu" class="reroll-toggle" type="button" aria-label="${uiText.rerollMenu}">+</button>
      <div class="reroll-menu hidden">
        ${rerollVariants
          .map(
            (variant) =>
              `<button type="button" data-action="reroll-variant" data-variant="${variant.key}">${variant.label}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function makeResultCard({ title, subtitle, imageUrl, fallbackClass }) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.dataset.fallbackClass = fallbackClass;
  card.innerHTML = `
    ${renderArtMarkup(imageUrl, fallbackClass)}
    <div class="result-meta">
      <strong>${title}</strong>
      <p>${subtitle}</p>
    </div>
    <div class="result-actions">
      <button data-action="zoom" type="button">${uiText.zoom}</button>
      <button data-action="download" type="button">${uiText.download}</button>
      ${buildRerollMenu()}
    </div>
  `;
  return card;
}

function registerGeneratedCard(card, payload) {
  cardSequence += 1;
  const cardId = `generated-${cardSequence}`;
  card.dataset.cardId = cardId;
  generationStore.set(cardId, payload);
}

function createLightbox() {
  const overlay = document.createElement("div");
  overlay.className = "lightbox hidden";
  overlay.innerHTML = `
    <div class="lightbox-backdrop" data-close="true"></div>
    <div class="lightbox-dialog">
      <button class="lightbox-close" type="button" data-close="true" aria-label="Close preview">x</button>
      <div class="lightbox-stage" id="lightboxStage"></div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target.dataset.close === "true") {
      closeLightbox();
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
      closeAllRerollMenus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".reroll-group")) {
      closeAllRerollMenus();
    }
  });

  return overlay;
}

function openLightboxFromCard(card) {
  const stage = lightbox.querySelector("#lightboxStage");
  const image = card.querySelector(".art-image");
  const fallbackClass = card.dataset.fallbackClass || "art-one";

  if (image) {
    stage.innerHTML = `<img class="lightbox-image" src="${image.src}" alt="Preview" />`;
  } else {
    stage.innerHTML = `<div class="lightbox-fallback art ${fallbackClass}"></div>`;
  }

  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
}

function triggerDownload(card) {
  const image = card.querySelector(".art-image");
  if (!image) {
    loadingCard.querySelector("strong").textContent = "\u793a\u4f8b\u5361\u7247\u4e0d\u652f\u6301\u4e0b\u8f7d";
    loadingCard.querySelector("p").textContent =
      "\u8bf7\u5148\u751f\u6210\u4e00\u5f20\u771f\u5b9e\u7ed3\u679c\uff0c\u4e0b\u8f7d\u6309\u94ae\u4f1a\u76f4\u63a5\u4fdd\u5b58\u540e\u7aef\u8fd4\u56de\u7684\u56fe\u7247\u3002";
    return;
  }

  const link = document.createElement("a");
  link.href = image.src;
  link.download = `huazuo-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildVariantPayload(payload, variantKey) {
  const variant = rerollVariants.find((item) => item.key === variantKey) || rerollVariants[0];
  if (variant.key === "same") {
    return { ...payload };
  }

  const promptWithVariant = [payload.prompt, variant.promptSuffix].filter(Boolean).join(", ");
  const originalPromptWithVariant = [payload.originalPrompt, variant.label].filter(Boolean).join(" · ");

  return {
    ...payload,
    prompt: promptWithVariant,
    enhancedPrompt: promptWithVariant,
    originalPrompt: originalPromptWithVariant,
    mood: clamp(Number(payload.mood || 62) + variant.moodDelta, 0, 100),
  };
}

async function rerollCard(card, variantKey = "same") {
  const cardId = card.dataset.cardId;
  const payload = cardId ? generationStore.get(cardId) : null;

  if (!payload) {
    loadingCard.querySelector("strong").textContent = "\u793a\u4f8b\u5361\u7247\u4e0d\u652f\u6301\u518d\u6765\u4e00\u7248";
    loadingCard.querySelector("p").textContent =
      "\u8bf7\u5148\u751f\u6210\u4e00\u5f20\u771f\u5b9e\u7ed3\u679c\uff0c\u65b0\u7684\u5361\u7247\u4f1a\u8bb0\u5f55\u53c2\u6570\u5e76\u652f\u6301\u91cd\u590d\u751f\u6210\u3002";
    return;
  }

  const nextPayload = buildVariantPayload(payload, variantKey);
  input.value = nextPayload.originalPrompt || nextPayload.prompt;
  composePrompt();
  await requestGeneration(nextPayload);
}

async function requestGeneration(requestPayload) {
  setStatus(uiText.generating);
  setLoadingState(true);
  loadingCard.querySelector("strong").textContent = uiText.loadingTitle;
  loadingCard.querySelector("p").textContent = uiText.loadingDesc;

  try {
    const response = await fetch(`${apiBase}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "Generation failed");
    }

    const imageUrl = json.images && json.images[0] ? json.images[0].url : "";
    const subtitle = `${styleLabels[requestPayload.style]} \u00b7 ${qualityLabels[requestPayload.quality]} \u00b7 ${requestPayload.size}`;
    const fallbackClass = Math.random() > 0.5 ? "art-one" : "art-two";
    const card = makeResultCard({
      title: `${styleLabels[requestPayload.style]}\u65b9\u6848`,
      subtitle,
      imageUrl,
      fallbackClass,
    });

    registerGeneratedCard(card, requestPayload);
    galleryGrid.prepend(card);
    updateRefinePanel({
      promptText: requestPayload.originalPrompt || requestPayload.prompt,
      imageUrl,
      fallbackClass,
      subtitle,
    });
    setStatus(uiText.completed);
    loadingCard.querySelector("strong").textContent = uiText.idleTitle;
    loadingCard.querySelector("p").textContent = uiText.idleDesc;
  } catch (error) {
    console.error(error);
    setStatus(uiText.failed);
    loadingCard.querySelector("strong").textContent = uiText.failed;
    loadingCard.querySelector("p").textContent = error.message;
  } finally {
    setLoadingState(false);
  }
}

function updateRefinePanel({ promptText, imageUrl, fallbackClass, subtitle }) {
  lastGeneratedPrompt = promptText.trim();
  refineSummary.textContent = lastGeneratedPrompt;
  refineMeta.textContent = subtitle;

  refinePreview.classList.remove("art-one", "art-two", "has-image");
  refinePreview.innerHTML = "";

  if (imageUrl) {
    refinePreview.classList.add("has-image");
    refinePreview.innerHTML = `<img class="art-image" src="${imageUrl}" alt="Last generated furniture result" />`;
  } else {
    refinePreview.classList.add(fallbackClass);
  }

  refinePanel.classList.remove("hidden");
}

function setLoadingState(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading
    ? "\u751f\u6210\u4e2d..."
    : "\u751f\u6210\u5bb6\u5177\u65b9\u6848\u56fe";
}

function setStatus(text, idle = false) {
  statusChip.textContent = text;
  statusChip.classList.toggle("idle", idle);
}

function hydrateConfigForm(config) {
  if (!config) {
    return;
  }

  engineSelect.value = config.defaultEngine || "automatic1111";
  auto1111BaseUrlInput.value = config.auto1111BaseUrl || "";
  auto1111ModelInput.value = config.auto1111Lora || config.auto1111Model || "";
  comfyBaseUrlInput.value = config.comfyBaseUrl || "";
  comfyCheckpointInput.value = config.comfyCheckpoint || "";
  comfyWorkflowFileInput.value = config.comfyWorkflowFile || "";
}

function readConfigForm() {
  return {
    defaultEngine: engineSelect.value,
    auto1111BaseUrl: auto1111BaseUrlInput.value.trim(),
    auto1111Lora: auto1111ModelInput.value.trim(),
    comfyBaseUrl: comfyBaseUrlInput.value.trim(),
    comfyCheckpoint: comfyCheckpointInput.value.trim(),
    comfyWorkflowFile: comfyWorkflowFileInput.value.trim(),
  };
}

function updateModelButton(config) {
  const engineLabel =
    config && config.defaultEngine === "comfyui" ? "ComfyUI" : "Stable Diffusion";
  modelConfigButton.textContent = `连接本地模型 · ${engineLabel}`;
}

function openConfigModal() {
  hydrateConfigForm(currentConfig);
  configStatus.textContent = currentConfig ? uiText.configSaved : "未加载";
  configStatus.classList.add("idle");
  configModal.classList.remove("hidden");
}

function closeConfigModal() {
  configModal.classList.add("hidden");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toggleRerollMenu(card) {
  const menu = card.querySelector(".reroll-menu");
  if (!menu) {
    return;
  }

  const shouldOpen = menu.classList.contains("hidden");
  closeAllRerollMenus();
  if (shouldOpen) {
    menu.classList.remove("hidden");
  }
}

function closeAllRerollMenus() {
  galleryGrid.querySelectorAll(".reroll-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });
}

async function fetchBackendConfig() {
  try {
    const response = await fetch(`${apiBase}/config`);
    if (!response.ok) {
      return;
    }
    const json = await response.json();
    if (json.config) {
      currentConfig = json.config;
      defaultEngine = json.config.defaultEngine || defaultEngine;
      hydrateConfigForm(currentConfig);
      updateModelButton(currentConfig);
    }
  } catch (error) {
    console.warn("Backend config unavailable.", error);
  }
}

async function saveBackendConfig() {
  const payload = readConfigForm();
  configStatus.textContent = uiText.configSaving;
  configStatus.classList.remove("idle");
  configSaveButton.disabled = true;

  try {
    const response = await fetch(`${apiBase}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "Config update failed");
    }

    currentConfig = json.config;
    defaultEngine = json.config.defaultEngine || defaultEngine;
    updateModelButton(currentConfig);
    configStatus.textContent = uiText.configSaved;
    configStatus.classList.add("idle");
    closeConfigModal();
  } catch (error) {
    configStatus.textContent = error.message;
    console.error(error);
  } finally {
    configSaveButton.disabled = false;
  }
}

styleChips.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }

  styleChips.querySelectorAll("button").forEach((button) => {
    button.classList.remove("active");
  });
  target.classList.add("active");
  selectedStyle = target.dataset.style;
  composePrompt();
});

bindSegment(qualitySegment, (value) => {
  selectedQuality = value;
});

bindSegment(sizeSegment, (value) => {
  selectedSize = value;
});

moodRange.addEventListener("input", () => {
  moodValue.textContent = `${moodRange.value}%`;
  composePrompt();
});

input.addEventListener("input", composePrompt);

refineButton.addEventListener("click", () => {
  if (!lastGeneratedPrompt) {
    return;
  }

  input.value = `${uiText.refinePrefix}${lastGeneratedPrompt}`;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  composePrompt();
});

modelConfigButton.addEventListener("click", openConfigModal);
configCancelButton.addEventListener("click", closeConfigModal);
configSaveButton.addEventListener("click", saveBackendConfig);
configModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeConfig === "true") {
    closeConfigModal();
  }
});

generateButton.addEventListener("click", async () => {
  const sourcePrompt = input.value.trim();
  const generatedPrompt = enhancedPrompt.value.trim();

  if (!generatedPrompt) {
    setStatus(uiText.failed);
    return;
  }

  await requestGeneration({
    engine: defaultEngine,
    originalPrompt: sourcePrompt,
    prompt: generatedPrompt,
    enhancedPrompt: generatedPrompt,
    negativePrompt: negativePrompt.value.trim(),
    style: selectedStyle,
    quality: selectedQuality,
    size: Number(selectedSize),
    mood: Number(moodRange.value),
  });
});

galleryGrid.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".result-card");
  if (!card || card.id === "loadingCard") {
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "zoom") {
    openLightboxFromCard(card);
    return;
  }

  if (action === "download") {
    triggerDownload(card);
    return;
  }

  if (action === "reroll") {
    closeAllRerollMenus();
    await rerollCard(card, "same");
    return;
  }

  if (action === "toggle-reroll-menu") {
    event.stopPropagation();
    toggleRerollMenu(card);
    return;
  }

  if (action === "reroll-variant") {
    event.stopPropagation();
    closeAllRerollMenus();
    await rerollCard(card, actionButton.dataset.variant);
  }
});

function attachActionsToSeedCards() {
  galleryGrid.querySelectorAll(".result-card:not(.loading-card)").forEach((card) => {
    const actions = card.querySelectorAll(".result-actions button");
    if (actions.length >= 3) {
      actions[0].dataset.action = "zoom";
      actions[1].dataset.action = "download";
      actions[2].outerHTML = buildRerollMenu();
    }

    const art = card.querySelector(".art");
    if (art && art.classList.contains("art-one")) {
      card.dataset.fallbackClass = "art-one";
    } else if (art && art.classList.contains("art-two")) {
      card.dataset.fallbackClass = "art-two";
    }
  });
}

negativePrompt.value = negativeTemplate;
composePrompt();
fetchBackendConfig();
attachActionsToSeedCards();
