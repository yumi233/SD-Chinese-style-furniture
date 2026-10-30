(function () {
  "use strict";

  const STORAGE_KEY = "musheng.deepseek.studio.v1";
  const INTENT_KEY = "musheng.deepseek.intent";
  const ACCOUNT_KEY = "musheng.deepseek.account";

  const DIMENSIONS = [
    { key: "culture", label: "文化准确" },
    { key: "structure", label: "结构合理" },
    { key: "craft", label: "材料工艺" },
    { key: "innovation", label: "设计创新" },
    { key: "scene", label: "场景适配" },
    { key: "ai", label: "AI 使用" }
  ];

  const RATINGS = {
    1: [88, 82, 84, 86, 79, 85],
    2: [92, 89, 87, 91, 86, 90],
    3: [91, 94, 89, 93, 88, 92]
  };

  const LOCKS = [
    { key: "material", label: "白蜡木" },
    { key: "seat", label: "坐深 560" },
    { key: "back", label: "靠背弧度" },
    { key: "forbid", label: "不加重扶手" }
  ];

  const STARTER_PROMPT = "一把适合小户型的明式扶手椅，白蜡木，靠背轻巧";

  const state = {
    versions: [],
    activeId: null,
    busy: false,
    token: 0,
    selection: null,
    display: {
      effect: "paper",
      grid: 16,
      contrast: 66,
      mask: 90
    },
    locks: [],
    nextStyle: "ming",
    sessionTitle: "无界明椅",
    wasGenerating: false,
    saveTimer: 0,
    toastTimer: 0
  };

  const els = {
    body: document.body,
    projectName: document.querySelector("#projectName"),
    saveStatus: document.querySelector("#saveStatus"),
    versionList: document.querySelector("#versionList"),
    versionCount: document.querySelector("#versionCount"),
    activeVersionLabel: document.querySelector("#activeVersionLabel"),
    zoomLabel: document.querySelector("#zoomLabel"),
    canvasViewport: document.querySelector("#canvasViewport"),
    canvasWorld: document.querySelector("#canvasWorld"),
    artboard: document.querySelector("#artboard"),
    workCanvas: document.querySelector("#workCanvas"),
    emptyState: document.querySelector("#emptyState"),
    selectionBox: document.querySelector("#selectionBox"),
    selectionLabel: document.querySelector("#selectionLabel"),
    selectionBadge: document.querySelector("#selectionBadge"),
    partialBadge: document.querySelector("#partialBadge"),
    composerForm: document.querySelector("#composerForm"),
    briefInput: document.querySelector("#briefInput"),
    generateButton: document.querySelector("#generateButton"),
    generateLabel: document.querySelector("#generateLabel"),
    composerMode: document.querySelector("#composerMode"),
    lockSummary: document.querySelector("#lockSummary"),
    memorySummary: document.querySelector("#memorySummary"),
    scoreBig: document.querySelector("#scoreBig"),
    scoreTitle: document.querySelector("#scoreTitle"),
    scoreCaption: document.querySelector("#scoreCaption"),
    dimensionList: document.querySelector("#dimensionList"),
    reviewAdvice: document.querySelector("#reviewAdvice"),
    lockList: document.querySelector("#lockList"),
    lockListProperties: document.querySelector("#lockListProperties"),
    memoryCount: document.querySelector("#memoryCount"),
    generationPanel: document.querySelector("#generationPanel"),
    generationMode: document.querySelector("#generationMode"),
    generationTitle: document.querySelector("#generationTitle"),
    generationProgressBar: document.querySelector("#generationProgressBar"),
    stageList: document.querySelector("#stageList"),
    stopGeneration: document.querySelector("#stopGeneration"),
    feedbackPanel: document.querySelector("#feedbackPanel"),
    feedbackMark: document.querySelector("#feedbackMark"),
    feedbackTitle: document.querySelector("#feedbackTitle"),
    feedbackCopy: document.querySelector("#feedbackCopy"),
    feedbackRetry: document.querySelector("#feedbackRetry"),
    toast: document.querySelector("#toast"),
    historyDialog: document.querySelector("#historyDialog"),
    historyGrid: document.querySelector("#historyGrid"),
    compareDialog: document.querySelector("#compareDialog"),
    compareStage: document.querySelector("#compareStage"),
    compareLeft: document.querySelector("#compareLeft"),
    compareRight: document.querySelector("#compareRight"),
    compareLeftCanvas: document.querySelector("#compareLeftCanvas"),
    compareRightCanvas: document.querySelector("#compareRightCanvas"),
    overlayLeftCanvas: document.querySelector("#overlayLeftCanvas"),
    overlayRightCanvas: document.querySelector("#overlayRightCanvas"),
    overlayPane: document.querySelector("#overlayPane"),
    overlayClip: document.querySelector("#overlayClip"),
    splitLine: document.querySelector("#splitLine"),
    splitRow: document.querySelector("#splitRow"),
    compareSplit: document.querySelector("#compareSplit"),
    compareNotes: document.querySelector("#compareNotes"),
    compareLeftLabel: document.querySelector("#compareLeftLabel"),
    compareRightLabel: document.querySelector("#compareRightLabel"),
    compareLeftScore: document.querySelector("#compareLeftScore"),
    compareRightScore: document.querySelector("#compareRightScore"),
    exportDialog: document.querySelector("#exportDialog"),
    exportPreview: document.querySelector("#exportPreview"),
    accountDialog: document.querySelector("#accountDialog"),
    accountTitle: document.querySelector("#accountTitle"),
    accountCopy: document.querySelector("#accountCopy"),
    accountLogin: document.querySelector("#accountLogin"),
    studioLoginField: document.querySelector("#studioLoginField"),
    studioLoginEmail: document.querySelector("#studioLoginEmail"),
    offlineBanner: document.querySelector("#offlineBanner"),
    mobileActions: document.querySelector("#mobileActions"),
    mobileActionsToggle: document.querySelector("#mobileActionsToggle")
  };

  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let spacePressed = false;
  let selectionStart = null;
  let panStart = null;
  let activeTool = "select";

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function loadPersisted() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEY), null);
    if (!saved) {
      return;
    }
    state.versions = Array.isArray(saved.versions) ? saved.versions : [];
    state.activeId = saved.activeId || null;
    state.locks = Array.isArray(saved.locks) ? saved.locks : [];
    state.nextStyle = saved.nextStyle || "ming";
    state.sessionTitle = saved.sessionTitle || "无界明椅";
    state.wasGenerating = Boolean(saved.wasGenerating);
    if (saved.display) {
      state.display = Object.assign(state.display, saved.display);
    }
  }

  function persist(immediate) {
    window.clearTimeout(state.saveTimer);
    setSaveStatus("保存中", "saving");
    const write = () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            versions: state.versions,
            activeId: state.activeId,
            locks: state.locks,
            nextStyle: state.nextStyle,
            sessionTitle: state.sessionTitle,
            display: state.display,
            wasGenerating: state.wasGenerating
          })
        );
        setSaveStatus("已保存");
      } catch (error) {
        setSaveStatus("本机保存失败", "error");
      }
    };
    if (immediate) {
      write();
    } else {
      state.saveTimer = window.setTimeout(write, 260);
    }
  }

  function setSaveStatus(text, mode) {
    els.saveStatus.lastElementChild.textContent = text;
    els.saveStatus.classList.toggle("is-saving", mode === "saving");
    els.saveStatus.classList.toggle("is-error", mode === "error");
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 2600);
  }

  function activeVersion() {
    return state.versions.find((version) => version.id === state.activeId) || null;
  }

  function inferType(text) {
    if (/桌|案|台/.test(text)) {
      return "table";
    }
    if (/柜|橱/.test(text)) {
      return "cabinet";
    }
    if (/凳|墩/.test(text)) {
      return "stool";
    }
    return "chair";
  }

  function inferStyle(text, fallback) {
    if (/新中式|当代|现代/.test(text)) {
      return "modern";
    }
    if (/宋|雅/.test(text)) {
      return "song";
    }
    if (/禅|侘寂/.test(text)) {
      return "zen";
    }
    if (/明/.test(text)) {
      return "ming";
    }
    return fallback || "ming";
  }

  function materialFor(style) {
    return style === "modern" ? "白蜡木" : style === "song" ? "深色胡桃木" : style === "zen" ? "浅色榉木" : "白蜡木";
  }

  function average(scores) {
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  function makeVersion(source, prompt, selection) {
    const number = state.versions.length + 1;
    const type = inferType(prompt) || source.type || "chair";
    const style = state.nextStyle || source.style || inferStyle(prompt, "ming");
    const ratings = RATINGS[Math.min(number, 3)] || RATINGS[3];
    const id = `v${number}-${Date.now()}`;
    const adjusted = ratings.map((score, index) => {
      if (state.locks.includes("back") && index === 1) {
        return Math.min(97, score + 1);
      }
      return score;
    });
    return {
      id,
      number,
      prompt,
      type,
      style,
      seed: (source.seed || 37) + 53 + number * 17,
      title: source.title || state.sessionTitle,
      material: materialFor(style),
      ratings: adjusted,
      overall: average(adjusted),
      locked: state.locks.slice(),
      selection: selection || null,
      createdAt: new Date().toISOString(),
      note:
        number === 1
          ? "第一版已建立结构基线。扶手可以再轻，场景关系保持克制。"
          : "保留已确认属性，只改动作覆盖的局部；靠背过渡更连贯。"
    };
  }

  function versionLabel(version) {
    return `V${String(version.number).padStart(2, "0")}`;
  }

  function renderBlankCanvas() {
    const canvas = els.workCanvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f5f2e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x <= canvas.width; x += 48) {
      ctx.strokeStyle = x % 192 === 0 ? "rgba(25,28,24,0.08)" : "rgba(25,28,24,0.035)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 48) {
      ctx.strokeStyle = y % 192 === 0 ? "rgba(25,28,24,0.08)" : "rgba(25,28,24,0.035)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(25,28,24,0.26)";
    ctx.lineWidth = 1;
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
    ctx.fillStyle = "rgba(25,28,24,0.42)";
    ctx.font = '600 16px "SFMono-Regular", monospace';
    ctx.fillText("等待第一份设计方向", 72, 86);
  }

  function renderWorkCanvas(override) {
    const version = activeVersion();
    if (!version) {
      renderBlankCanvas();
      return;
    }
    window.MushengScene.render(
      els.workCanvas,
      Object.assign(
        {
          type: version.type,
          style: state.nextStyle || version.style,
          seed: version.seed,
          version: version.number,
          effect: state.display.effect,
          grid: state.display.grid,
          contrast: state.display.contrast,
          mask: state.display.mask
        },
        override || {}
      )
    );
  }

  function createThumbnail(version, width) {
    const canvas = document.createElement("canvas");
    canvas.width = width || 120;
    canvas.height = Math.round((width || 120) * 0.75);
    window.MushengScene.render(canvas, {
      type: version.type,
      style: version.style,
      seed: version.seed,
      version: version.number,
      effect: "paper",
      grid: 7,
      contrast: 66,
      mask: 90
    });
    return canvas.toDataURL("image/png");
  }

  function renderVersionList() {
    els.versionCount.textContent = String(state.versions.length).padStart(2, "0");
    els.versionList.innerHTML = "";
    if (!state.versions.length) {
      const empty = document.createElement("div");
      empty.className = "version-empty";
      empty.innerHTML = "<span>还没有版本</span><p>第一版会从画布下方长出来。</p>";
      els.versionList.append(empty);
      return;
    }

    const best = state.versions.reduce((winner, version) => {
      return version.overall > winner.overall ? version : winner;
    }, state.versions[0]);

    state.versions.forEach((version) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "version-item";
      button.classList.toggle("is-active", version.id === state.activeId);
      button.dataset.versionId = version.id;
      button.setAttribute("aria-current", version.id === state.activeId ? "true" : "false");

      const image = document.createElement("img");
      image.className = "version-thumb";
      image.alt = "";
      image.src = createThumbnail(version, 96);

      const info = document.createElement("span");
      info.className = "version-info";
      const title = document.createElement("strong");
      title.textContent = `${versionLabel(version)} / ${window.MushengScene.STYLE_LABELS[version.style]}`;
      const detail = document.createElement("span");
      detail.textContent = version.selection ? "局部修改" : version.number === 1 ? "初始结构" : "对话迭代";
      info.append(title, detail);

      const score = document.createElement("span");
      score.className = "version-score";
      score.textContent = String(version.overall);
      button.append(image, info, score);

      if (best.id === version.id && state.versions.length > 1) {
        const marker = document.createElement("span");
        marker.className = "version-best";
        marker.title = "当前最佳";
        button.append(marker);
      }

      els.versionList.append(button);
    });
  }

  function renderDimensions(version) {
    els.dimensionList.innerHTML = "";
    if (!version) {
      DIMENSIONS.forEach((dimension) => {
        const row = document.createElement("div");
        row.className = "dimension-row";
        row.innerHTML = `<span>${dimension.label}</span><div class="dimension-bar"><span style="width:0%"></span></div><strong>--</strong>`;
        els.dimensionList.append(row);
      });
      return;
    }
    DIMENSIONS.forEach((dimension, index) => {
      const value = version.ratings[index];
      const row = document.createElement("div");
      row.className = "dimension-row";
      row.classList.toggle("is-low", value < 82);
      row.innerHTML = `
        <span>${dimension.label}</span>
        <div class="dimension-bar"><span style="width:${value}%;animation-delay:${index * 45}ms"></span></div>
        <strong>${value}</strong>
      `;
      els.dimensionList.append(row);
    });
  }

  function renderLocks() {
    [els.lockList, els.lockListProperties].forEach((container) => {
      container.innerHTML = "";
      LOCKS.forEach((lock) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lock-chip";
        button.classList.toggle("is-locked", state.locks.includes(lock.key));
        button.dataset.lock = lock.key;
        button.setAttribute("aria-pressed", String(state.locks.includes(lock.key)));
        button.textContent = lock.label;
        container.append(button);
      });
    });
    const count = state.locks.length;
    els.memoryCount.textContent = `${count} 项锁定`;
    els.lockSummary.textContent = count ? `已锁定 ${count} 项` : "未锁定属性";
    els.memorySummary.textContent = count
      ? `${LOCKS.filter((lock) => state.locks.includes(lock.key)).map((lock) => lock.label).join("、")} 会随下一版保留。`
      : "材质、比例和禁区会在每次修改后保留。";
  }

  function renderReview() {
    const version = activeVersion();
    if (!version) {
      els.scoreBig.textContent = "--";
      els.scoreTitle.textContent = "等待生成";
      els.scoreCaption.textContent = "评分会贴着作品出现，不抢走画面。";
      els.reviewAdvice.textContent = "先生成第一版，或者点选画面里的一个局部说一说。";
      renderDimensions(null);
      return;
    }
    els.scoreBig.textContent = String(version.overall);
    els.scoreTitle.textContent = version.overall >= 88 ? "可以继续深入" : "基线已经成立";
    els.scoreCaption.textContent = `本轮最低项 ${Math.min(...version.ratings)}，下一版优先处理。`;
    els.reviewAdvice.textContent = version.note;
    renderDimensions(version);
  }

  function syncProperties() {
    document.querySelectorAll("#studioEffectTabs [data-effect]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.effect === state.display.effect);
    });
    document.querySelectorAll("#studioStyles [data-style]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.style === state.nextStyle);
    });
    const grid = document.querySelector("#studioGrid");
    const contrast = document.querySelector("#studioContrast");
    const mask = document.querySelector("#studioMask");
    const gridValue = document.querySelector("#studioGridValue");
    const contrastValue = document.querySelector("#studioContrastValue");
    const maskValue = document.querySelector("#studioMaskValue");
    const modeLabel = document.querySelector("#gridModeLabel");
    grid.value = String(state.display.grid);
    contrast.value = String(state.display.contrast);
    mask.value = String(state.display.mask);
    gridValue.value = String(state.display.grid);
    contrastValue.value = String(state.display.contrast);
    maskValue.value = String(state.display.mask);
    modeLabel.textContent = state.display.effect === "ascii" ? "字符格" : state.display.effect === "dither" ? "像素块" : "扫描线";
  }

  function updateChrome() {
    const version = activeVersion();
    if (version) {
      els.emptyState.hidden = true;
      els.activeVersionLabel.textContent = `${versionLabel(version)} / ${window.MushengScene.STYLE_LABELS[version.style]}`;
      els.composerMode.textContent = `${versionLabel(version)} 之后`;
      els.generateLabel.textContent = "生成修改版";
      els.projectName.textContent = version.title;
      state.nextStyle = state.nextStyle || version.style;
      els.briefInput.placeholder = "说说这一版想改哪里，或框选画面中的局部";
      els.briefInput.value = version.prompt;
    } else {
      els.emptyState.hidden = false;
      els.activeVersionLabel.textContent = "空白画布";
      els.composerMode.textContent = "首版描述";
      els.generateLabel.textContent = "开始构序";
      els.projectName.textContent = state.sessionTitle;
      els.briefInput.placeholder = "描述一件家具，例如：一把小体量明式扶手椅";
    }
    document.title = `${els.projectName.textContent} · 木生构序台`;
    renderVersionList();
    renderReview();
    renderLocks();
    syncProperties();
  }

  function selectVersion(id) {
    if (state.busy) {
      showToast("生成中，完成后可以切换版本");
      return;
    }
    const version = state.versions.find((item) => item.id === id);
    if (!version) {
      return;
    }
    state.activeId = id;
    state.nextStyle = version.style;
    clearSelection();
    renderWorkCanvas();
    updateChrome();
    persist();
  }

  function updateTransform(immediate) {
    els.canvasWorld.classList.toggle("is-moving", Boolean(immediate));
    els.canvasWorld.style.transform = `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    els.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    document.querySelector("#zoomReset").textContent = String(Math.round(zoom * 100));
  }

  function fitCanvas() {
    const rect = els.canvasViewport.getBoundingClientRect();
    zoom = Math.max(0.3, Math.min((rect.width - 28) / 760, (rect.height - 28) / 570, 1.12));
    pan = { x: 0, y: 0 };
    updateTransform(false);
  }

  function setZoom(next, immediate) {
    zoom = Math.max(0.35, Math.min(2.4, next));
    updateTransform(immediate);
  }

  function renderSelection() {
    if (!state.selection) {
      els.selectionBox.hidden = true;
      els.selectionBadge.hidden = true;
      return;
    }
    const { x, y, width, height } = state.selection;
    els.selectionBox.hidden = false;
    els.selectionBox.style.left = `${x}px`;
    els.selectionBox.style.top = `${y}px`;
    els.selectionBox.style.width = `${width}px`;
    els.selectionBox.style.height = `${height}px`;
    const physicalW = Math.round((width / 760) * 620);
    const physicalH = Math.round((height / 570) * 720);
    els.selectionLabel.textContent = `${physicalW} × ${physicalH}`;
    els.selectionBadge.hidden = false;
  }

  function clearSelection() {
    state.selection = null;
    selectionStart = null;
    renderSelection();
  }

  function artboardPoint(event) {
    const rect = els.artboard.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(760, ((event.clientX - rect.left) / rect.width) * 760)),
      y: Math.max(0, Math.min(570, ((event.clientY - rect.top) / rect.height) * 570))
    };
  }

  function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll("[data-tool]").forEach((button) => {
      const selected = button.dataset.tool === tool;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    els.canvasViewport.classList.toggle("is-panning", tool === "hand");
  }

  function setStage(index, progress) {
    const items = Array.from(els.stageList.children);
    items.forEach((item, itemIndex) => {
      const isDone = itemIndex < index;
      const isActive = itemIndex === index;
      item.classList.toggle("is-done", isDone);
      item.classList.toggle("is-active", isActive);
      const stateLabel = item.querySelector(".stage-state");
      stateLabel.textContent = isDone ? "完成" : isActive ? "进行中" : "等待";
    });
    els.generationProgressBar.style.width = `${progress}%`;
  }

  function showDraft(candidate) {
    state.selection = null;
    renderSelection();
    els.emptyState.hidden = true;
    els.artboard.classList.add("is-partial");
    els.partialBadge.hidden = false;
    window.MushengScene.render(els.workCanvas, {
      type: candidate.type,
      style: candidate.style,
      seed: candidate.seed,
      version: state.versions.length + 1,
      effect: "dither",
      grid: 7,
      contrast: 68,
      mask: 88
    });
  }

  function clearDraft() {
    els.artboard.classList.remove("is-partial");
    els.partialBadge.hidden = true;
    if (activeVersion()) {
      renderWorkCanvas();
    } else {
      renderBlankCanvas();
      els.emptyState.hidden = false;
    }
  }

  function showFeedback(kind, title, copy) {
    els.feedbackPanel.hidden = false;
    els.feedbackPanel.classList.toggle("is-stopped", kind === "stopped");
    els.feedbackPanel.classList.toggle("is-restored", kind === "restored");
    els.feedbackMark.textContent = kind === "stopped" ? "■" : kind === "restored" ? "↺" : "!";
    els.feedbackTitle.textContent = title;
    els.feedbackCopy.textContent = copy;
    els.feedbackRetry.textContent = kind === "stopped" ? "继续修改" : "重新开始";
  }

  function hideFeedback() {
    els.feedbackPanel.hidden = true;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function promptPassesFailureGate(text) {
    const params = new URLSearchParams(window.location.search);
    return params.get("state") === "failed" || /生成失败|做不出来/.test(text);
  }

  function failGeneration(message) {
    state.busy = false;
    state.wasGenerating = false;
    els.generationPanel.hidden = true;
    els.generateButton.disabled = false;
    clearDraft();
    showFeedback("failed", "生成没有完成", message || "没有扣减次数，输入和锁定项仍保留。");
    persist(true);
  }

  async function runGeneration(candidate) {
    if (state.busy) {
      return;
    }
    state.busy = true;
    state.wasGenerating = true;
    hideFeedback();
    persist(true);
    state.token += 1;
    const token = state.token;
    els.generateButton.disabled = true;
    els.generationPanel.hidden = false;
    els.generationMode.textContent = state.versions.length ? "局部迭代" : "第一版";
    els.generationTitle.textContent = candidate.selection ? "只改你框住的地方。" : "正在把想法立起来。";
    setStage(0, 7);

    await sleep(620);
    if (token !== state.token) {
      return;
    }
    if (!navigator.onLine || promptPassesFailureGate(candidate.prompt)) {
      failGeneration(navigator.onLine ? "这次没有返回可用结果，不影响已保存版本。" : "网络已断开，恢复连接后可以继续。");
      return;
    }

    setStage(1, 27);
    await sleep(780);
    if (token !== state.token) {
      return;
    }

    setStage(2, 58);
    showDraft(candidate);
    await sleep(1150);
    if (token !== state.token) {
      return;
    }
    if (!navigator.onLine) {
      failGeneration("网络在出图时断开，已保存本轮输入。");
      return;
    }

    setStage(3, 86);
    await sleep(920);
    if (token !== state.token) {
      return;
    }

    setStage(4, 100);
    await sleep(320);
    if (token !== state.token) {
      return;
    }

    const source = activeVersion() || {
      seed: candidate.seed,
      style: candidate.style,
      type: candidate.type,
      title: state.sessionTitle
    };
    const version = makeVersion(source, candidate.prompt, candidate.selection);
    state.versions.push(version);
    state.activeId = version.id;
    state.nextStyle = version.style;
    state.busy = false;
    state.wasGenerating = false;
    els.generationPanel.hidden = true;
    els.generateButton.disabled = false;
    clearDraft();
    renderWorkCanvas();
    updateChrome();
    persist(true);
    showToast(`${versionLabel(version)} 已生成 · 综合 ${version.overall}`);
  }

  function prepareCandidate(prompt) {
    const current = activeVersion();
    return {
      prompt,
      selection: state.selection
        ? {
            x: Math.round(state.selection.x),
            y: Math.round(state.selection.y),
            width: Math.round(state.selection.width),
            height: Math.round(state.selection.height)
          }
        : null,
      type: inferType(prompt) || current?.type || "chair",
      style: state.nextStyle || current?.style || inferStyle(prompt, "ming"),
      seed: (current?.seed || 280) + Math.floor(Math.random() * 113) + 19
    };
  }

  function submitBrief() {
    const text = els.briefInput.value.trim();
    if (!text) {
      els.briefInput.focus();
      showToast("先写一句你想做的家具");
      return;
    }
    if (state.busy) {
      showToast("当前版本还在生成");
      return;
    }
    runGeneration(prepareCandidate(text));
  }

  function stopGeneration() {
    if (!state.busy) {
      return;
    }
    state.token += 1;
    state.busy = false;
    state.wasGenerating = false;
    els.generationPanel.hidden = true;
    els.generateButton.disabled = false;
    clearDraft();
    showFeedback("stopped", "已停止这一轮", "没有生成新版本，输入和锁定项都还在。");
    persist(true);
  }

  function createHistoryItem(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-card";
    button.dataset.history = item.key;

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 360;
    window.MushengScene.render(canvas, {
      type: item.type,
      style: item.style,
      seed: item.seed,
      version: item.number,
      effect: "paper",
      grid: 7,
      contrast: 63,
      mask: 88
    });

    const meta = document.createElement("span");
    meta.className = "history-card-meta";
    meta.innerHTML = `<strong>${item.title}</strong><span>${item.time}</span>`;
    const date = document.createElement("span");
    date.className = "history-card-date";
    date.textContent = `${item.material} · ${window.MushengScene.STYLE_LABELS[item.style]} · 综合 ${item.overall}`;
    button.append(canvas, meta, date);
    return button;
  }

  const HISTORY_ITEMS = [
    { key: "chair", title: "无界明椅", type: "chair", style: "ming", seed: 418, number: 3, time: "今天 16:12", material: "白蜡木", overall: 91 },
    { key: "table", title: "半卷书案", type: "table", style: "song", seed: 627, number: 2, time: "昨天 21:08", material: "深色胡桃木", overall: 87 },
    { key: "stool", title: "薄边坐凳", type: "stool", style: "modern", seed: 374, number: 3, time: "10 月 27", material: "白蜡木", overall: 88 }
  ];

  function renderHistory() {
    els.historyGrid.innerHTML = "";
    HISTORY_ITEMS.forEach((item) => {
      els.historyGrid.append(createHistoryItem(item));
    });
  }

  function loadHistoryItem(key) {
    const item = HISTORY_ITEMS.find((entry) => entry.key === key);
    if (!item) {
      return;
    }
    const base = {
      seed: item.seed,
      style: item.style,
      type: item.type,
      title: item.title
    };
    state.sessionTitle = item.title;
    state.nextStyle = item.style;
    state.versions = [];
    const loaded = makeVersion(base, historyPrompt(item), null);
    loaded.number = item.number;
    loaded.title = item.title;
    loaded.material = item.material;
    loaded.ratings = RATINGS[Math.min(item.number, 3)];
    loaded.overall = item.overall;
    loaded.createdAt = new Date(Date.now() - 1000 * 60 * 60 * 21).toISOString();
    state.versions = [loaded];
    state.activeId = loaded.id;
    els.historyDialog.close();
    renderWorkCanvas();
    updateChrome();
    persist(true);
    showToast(`已回到《${item.title}》`);
  }

  function historyPrompt(item) {
    if (item.type === "table") {
      return "一张宋韵书案，深色胡桃木，桌沿微收";
    }
    if (item.type === "stool") {
      return "一只新中式薄边坐凳，白蜡木，轻量结构";
    }
    return "一把小体量明式扶手椅，白蜡木，扶手连续减薄";
  }

  function openCompare() {
    if (state.versions.length < 2) {
      showToast("再生成一个版本，就能比较差异");
      return;
    }
    els.compareLeft.innerHTML = "";
    els.compareRight.innerHTML = "";
    state.versions.forEach((version) => {
      const optionA = document.createElement("option");
      optionA.value = version.id;
      optionA.textContent = `${versionLabel(version)} · ${version.overall}`;
      const optionB = optionA.cloneNode(true);
      els.compareLeft.append(optionA);
      els.compareRight.append(optionB);
    });
    const activeIndex = state.versions.findIndex((version) => version.id === state.activeId);
    const rightIndex = activeIndex >= 0 ? activeIndex : state.versions.length - 1;
    const leftIndex = Math.max(0, rightIndex - 1);
    els.compareLeft.value = state.versions[leftIndex].id;
    els.compareRight.value = state.versions[rightIndex].id;
    drawCompare();
    setCompareMode("side");
    els.compareDialog.showModal();
  }

  function drawCompare() {
    const left = state.versions.find((version) => version.id === els.compareLeft.value);
    const right = state.versions.find((version) => version.id === els.compareRight.value);
    if (!left || !right) {
      return;
    }
    [els.compareLeftCanvas, els.overlayLeftCanvas].forEach((canvas) => {
      window.MushengScene.render(canvas, {
        type: left.type,
        style: left.style,
        seed: left.seed,
        version: left.number,
        effect: "paper",
        grid: 7,
        contrast: 66,
        mask: 90
      });
    });
    [els.compareRightCanvas, els.overlayRightCanvas].forEach((canvas) => {
      window.MushengScene.render(canvas, {
        type: right.type,
        style: right.style,
        seed: right.seed,
        version: right.number,
        effect: "paper",
        grid: 7,
        contrast: 66,
        mask: 90
      });
    });
    els.compareLeftLabel.textContent = versionLabel(left);
    els.compareRightLabel.textContent = versionLabel(right);
    els.compareLeftScore.textContent = String(left.overall);
    els.compareRightScore.textContent = String(right.overall);
    const changes = [
      ["扶手厚度", `${left.number === 1 ? "40 mm" : "32 mm"} → ${right.number >= 2 ? "24 mm" : "30 mm"}`],
      ["靠背过渡", right.number >= 2 ? "改为连续曲面" : "保持直背"],
      ["锁定项", right.locked.length ? `${right.locked.length} 项未改变` : "本轮未锁定"]
    ];
    els.compareNotes.innerHTML = "";
    changes.forEach(([label, value], index) => {
      const note = document.createElement("div");
      note.className = "compare-note";
      note.innerHTML = `<span>0${index + 1}</span><strong>${label} · ${value}</strong>`;
      els.compareNotes.append(note);
    });
  }

  function setCompareMode(mode) {
    const overlay = mode === "overlay";
    els.compareStage.classList.toggle("is-overlay", overlay);
    els.overlayPane.hidden = !overlay;
    els.splitRow.hidden = !overlay;
    els.compareStage.querySelectorAll(".compare-pane").forEach((pane) => {
      pane.hidden = overlay;
    });
    document.querySelectorAll("#compareModes [data-compare-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.compareMode === mode);
    });
  }

  function updateSplit() {
    const value = Number(els.compareSplit.value);
    els.overlayClip.style.clipPath = `inset(0 0 0 ${value}%)`;
    els.splitLine.style.left = `${value}%`;
  }

  function exportCurrent() {
    const version = activeVersion();
    if (!version) {
      showToast("先生成一个版本再导出");
      return;
    }
    window.MushengScene.exportSheet(els.exportPreview, {
      title: version.title,
      prompt: version.prompt,
      material: version.material,
      score: version.overall,
      type: version.type,
      style: state.nextStyle || version.style,
      seed: version.seed,
      version: version.number,
      effect: "paper"
    });
    els.exportDialog.showModal();
  }

  function downloadExport() {
    const version = activeVersion();
    if (!version) {
      return;
    }
    const output = document.createElement("canvas");
    window.MushengScene.exportSheet(output, {
      title: version.title,
      prompt: version.prompt,
      material: version.material,
      score: version.overall,
      type: version.type,
      style: state.nextStyle || version.style,
      seed: version.seed,
      version: version.number,
      effect: "paper"
    });
    output.toBlob((blob) => {
      if (!blob) {
        showToast("导出失败，请重试");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `木生-${versionLabel(version)}-评审页.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast("评审页已下载");
    }, "image/png");
  }

  function openAccount() {
    const account = safeParse(localStorage.getItem(ACCOUNT_KEY), null);
    if (account?.email) {
      els.accountTitle.textContent = "已登录。";
      els.accountCopy.textContent = `当前账户：${account.email}。版本会保存在本机，并等待同步服务接入。`;
      els.accountLogin.textContent = "关闭";
      els.studioLoginField.hidden = true;
    } else {
      els.accountTitle.textContent = "你好，设计师。";
      els.accountCopy.textContent = "登录后，这件作品的会话和版本会跟着你走。";
      els.accountLogin.textContent = "登录并同步";
      els.studioLoginField.hidden = false;
    }
    els.accountDialog.showModal();
  }

  function syncOnlineState() {
    const online = navigator.onLine;
    els.offlineBanner.hidden = online;
    if (!online) {
      setSaveStatus("离线", "error");
    } else if (!state.busy) {
      setSaveStatus("已保存");
    }
  }

  function bindEvents() {
    els.versionList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-version-id]");
      if (item) {
        selectVersion(item.dataset.versionId);
      }
    });

    els.composerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitBrief();
    });

    document.querySelectorAll("[data-quick]").forEach((button) => {
      button.addEventListener("click", () => {
        els.briefInput.value = button.dataset.quick;
        els.briefInput.focus();
        if (state.selection) {
          submitBrief();
        }
      });
    });

    els.generateButton.addEventListener("click", (event) => {
      if (state.busy) {
        event.preventDefault();
      }
    });

    els.stopGeneration.addEventListener("click", stopGeneration);
    els.feedbackRetry.addEventListener("click", () => {
      hideFeedback();
      els.briefInput.focus();
      if (state.busy) {
        return;
      }
    });

    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });

    document.querySelectorAll(".inspector-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".inspector-tabs button").forEach((tab) => {
          const selected = tab === button;
          tab.classList.toggle("is-active", selected);
          tab.setAttribute("aria-selected", String(selected));
        });
        const target = button.dataset.panel;
        document.querySelector("#reviewPanel").hidden = target !== "review";
        document.querySelector("#propertiesPanel").hidden = target !== "properties";
      });
    });

    document.querySelectorAll("[data-lock]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.lock;
        if (state.locks.includes(key)) {
          state.locks = state.locks.filter((item) => item !== key);
        } else {
          state.locks.push(key);
        }
        renderLocks();
        persist();
      });
    });

    document.querySelector("#studioEffectTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-effect]");
      if (!button) {
        return;
      }
      state.display.effect = button.dataset.effect;
      state.display.grid = state.display.effect === "ascii" ? 16 : state.display.effect === "dither" ? 8 : 8;
      state.display.mask = state.display.effect === "ascii" ? 90 : state.display.effect === "dither" ? 88 : 90;
      syncProperties();
      renderWorkCanvas();
      persist();
    });

    [
      ["#studioGrid", "grid"],
      ["#studioContrast", "contrast"],
      ["#studioMask", "mask"]
    ].forEach(([selector, key]) => {
      const input = document.querySelector(selector);
      const output = document.querySelector(`${selector}Value`);
      input.addEventListener("input", () => {
        state.display[key] = Number(input.value);
        output.value = input.value;
        renderWorkCanvas();
        persist();
      });
    });

    document.querySelector("#studioStyles").addEventListener("click", (event) => {
      const button = event.target.closest("[data-style]");
      if (!button) {
        return;
      }
      state.nextStyle = button.dataset.style;
      syncProperties();
      renderWorkCanvas();
      persist();
    });

    els.canvasViewport.addEventListener(
      "wheel",
      (event) => {
        if (window.matchMedia("(max-width: 760px)").matches) {
          return;
        }
        event.preventDefault();
        setZoom(zoom + (event.deltaY > 0 ? -0.08 : 0.08), true);
      },
      { passive: false }
    );

    document.querySelector("#zoomIn").addEventListener("click", () => setZoom(zoom + 0.12, false));
    document.querySelector("#zoomOut").addEventListener("click", () => setZoom(zoom - 0.12, false));
    document.querySelector("#zoomReset").addEventListener("click", () => {
      setZoom(1, false);
      pan = { x: 0, y: 0 };
      updateTransform(false);
    });
    document.querySelector("#fitCanvas").addEventListener("click", fitCanvas);
    document.querySelector("#clearSelection").addEventListener("click", clearSelection);
    document.querySelector("#selectionClearInline").addEventListener("click", clearSelection);

    els.canvasViewport.addEventListener("pointerdown", (event) => {
      const canPan =
        activeTool === "hand" ||
        spacePressed ||
        event.button === 1 ||
        (event.target === els.canvasViewport && event.button === 0);
      if (canPan) {
        event.preventDefault();
        panStart = {
          x: event.clientX,
          y: event.clientY,
          originX: pan.x,
          originY: pan.y
        };
        els.canvasViewport.classList.add("is-dragging");
        els.canvasViewport.setPointerCapture(event.pointerId);
        els.canvasWorld.classList.add("is-moving");
        return;
      }
      if (activeTool !== "select" || !event.target.closest("#artboard") || event.button !== 0) {
        return;
      }
      event.preventDefault();
      clearSelection();
      selectionStart = artboardPoint(event);
      state.selection = {
        x: selectionStart.x,
        y: selectionStart.y,
        width: 0,
        height: 0
      };
      els.canvasViewport.setPointerCapture(event.pointerId);
      renderSelection();
    });

    els.canvasViewport.addEventListener("pointermove", (event) => {
      if (panStart) {
        pan = {
          x: panStart.originX + event.clientX - panStart.x,
          y: panStart.originY + event.clientY - panStart.y
        };
        updateTransform(true);
        return;
      }
      if (!selectionStart) {
        return;
      }
      const point = artboardPoint(event);
      state.selection = {
        x: Math.min(selectionStart.x, point.x),
        y: Math.min(selectionStart.y, point.y),
        width: Math.abs(point.x - selectionStart.x),
        height: Math.abs(point.y - selectionStart.y)
      };
      renderSelection();
    });

    function finishPointer(event) {
      if (panStart) {
        panStart = null;
        els.canvasViewport.classList.remove("is-dragging");
        els.canvasWorld.classList.remove("is-moving");
        if (els.canvasViewport.hasPointerCapture(event.pointerId)) {
          els.canvasViewport.releasePointerCapture(event.pointerId);
        }
      }
      if (selectionStart) {
        selectionStart = null;
        if (!state.selection || state.selection.width < 12 || state.selection.height < 12) {
          clearSelection();
        } else {
          renderSelection();
          els.briefInput.focus();
          showToast("局部已框住，补一句修改意见");
        }
      }
    }

    els.canvasViewport.addEventListener("pointerup", finishPointer);
    els.canvasViewport.addEventListener("pointercancel", finishPointer);

    els.workCanvas.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() !== "s" || state.busy) {
        return;
      }
      event.preventDefault();
      state.selection = { x: 420, y: 170, width: 150, height: 150 };
      renderSelection();
      els.briefInput.focus();
      showToast("已用键盘建立局部选框");
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        spacePressed = true;
        els.canvasViewport.classList.add("is-panning");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submitBrief();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        spacePressed = false;
        els.canvasViewport.classList.toggle("is-panning", activeTool === "hand");
      }
    });

    document.querySelector("#newVersionButton").addEventListener("click", () => {
      if (state.busy) {
        showToast("当前版本还在生成");
        return;
      }
      els.briefInput.value = "";
      els.briefInput.placeholder = "从当前版本分出一个新方向，例如：把扶手做成悬挑";
      els.briefInput.focus();
      clearSelection();
      showToast("新方向会从当前版本分岔");
    });

    document.querySelector("#historyOpen").addEventListener("click", () => els.historyDialog.showModal());
    document.querySelector("#mobileHistory").addEventListener("click", () => {
      els.mobileActions.hidden = true;
      els.historyDialog.showModal();
    });
    document.querySelector("#historyClose").addEventListener("click", () => els.historyDialog.close());
    els.historyGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-history]");
      if (card) {
        loadHistoryItem(card.dataset.history);
      }
    });

    document.querySelector("#compareOpen").addEventListener("click", openCompare);
    document.querySelector("#mobileCompare").addEventListener("click", () => {
      els.mobileActions.hidden = true;
      openCompare();
    });
    document.querySelector("#compareAction").addEventListener("click", openCompare);
    document.querySelector("#compareClose").addEventListener("click", () => els.compareDialog.close());
    els.compareLeft.addEventListener("change", drawCompare);
    els.compareRight.addEventListener("change", drawCompare);
    document.querySelector("#compareModes").addEventListener("click", (event) => {
      const button = event.target.closest("[data-compare-mode]");
      if (button) {
        setCompareMode(button.dataset.compareMode);
      }
    });
    els.compareSplit.addEventListener("input", updateSplit);

    document.querySelector("#exportOpen").addEventListener("click", exportCurrent);
    document.querySelector("#exportAction").addEventListener("click", exportCurrent);
    document.querySelector("#mobileExport").addEventListener("click", () => {
      els.mobileActions.hidden = true;
      exportCurrent();
    });
    document.querySelector("#exportClose").addEventListener("click", () => els.exportDialog.close());
    document.querySelector("#downloadExport").addEventListener("click", downloadExport);

    document.querySelector("#accountButton").addEventListener("click", openAccount);
    document.querySelector("#accountClose").addEventListener("click", () => els.accountDialog.close());
    document.querySelector("#accountSkip").addEventListener("click", () => els.accountDialog.close());
    els.accountLogin.addEventListener("click", () => {
      if (els.accountLogin.textContent === "关闭") {
        els.accountDialog.close();
        return;
      }
      const email = els.studioLoginEmail.value.trim();
      if (email && email.includes("@")) {
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ email }));
        els.accountDialog.close();
        showToast("已登录，这台设备上的版本已绑定");
      } else {
        els.studioLoginEmail.focus();
        showToast("请输入完整邮箱");
      }
    });

    els.mobileActionsToggle.addEventListener("click", () => {
      const open = els.mobileActionsToggle.getAttribute("aria-expanded") === "true";
      els.mobileActionsToggle.setAttribute("aria-expanded", String(!open));
      els.mobileActions.hidden = open;
    });

    document.querySelectorAll(".dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        const rect = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!inside) {
          dialog.close();
        }
      });
    });

    window.addEventListener("online", () => {
      syncOnlineState();
      showToast("网络已恢复");
    });
    window.addEventListener("offline", syncOnlineState);
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 760px)").matches) {
        fitCanvas();
      }
    });
  }

  function loadIntent() {
    const params = new URLSearchParams(window.location.search);
    const intent = safeParse(localStorage.getItem(INTENT_KEY), null);
    if (intent && (params.get("new") === "1" || state.versions.length === 0)) {
      els.briefInput.value = intent.prompt || STARTER_PROMPT;
      state.nextStyle = intent.style || "ming";
      state.display.effect = intent.effect || "paper";
      state.display.grid = Number(intent.grid) || 8;
      localStorage.removeItem(INTENT_KEY);
    } else if (!els.briefInput.value.trim()) {
      els.briefInput.value = STARTER_PROMPT;
    }
  }

  function init() {
    loadPersisted();
    loadIntent();
    bindEvents();
    renderHistory();
    updateChrome();
    renderWorkCanvas();
    if (state.activeId && !state.versions.some((version) => version.id === state.activeId)) {
      state.activeId = state.versions[0]?.id || null;
    }
    if (state.wasGenerating) {
      state.wasGenerating = false;
      showFeedback("restored", "上次生成已中断", "已恢复最近保存的版本，输入和锁定项还在。");
      persist(true);
    }
    syncOnlineState();
    window.requestAnimationFrame(() => {
      fitCanvas();
      const params = new URLSearchParams(window.location.search);
      if (params.get("history") === "1") {
        els.historyDialog.showModal();
      }
      if (params.get("state") === "failed") {
        showFeedback("failed", "生成没有完成", "没有扣减次数，输入和锁定项仍保留。");
      }
      if (params.get("state") === "restored") {
        showFeedback("restored", "上次生成已中断", "已恢复最近保存的版本，输入和锁定项还在。");
      }
      if (params.get("state") === "offline") {
        els.offlineBanner.hidden = false;
        setSaveStatus("离线", "error");
      }
    });
  }

  init();
})();
