/**
 * 木生 · 工作台 (Musheng Studio)
 * 主交互逻辑驱动模块
 * 离线运行，遵循原生 ES6+
 */

(function () {
  "use strict";

  if (typeof FurnitureRenderer === "undefined") {
    console.error("FurnitureRenderer 未载入");
    return;
  }

  const renderer = new FurnitureRenderer();

  // ==================== 全局状态树 ====================
  const studioState = {
    // 默认进入空态，从零开始生成
    currentState: "empty",
    viewMode: "solid",
    activeTool: "pan",
    transform: { scale: 1.0, x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },

    // 滤镜参数
    filters: {
      pixelSize: 4,
      verticalMask: 88,
      contrast: 1.25,
      quantLevels: 4
    },

    // 生成配置
    config: {
      style: "song",
      type: "armchair",
      rounds: 2,
      targetScore: 85,
      ratio: "16:9"
    },

    // 版本管理树：初始为空
    versions: [],
    activeVersionIdx: -1,
    compareVersionIdx: 0,

    // 框选局部
    boxSelect: {
      active: false,
      startX: 0,
      startY: 0,
      rect: null
    },

    // 生成计时
    taskInterval: null,
    taskProgress: 0,
    taskStartTime: 0
  };

  // ==================== DOM 元素索引 ====================
  const dom = {
    viewport: document.getElementById("viewport"),
    canvasWrapper: document.getElementById("canvasWrapper"),
    mainCanvas: document.getElementById("mainCanvas"),
    canvasEmptyGuide: document.getElementById("canvasEmptyGuide"),
    selectionBox: document.getElementById("selectionBox"),
    inpaintPopover: document.getElementById("inpaintPopover"),
    inpaintPrompt: document.getElementById("inpaintPrompt"),
    selectedRegionDesc: document.getElementById("selectedRegionDesc"),
    btnApplyInpaint: document.getElementById("btnApplyInpaint"),
    btnCancelInpaint: document.getElementById("btnCancelInpaint"),
    btnCloseInpaint: document.getElementById("btnCloseInpaint"),

    // 比较视图
    compareContainer: document.getElementById("compareContainer"),
    compareClippedLayer: document.getElementById("compareClippedLayer"),
    compareCanvas: document.getElementById("compareCanvas"),
    compareHandle: document.getElementById("compareHandle"),

    // 工具栏
    toolPan: document.getElementById("toolPan"),
    toolBoxEdit: document.getElementById("toolBoxEdit"),
    toolCompare: document.getElementById("toolCompare"),
    toolDitherTune: document.getElementById("toolDitherTune"),
    filterTunePanel: document.getElementById("filterTunePanel"),
    btnCloseFilterTune: document.getElementById("btnCloseFilterTune"),

    // 缩放
    zoomText: document.getElementById("zoomText"),
    btnZoomIn: document.getElementById("btnZoomIn"),
    btnZoomOut: document.getElementById("btnZoomOut"),
    btnZoomFit: document.getElementById("btnZoomFit"),

    // 任务状态
    taskStatusCard: document.getElementById("taskStatusCard"),
    taskStatusTitle: document.getElementById("taskStatusTitle"),
    taskTimer: document.getElementById("taskTimer"),
    taskProgressBar: document.getElementById("taskProgressBar"),
    taskStatusNote: document.getElementById("taskStatusNote"),
    btnStopTask: document.getElementById("btnStopTask"),
    steps: [
      document.getElementById("step1"),
      document.getElementById("step2"),
      document.getElementById("step3"),
      document.getElementById("step4")
    ],

    // 评审
    reviewEmptyPlaceholder: document.getElementById("reviewEmptyPlaceholder"),
    reviewContentArea: document.getElementById("reviewContentArea"),
    overallScoreVal: document.getElementById("overallScoreVal"),
    scoreCultural: document.getElementById("scoreCultural"),
    scoreStructural: document.getElementById("scoreStructural"),
    scoreMaterial: document.getElementById("scoreMaterial"),
    scoreInnovation: document.getElementById("scoreInnovation"),
    scoreSpatial: document.getElementById("scoreSpatial"),
    scoreAi: document.getElementById("scoreAi"),
    fillCultural: document.getElementById("fillCultural"),
    fillStructural: document.getElementById("fillStructural"),
    fillMaterial: document.getElementById("fillMaterial"),
    fillInnovation: document.getElementById("fillInnovation"),
    fillSpatial: document.getElementById("fillSpatial"),
    fillAi: document.getElementById("fillAi"),
    suggestionText: document.getElementById("suggestionText"),
    btnAdoptSuggestion: document.getElementById("btnAdoptSuggestion"),

    // 版本
    versionList: document.getElementById("versionList"),

    // 输入与生成
    promptInput: document.getElementById("promptInput"),
    btnMainGenerate: document.getElementById("btnMainGenerate"),
    btnHeaderGenerate: document.getElementById("btnHeaderGenerate"),

    // 状态模态
    statusModal: document.getElementById("statusModal"),
    statusModalIcon: document.getElementById("statusModalIcon"),
    statusModalTitle: document.getElementById("statusModalTitle"),
    statusModalDesc: document.getElementById("statusModalDesc"),
    btnDismissStatus: document.getElementById("btnDismissStatus"),
    btnStatusAction: document.getElementById("btnStatusAction"),

    // 导出展卡
    btnExportSpec: document.getElementById("btnExportSpec"),
    exportModal: document.getElementById("exportModal"),
    btnCloseExport: document.getElementById("btnCloseExport"),
    btnDownloadCard: document.getElementById("btnDownloadCard"),
    exportCanvas: document.getElementById("exportCanvas"),
    exportVersionTag: document.getElementById("exportVersionTag"),
    exportScoreNum: document.getElementById("exportScoreNum"),

    // 滤镜滑块
    studioPixelSlider: document.getElementById("studioPixelSlider"),
    studioPixelVal: document.getElementById("studioPixelVal"),
    studioMaskSlider: document.getElementById("studioMaskSlider"),
    studioMaskVal: document.getElementById("studioMaskVal"),
    studioContrastSlider: document.getElementById("studioContrastSlider"),
    studioContrastVal: document.getElementById("studioContrastVal"),

    // 侧边栏与移动端
    sidebarLeft: document.getElementById("sidebarLeft"),
    sidebarRight: document.getElementById("sidebarRight")
  };

  // ==================== 渲染核心逻辑 ====================
  function renderActiveView() {
    if (!dom.mainCanvas) return;

    if (studioState.currentState === "empty" || studioState.versions.length === 0) {
      const ctx = dom.mainCanvas.getContext("2d");
      ctx.clearRect(0, 0, dom.mainCanvas.width, dom.mainCanvas.height);
      ctx.fillStyle = "#0D0F12";
      ctx.fillRect(0, 0, dom.mainCanvas.width, dom.mainCanvas.height);

      // 绘制极轻量级设计网格背景
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < dom.mainCanvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dom.mainCanvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < dom.mainCanvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dom.mainCanvas.width, y);
        ctx.stroke();
      }

      if (dom.canvasEmptyGuide) dom.canvasEmptyGuide.style.display = "flex";
      return;
    }

    if (dom.canvasEmptyGuide) dom.canvasEmptyGuide.style.display = "none";

    const curVer = studioState.versions[studioState.activeVersionIdx] || studioState.versions[0];
    const renderOptions = {
      type: curVer.params.type,
      style: curVer.params.style,
      armThinness: curVer.params.armThinness,
      cushionColor: curVer.params.cushionColor,
      mode: studioState.viewMode,
      ditherParams: {
        pixelSize: studioState.filters.pixelSize,
        verticalMask: studioState.filters.verticalMask,
        contrast: studioState.filters.contrast,
        quantLevels: studioState.filters.quantLevels
      },
      asciiParams: {
        cellSize: studioState.filters.pixelSize * 2,
        scanlineMask: studioState.filters.verticalMask,
        contrast: studioState.filters.contrast
      }
    };

    renderer.render(dom.mainCanvas, renderOptions);

    if (studioState.activeTool === "compare" && dom.compareCanvas && studioState.versions.length > 1) {
      const cmpVer = studioState.versions[studioState.compareVersionIdx] || studioState.versions[0];
      const cmpOptions = Object.assign({}, renderOptions, {
        armThinness: cmpVer.params.armThinness,
        cushionColor: cmpVer.params.cushionColor,
        mode: "solid"
      });
      renderer.render(dom.compareCanvas, cmpOptions);
    }
  }

  // ==================== 画布平移与缩放 ====================
  function updateCanvasTransform() {
    const t = studioState.transform;
    dom.canvasWrapper.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    dom.zoomText.textContent = Math.round(t.scale * 100) + "%";
  }

  function setupCanvasInteractions() {
    const vp = dom.viewport;

    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.max(0.3, Math.min(3.5, studioState.transform.scale * delta));
      studioState.transform.scale = nextScale;
      updateCanvasTransform();
    }, { passive: false });

    dom.btnZoomIn.addEventListener("click", () => {
      studioState.transform.scale = Math.min(3.5, studioState.transform.scale * 1.2);
      updateCanvasTransform();
    });

    dom.btnZoomOut.addEventListener("click", () => {
      studioState.transform.scale = Math.max(0.3, studioState.transform.scale * 0.8);
      updateCanvasTransform();
    });

    dom.btnZoomFit.addEventListener("click", () => {
      studioState.transform.scale = 1.0;
      studioState.transform.x = 0;
      studioState.transform.y = 0;
      updateCanvasTransform();
    });

    vp.addEventListener("mousedown", (e) => {
      if (e.target.closest(".inpaint-popover") || e.target.closest(".compare-handle")) return;

      if (studioState.activeTool === "pan" || e.button === 1 || e.spaceKey) {
        studioState.isPanning = true;
        studioState.panStart.x = e.clientX - studioState.transform.x;
        studioState.panStart.y = e.clientY - studioState.transform.y;
        vp.classList.add("panning");
      } else if (studioState.activeTool === "boxEdit") {
        const rect = dom.canvasWrapper.getBoundingClientRect();
        studioState.boxSelect.active = true;
        studioState.boxSelect.startX = e.clientX - rect.left;
        studioState.boxSelect.startY = e.clientY - rect.top;
        dom.selectionBox.style.display = "block";
        dom.selectionBox.style.left = studioState.boxSelect.startX + "px";
        dom.selectionBox.style.top = studioState.boxSelect.startY + "px";
        dom.selectionBox.style.width = "0px";
        dom.selectionBox.style.height = "0px";
        dom.inpaintPopover.style.display = "none";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (studioState.isPanning) {
        studioState.transform.x = e.clientX - studioState.panStart.x;
        studioState.transform.y = e.clientY - studioState.panStart.y;
        updateCanvasTransform();
      } else if (studioState.boxSelect.active) {
        const rect = dom.canvasWrapper.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const left = Math.min(studioState.boxSelect.startX, curX);
        const top = Math.min(studioState.boxSelect.startY, curY);
        const width = Math.abs(curX - studioState.boxSelect.startX);
        const height = Math.abs(curY - studioState.boxSelect.startY);

        dom.selectionBox.style.left = left + "px";
        dom.selectionBox.style.top = top + "px";
        dom.selectionBox.style.width = width + "px";
        dom.selectionBox.style.height = height + "px";

        studioState.boxSelect.rect = { left, top, width, height };
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (studioState.isPanning) {
        studioState.isPanning = false;
        vp.classList.remove("panning");
      } else if (studioState.boxSelect.active) {
        studioState.boxSelect.active = false;
        const r = studioState.boxSelect.rect;
        if (r && r.width > 20 && r.height > 20) {
          showInpaintPopover(e.clientX, e.clientY);
        } else {
          dom.selectionBox.style.display = "none";
        }
      }
    });
  }

  // ==================== 框选改一处 ====================
  function showInpaintPopover(clientX, clientY) {
    const pop = dom.inpaintPopover;
    pop.style.display = "flex";
    pop.style.left = Math.min(window.innerWidth - 280, clientX + 8) + "px";
    pop.style.top = Math.max(50, clientY - 30) + "px";
    dom.selectedRegionDesc.textContent = "扶手与搭脑构件";
    dom.inpaintPrompt.value = "扶手减薄收窄，端头更轻";
    dom.inpaintPrompt.focus();
  }

  function hideInpaintPopover() {
    dom.inpaintPopover.style.display = "none";
    dom.selectionBox.style.display = "none";
  }

  function applyInpaintingModification() {
    hideInpaintPopover();
    const curIdx = studioState.activeVersionIdx >= 0 ? studioState.activeVersionIdx : 0;
    const currentVer = studioState.versions[curIdx] || {
      params: { type: studioState.config.type, style: studioState.config.style, armThinness: 1.0, cushionColor: "#D8D2C6" },
      score: 84
    };

    const newVersion = {
      id: "V" + (studioState.versions.length + 1),
      name: "扶手收窄改版",
      score: 91,
      params: Object.assign({}, currentVer.params, {
        armThinness: 0.6,
        cushionColor: "#D0C9BE"
      }),
      scores: {
        cultural: 93,
        structural: 91,
        material: 89,
        innovation: 95,
        spatial: 90,
        ai: 91
      },
      suggestion: "扶手收窄后线条更舒展，已通过受力校验，可作为定稿方案。"
    };

    triggerGenerationFlow(newVersion);
  }

  // ==================== 版本对比 ====================
  function setupCompareInteraction() {
    const handle = dom.compareHandle;
    const clip = dom.compareClippedLayer;
    let isDragging = false;

    function setComparePos(clientX) {
      const rect = dom.canvasWrapper.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(5, Math.min(95, pct));
      clip.style.width = pct + "%";
    }

    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isDragging = true;
    });

    window.addEventListener("mousemove", (e) => {
      if (isDragging) setComparePos(e.clientX);
    });

    window.addEventListener("mouseup", () => isDragging = false);

    handle.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      isDragging = true;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (isDragging && e.touches[0]) setComparePos(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener("touchend", () => isDragging = false);
  }

  // ==================== 智能体推演过程模拟 ====================
  function triggerGenerationFlow(nextVersionData) {
    if (studioState.currentState === "generating") return;

    setAppState("generating");
    studioState.taskProgress = 0;
    studioState.taskStartTime = Date.now();

    dom.btnStopTask.style.display = "inline-flex";
    dom.taskTimer.textContent = "0.0秒";
    dom.taskStatusNote.textContent = "正在推演受力与形态...";

    const phases = [
      { progress: 25, stepIdx: 0, time: 600 },
      { progress: 55, stepIdx: 1, time: 1300 },
      { progress: 80, stepIdx: 2, time: 2000 },
      { progress: 100, stepIdx: 3, time: 2700 }
    ];

    dom.steps.forEach(s => s.className = "task-step");
    dom.steps[0].classList.add("current");

    const timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - studioState.taskStartTime) / 1000).toFixed(1);
      dom.taskTimer.textContent = elapsed + "秒";
    }, 100);

    phases.forEach((p, index) => {
      setTimeout(() => {
        if (studioState.currentState !== "generating") return;

        dom.taskProgressBar.style.width = p.progress + "%";
        dom.steps.forEach((s, idx) => {
          if (idx < p.stepIdx) s.className = "task-step completed";
          else if (idx === p.stepIdx) s.className = "task-step current";
          else s.className = "task-step";
        });

        if (index === phases.length - 1) {
          clearInterval(timerInterval);
          setTimeout(() => {
            if (studioState.currentState !== "generating") return;

            dom.steps.forEach(s => s.className = "task-step completed");
            dom.btnStopTask.style.display = "none";
            dom.taskTimer.textContent = "完成 (2.8秒)";

            // 若无指定下一版（初次生成），生成 V1
            let verToApply = nextVersionData;
            if (!verToApply) {
              verToApply = {
                id: "V" + (studioState.versions.length + 1),
                name: "初稿方案",
                score: 84,
                params: {
                  type: studioState.config.type || "armchair",
                  style: studioState.config.style || "song",
                  armThinness: 1.0,
                  cushionColor: "#D8D2C6"
                },
                scores: {
                  cultural: 88,
                  structural: 85,
                  material: 83,
                  innovation: 82,
                  spatial: 84,
                  ai: 85
                },
                suggestion: "月牙扶手弧度圆融清雅，但前鹅脖立柱与坐盘交界处可更纤薄收束，提升轻悬感。"
              };
            }

            studioState.versions.push(verToApply);
            studioState.activeVersionIdx = studioState.versions.length - 1;

            setAppState("success");
            updateVersionUI();
            updateReviewUI();
            renderActiveView();
          }, 350);
        }
      }, p.time);
    });
  }

  // ==================== 八类状态设置 ====================
  function setAppState(state) {
    studioState.currentState = state;

    document.querySelectorAll("[data-set-state]").forEach(b => {
      b.classList.toggle("active", b.dataset.setState === state);
    });

    const modal = dom.statusModal;
    const title = dom.statusModalTitle;
    const desc = dom.statusModalDesc;
    const icon = dom.statusModalIcon;
    const actionBtn = dom.btnStatusAction;

    switch (state) {
      case "empty":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "生成过程";
        dom.taskTimer.textContent = "空闲";
        dom.taskProgressBar.style.width = "0%";
        dom.steps.forEach(s => s.className = "task-step");
        dom.btnStopTask.style.display = "none";
        dom.taskStatusNote.textContent = "准备就绪";
        dom.reviewEmptyPlaceholder.style.display = "block";
        dom.reviewContentArea.style.display = "none";
        dom.versionList.innerHTML = `<div style="font-size: 12px; color: var(--text-tertiary); text-align: center; padding: var(--space-2) 0;">暂无版本</div>`;
        renderActiveView();
        break;

      case "generating":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "正在生成";
        break;

      case "partial":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "阶段性草图";
        dom.taskTimer.textContent = "草稿";
        dom.taskProgressBar.style.width = "55%";
        dom.steps[0].className = "task-step completed";
        dom.steps[1].className = "task-step completed";
        dom.steps[2].className = "task-step current";
        dom.steps[3].className = "task-step";
        renderActiveView();
        break;

      case "success":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "生成完成";
        dom.taskProgressBar.style.width = "100%";
        dom.steps.forEach(s => s.className = "task-step completed");
        dom.btnStopTask.style.display = "none";
        dom.reviewEmptyPlaceholder.style.display = "none";
        dom.reviewContentArea.style.display = "flex";
        renderActiveView();
        break;

      case "failed":
        modal.style.display = "grid";
        icon.textContent = "!";
        icon.style.background = "rgba(239, 68, 68, 0.15)";
        icon.style.color = "var(--accent-red)";
        title.textContent = "连接超时";
        desc.textContent = "推演由于网络中断。已保留当前描述与设置，未扣除次数。";
        actionBtn.textContent = "重试生成";
        actionBtn.onclick = () => {
          modal.style.display = "none";
          triggerGenerationFlow();
        };
        break;

      case "stopped":
        modal.style.display = "grid";
        icon.textContent = "■";
        icon.style.background = "rgba(245, 158, 11, 0.15)";
        icon.style.color = "var(--accent-amber)";
        title.textContent = "已停止";
        desc.textContent = "推演已安全中止，已保留草图，不扣除次数。";
        actionBtn.textContent = "继续";
        actionBtn.onclick = () => {
          modal.style.display = "none";
          triggerGenerationFlow();
        };
        break;

      case "offline":
        modal.style.display = "grid";
        icon.textContent = "⚡";
        icon.style.background = "rgba(107, 114, 128, 0.15)";
        icon.style.color = "var(--text-secondary)";
        title.textContent = "脱机模式";
        desc.textContent = "当前处于离线状态。本地渲染与点阵滤镜完全可用。";
        actionBtn.textContent = "检查连接";
        actionBtn.onclick = () => {
          setAppState("success");
        };
        break;

      case "hydrated":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "已恢复";
        dom.taskTimer.textContent = "就绪";
        dom.taskStatusNote.textContent = "已恢复上一轮会话。";
        renderActiveView();
        break;
    }
  }

  // ==================== 界面状态更新 ====================
  function updateReviewUI() {
    if (studioState.versions.length === 0) {
      dom.reviewEmptyPlaceholder.style.display = "block";
      dom.reviewContentArea.style.display = "none";
      return;
    }

    dom.reviewEmptyPlaceholder.style.display = "none";
    dom.reviewContentArea.style.display = "flex";

    const curVer = studioState.versions[studioState.activeVersionIdx] || studioState.versions[0];
    const s = curVer.scores;

    dom.overallScoreVal.textContent = curVer.score;
    dom.scoreCultural.textContent = s.cultural;
    dom.scoreStructural.textContent = s.structural;
    dom.scoreMaterial.textContent = s.material;
    dom.scoreInnovation.textContent = s.innovation;
    dom.scoreSpatial.textContent = s.spatial;
    dom.scoreAi.textContent = s.ai;

    dom.fillCultural.style.width = s.cultural + "%";
    dom.fillStructural.style.width = s.structural + "%";
    dom.fillMaterial.style.width = s.material + "%";
    dom.fillInnovation.style.width = s.innovation + "%";
    dom.fillSpatial.style.width = s.spatial + "%";
    dom.fillAi.style.width = s.ai + "%";

    dom.suggestionText.textContent = curVer.suggestion;
  }

  function updateVersionUI() {
    if (studioState.versions.length === 0) {
      dom.versionList.innerHTML = `<div style="font-size: 12px; color: var(--text-tertiary); text-align: center; padding: var(--space-2) 0;">暂无版本</div>`;
      return;
    }

    dom.versionList.innerHTML = "";

    studioState.versions.forEach((ver, idx) => {
      const item = document.createElement("div");
      item.className = "version-item" + (idx === studioState.activeVersionIdx ? " active" : "");
      item.innerHTML = `
        <div class="version-info">
          <div class="version-tag">${ver.id} · ${ver.name}</div>
          <div class="version-note">评分: ${ver.score}</div>
        </div>
        <div class="version-actions">
          <button class="preset-chip ${idx === studioState.activeVersionIdx ? "active" : ""}">
            ${idx === studioState.activeVersionIdx ? "当前" : "查看"}
          </button>
        </div>
      `;

      item.addEventListener("click", () => {
        studioState.activeVersionIdx = idx;
        updateVersionUI();
        updateReviewUI();
        renderActiveView();
      });

      dom.versionList.appendChild(item);
    });
  }

  // ==================== 导出规格展卡 ====================
  function openExportModal() {
    const curVer = studioState.versions[studioState.activeVersionIdx] || {
      id: "V1",
      name: "初稿方案",
      score: 84,
      params: { type: studioState.config.type, style: studioState.config.style, armThinness: 1.0, cushionColor: "#D8D2C6" }
    };

    dom.exportVersionTag.textContent = `${curVer.id} (${curVer.name})`;
    dom.exportScoreNum.textContent = `${curVer.score}`;

    renderer.render(dom.exportCanvas, {
      type: curVer.params.type,
      style: curVer.params.style,
      armThinness: curVer.params.armThinness,
      cushionColor: curVer.params.cushionColor,
      mode: studioState.viewMode,
      ditherParams: studioState.filters
    });

    dom.exportModal.style.display = "grid";
  }

  function setupExportActions() {
    dom.btnExportSpec.addEventListener("click", openExportModal);
    dom.btnCloseExport.addEventListener("click", () => dom.exportModal.style.display = "none");
    dom.btnDismissStatus.addEventListener("click", () => dom.statusModal.style.display = "none");

    dom.btnDownloadCard.addEventListener("click", () => {
      const link = document.createElement("a");
      const verId = studioState.versions[studioState.activeVersionIdx] ? studioState.versions[studioState.activeVersionIdx].id : "V1";
      link.download = `musheng-${verId}.png`;
      link.href = dom.exportCanvas.toDataURL("image/png");
      link.click();
    });
  }

  // ==================== 事件总装 ====================
  function setupEventListeners() {
    document.querySelectorAll("[data-vmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-vmode]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        studioState.viewMode = btn.dataset.vmode;
        renderActiveView();
      });
    });

    dom.toolPan.addEventListener("click", () => {
      studioState.activeTool = "pan";
      dom.toolPan.classList.add("active");
      dom.toolBoxEdit.classList.remove("active");
      dom.toolCompare.classList.remove("active");
      dom.viewport.classList.remove("selecting");
      dom.compareContainer.style.display = "none";
      hideInpaintPopover();
    });

    dom.toolBoxEdit.addEventListener("click", () => {
      // 若尚未生成任何版本，自动先生成初版
      if (studioState.versions.length === 0) {
        triggerGenerationFlow();
      }
      studioState.activeTool = "boxEdit";
      dom.toolBoxEdit.classList.add("active");
      dom.toolPan.classList.remove("active");
      dom.toolCompare.classList.remove("active");
      dom.viewport.classList.add("selecting");
      dom.compareContainer.style.display = "none";
    });

    dom.toolCompare.addEventListener("click", () => {
      if (studioState.activeTool === "compare") {
        studioState.activeTool = "pan";
        dom.toolCompare.classList.remove("active");
        dom.toolPan.classList.add("active");
        dom.compareContainer.style.display = "none";
      } else {
        if (studioState.versions.length < 2) {
          // 若只有一个版本或空态，先生成第二版以便对比
          if (studioState.versions.length === 0) {
            triggerGenerationFlow();
          }
          const v2 = {
            id: "V" + (studioState.versions.length + 1),
            name: "局部收窄版",
            score: 91,
            params: {
              type: studioState.config.type || "armchair",
              style: studioState.config.style || "song",
              armThinness: 0.62,
              cushionColor: "#D0C9BE"
            },
            scores: { cultural: 93, structural: 91, material: 89, innovation: 95, spatial: 90, ai: 91 },
            suggestion: "扶手收窄后线条更为舒展轻灵。"
          };
          studioState.versions.push(v2);
          studioState.activeVersionIdx = studioState.versions.length - 1;
          studioState.compareVersionIdx = 0;
          updateVersionUI();
          updateReviewUI();
        }

        studioState.activeTool = "compare";
        dom.toolCompare.classList.add("active");
        dom.toolPan.classList.remove("active");
        dom.toolBoxEdit.classList.remove("active");
        dom.compareContainer.style.display = "block";
        renderActiveView();
      }
    });

    dom.toolDitherTune.addEventListener("click", () => {
      const p = dom.filterTunePanel;
      p.style.display = (p.style.display === "flex") ? "none" : "flex";
    });
    dom.btnCloseFilterTune.addEventListener("click", () => {
      dom.filterTunePanel.style.display = "none";
    });

    dom.studioPixelSlider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      studioState.filters.pixelSize = v;
      dom.studioPixelVal.textContent = v + "px";
      renderActiveView();
    });

    dom.studioMaskSlider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      studioState.filters.verticalMask = v;
      dom.studioMaskVal.textContent = v + "%";
      renderActiveView();
    });

    dom.studioContrastSlider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) / 100;
      studioState.filters.contrast = v;
      dom.studioContrastVal.textContent = v.toFixed(2);
      renderActiveView();
    });

    dom.btnApplyInpaint.addEventListener("click", applyInpaintingModification);
    dom.btnCancelInpaint.addEventListener("click", hideInpaintPopover);
    dom.btnCloseInpaint.addEventListener("click", hideInpaintPopover);

    dom.btnMainGenerate.addEventListener("click", () => triggerGenerationFlow());
    dom.btnHeaderGenerate.addEventListener("click", () => triggerGenerationFlow());
    dom.btnStopTask.addEventListener("click", () => setAppState("stopped"));

    dom.btnAdoptSuggestion.addEventListener("click", () => {
      const curIdx = studioState.activeVersionIdx >= 0 ? studioState.activeVersionIdx : 0;
      const currentVer = studioState.versions[curIdx] || {
        params: { type: studioState.config.type, style: studioState.config.style, armThinness: 1.0, cushionColor: "#D8D2C6" },
        score: 84
      };

      const newVersion = {
        id: "V" + (studioState.versions.length + 1),
        name: "建议自修版",
        score: Math.min(96, currentVer.score + 4),
        params: Object.assign({}, currentVer.params, {
          armThinness: 0.65,
          cushionColor: "#EAE6DF"
        }),
        scores: {
          cultural: 95,
          structural: 93,
          material: 91,
          innovation: 94,
          spatial: 92,
          ai: 90
        },
        suggestion: "全构件比例均衡，榫卯受力通过，可准备导出定稿。"
      };
      triggerGenerationFlow(newVersion);
    });

    document.querySelectorAll("[data-style-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-style-pick]").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        studioState.config.style = btn.dataset.stylePick;
        if (studioState.versions[studioState.activeVersionIdx]) {
          studioState.versions[studioState.activeVersionIdx].params.style = studioState.config.style;
          renderActiveView();
        }
      });
    });

    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pKey = btn.dataset.preset;
        if (pKey === "song-quanyi") {
          dom.promptInput.value = "宋韵极简圈椅，五接月牙扶手，轻悬舒展，深褐黑胡桃";
          studioState.config.type = "armchair";
          studioState.config.style = "song";
        } else if (pKey === "ming-tea") {
          dom.promptInput.value = "明式收分大平头条案，云纹牙头，冰盘沿攒边打槽";
          studioState.config.type = "table";
          studioState.config.style = "ming";
        } else if (pKey === "zen-bed") {
          dom.promptInput.value = "禅意三围板罗汉榻，鼓腿膨牙，内翻马蹄足，原色灰织硬包";
          studioState.config.type = "daybed";
          studioState.config.style = "zen";
        } else if (pKey === "curio") {
          dom.promptInput.value = "当代错落几何博古架，非对称宋明开光，深黑木作与金属交融";
          studioState.config.type = "shelf";
          studioState.config.style = "contemporary";
        }
        if (studioState.versions[studioState.activeVersionIdx]) {
          studioState.versions[studioState.activeVersionIdx].params.type = studioState.config.type;
          studioState.versions[studioState.activeVersionIdx].params.style = studioState.config.style;
          renderActiveView();
        }
      });
    });

    document.querySelectorAll("[data-set-state]").forEach(btn => {
      btn.addEventListener("click", () => {
        setAppState(btn.dataset.setState);
      });
    });

    document.querySelectorAll("[data-mobile-tab]").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll("[data-mobile-tab]").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const action = tab.dataset.mobileTab;

        if (action === "canvas") {
          dom.sidebarLeft.classList.remove("mobile-open");
          dom.sidebarRight.classList.remove("mobile-open");
        } else if (action === "prompt") {
          dom.sidebarLeft.classList.add("mobile-open");
          dom.sidebarRight.classList.remove("mobile-open");
        } else if (action === "review" || action === "versions") {
          dom.sidebarRight.classList.add("mobile-open");
          dom.sidebarLeft.classList.remove("mobile-open");
        } else if (action === "export") {
          openExportModal();
        }
      });
    });
  }

  // ==================== 初始化 ====================
  function init() {
    setupCanvasInteractions();
    setupCompareInteraction();
    setupExportActions();
    setupEventListeners();

    // 检查是否有首页传递过来的预设
    const presetRaw = sessionStorage.getItem("musheng_preset");
    if (presetRaw) {
      try {
        const p = JSON.parse(presetRaw);
        if (p.type) studioState.config.type = p.type;
        if (p.style) studioState.config.style = p.style;
        if (p.mode) studioState.viewMode = p.mode;

        // 根据传递的原型与风格预填提示词
        if (p.type === "armchair") {
          dom.promptInput.value = "宋韵极简圈椅，五接月牙扶手，纤薄轻悬，深褐黑胡桃";
        } else if (p.type === "table") {
          dom.promptInput.value = "明式收分大平头条案，云纹牙头，冰盘沿攒边打槽";
        } else if (p.type === "daybed") {
          dom.promptInput.value = "禅意三围板罗汉榻，鼓腿膨牙，内翻马蹄足，原色灰织硬包";
        } else if (p.type === "shelf") {
          dom.promptInput.value = "当代错落几何博古架，非对称宋明开光，深黑木作与金属交融";
        }

        // 高亮风格按钮
        document.querySelectorAll("[data-style-pick]").forEach(b => {
          b.classList.toggle("selected", b.dataset.stylePick === p.style);
        });

        // 激活对应的 header viewMode
        document.querySelectorAll("[data-vmode]").forEach(b => {
          b.classList.toggle("active", b.dataset.vmode === p.mode);
        });

        sessionStorage.removeItem("musheng_preset");
      } catch (err) {
        console.warn("预设读取跳过", err);
      }
    }

    // 默认空态：从零开始生成
    setAppState("empty");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
