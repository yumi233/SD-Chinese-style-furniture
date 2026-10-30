/**
 * 木生 · 构形工作台 (Musheng Studio)
 * 主交互逻辑驱动模块
 * 离线运行，遵循原生 ES6+
 */

(function () {
  "use strict";

  // 检查是否具备家具渲染器
  if (typeof FurnitureRenderer === "undefined") {
    console.error("FurnitureRenderer 未载入");
    return;
  }

  const renderer = new FurnitureRenderer();

  // ==================== 全局状态树 ====================
  const studioState = {
    currentState: "success", // empty, generating, partial, success, failed, stopped, offline, hydrated
    viewMode: "solid",       // solid, dither, ascii, blueprint
    activeTool: "pan",       // pan, boxEdit, compare
    transform: { scale: 1.0, x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    
    // 着色器微调参数 (BRIEF 5.2 规范)
    filters: {
      pixelSize: 4,
      verticalMask: 88,
      contrast: 1.25,
      quantLevels: 4
    },

    // 智能体与生成配置
    config: {
      style: "song",
      type: "armchair",
      rounds: 2,
      targetScore: 85,
      ratio: "16:9"
    },

    // 版本管理树
    versions: [
      {
        id: "V1",
        name: "初稿骨架方案",
        note: "标准比例 · 初步形态",
        score: 82,
        params: {
          type: "armchair",
          style: "song",
          armThinness: 1.2,
          cushionColor: "#D8D2C6"
        },
        scores: { cultural: 85, structural: 84, material: 80, innovation: 78, spatial: 82, ai: 83 },
        suggestion: "月牙大弧舒展，但扶手稍显粗重，可适度减薄并强化鹅脖交接轻悬感。"
      },
      {
        id: "V2",
        name: "智能体自修迭代",
        note: "优化扶手弧率与座面",
        score: 89,
        params: {
          type: "armchair",
          style: "song",
          armThinness: 0.85,
          cushionColor: "#EAE6DF"
        },
        scores: { cultural: 92, structural: 90, material: 86, innovation: 91, spatial: 88, ai: 87 },
        suggestion: "月牙扶手弧度圆融清雅，但前鹅脖立柱与坐盘交界处可更纤薄收束，提升轻悬感。"
      }
    ],
    activeVersionIdx: 1,
    compareVersionIdx: 0,

    // 框选局部状态
    boxSelect: {
      active: false,
      startX: 0,
      startY: 0,
      rect: null
    },

    // 生成任务计时器
    taskInterval: null,
    taskProgress: 100,
    taskStartTime: 0
  };

  // ==================== DOM 元素索引 ====================
  const dom = {
    viewport: document.getElementById("viewport"),
    canvasWrapper: document.getElementById("canvasWrapper"),
    mainCanvas: document.getElementById("mainCanvas"),
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

    // 工具栏按钮
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

    // 任务状态卡片
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
    versionCountBadge: document.getElementById("versionCountBadge"),

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

    if (studioState.currentState === "empty") {
      const ctx = dom.mainCanvas.getContext("2d");
      ctx.clearRect(0, 0, dom.mainCanvas.width, dom.mainCanvas.height);
      ctx.fillStyle = "#111419";
      ctx.fillRect(0, 0, dom.mainCanvas.width, dom.mainCanvas.height);
      ctx.fillStyle = "#4B5563";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("等待输入构想描述并触发推演...", dom.mainCanvas.width / 2, dom.mainCanvas.height / 2);
      return;
    }

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

    // 如果处于对比模式，同时渲染对比画布
    if (studioState.activeTool === "compare" && dom.compareCanvas) {
      const cmpVer = studioState.versions[studioState.compareVersionIdx] || studioState.versions[0];
      const cmpOptions = Object.assign({}, renderOptions, {
        armThinness: cmpVer.params.armThinness,
        cushionColor: cmpVer.params.cushionColor,
        mode: "solid"
      });
      renderer.render(dom.compareCanvas, cmpOptions);
    }
  }

  // ==================== 画布平移与缩放 (CAD 级交互) ====================
  function updateCanvasTransform() {
    const t = studioState.transform;
    dom.canvasWrapper.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    dom.zoomText.textContent = Math.round(t.scale * 100) + "%";
  }

  function setupCanvasInteractions() {
    const vp = dom.viewport;

    // 滚轮缩放 (以鼠标光标所在点为焦点)
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.max(0.3, Math.min(3.5, studioState.transform.scale * delta));
      studioState.transform.scale = nextScale;
      updateCanvasTransform();
    }, { passive: false });

    // 缩放按钮
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

    // 鼠标拖拽平移与框选
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
          // 显示框选修改输入气泡
          showInpaintPopover(e.clientX, e.clientY);
        } else {
          dom.selectionBox.style.display = "none";
        }
      }
    });
  }

  // ==================== 框选改一处 (Inpainting) ====================
  function showInpaintPopover(clientX, clientY) {
    const pop = dom.inpaintPopover;
    pop.style.display = "flex";
    pop.style.left = Math.min(window.innerWidth - 300, clientX + 12) + "px";
    pop.style.top = Math.max(60, clientY - 40) + "px";
    dom.selectedRegionDesc.textContent = "圈椅月牙扶手与立柱交接处";
    dom.inpaintPrompt.value = "扶手减薄 40%，端头收窄，保留黑胡桃微晶质感";
    dom.inpaintPrompt.focus();
  }

  function hideInpaintPopover() {
    dom.inpaintPopover.style.display = "none";
    dom.selectionBox.style.display = "none";
  }

  function applyInpaintingModification() {
    hideInpaintPopover();
    // 触发局部重绘，生成 V3
    const currentVer = studioState.versions[studioState.activeVersionIdx];
    const newVersion = {
      id: "V" + (studioState.versions.length + 1),
      name: "局部框改: 扶手纤薄收窄",
      note: "保留圈身骨相 · 削薄扶手40%",
      score: 93,
      params: Object.assign({}, currentVer.params, {
        armThinness: 0.55,
        cushionColor: "#D0C9BE"
      }),
      scores: {
        cultural: 94,
        structural: 92,
        material: 90,
        innovation: 96,
        spatial: 91,
        ai: 92
      },
      suggestion: "扶手收窄后体量极具当代轻悬感，榫卯节点已通过微应力验算，建议锁定此状态。"
    };

    triggerGenerationFlow(newVersion);
  }

  // ==================== 版本对比 (Diff Compare) ====================
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

  // ==================== 智能体推演过程模拟 (真实感 4 阶段) ====================
  function triggerGenerationFlow(nextVersionData) {
    if (studioState.currentState === "generating") return;

    setAppState("generating");
    studioState.taskProgress = 0;
    studioState.taskStartTime = Date.now();

    dom.btnStopTask.style.display = "inline-flex";
    dom.taskTimer.textContent = "0.0s";
    dom.taskStatusNote.textContent = "智能体集群正在推演器物受力与形态...";

    // 逐步推进阶段
    const phases = [
      { progress: 25, stepIdx: 0, title: "1. 意向解构与榫卯受力分析", time: 700 },
      { progress: 55, stepIdx: 1, title: "2. 骨相起稿与形态演化", time: 1500 },
      { progress: 80, stepIdx: 2, title: "3. 材质纹理与环境光影烘焙", time: 2300 },
      { progress: 100, stepIdx: 3, title: "4. 视觉多维专家模型评审", time: 3100 }
    ];

    dom.steps.forEach(s => {
      s.className = "task-step";
    });
    dom.steps[0].classList.add("current");

    const timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - studioState.taskStartTime) / 1000).toFixed(1);
      dom.taskTimer.textContent = elapsed + "s";
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

        // 阶段 4 完成：写入版本并切为成功态
        if (index === phases.length - 1) {
          clearInterval(timerInterval);
          setTimeout(() => {
            if (studioState.currentState !== "generating") return;

            dom.steps.forEach(s => s.className = "task-step completed");
            dom.btnStopTask.style.display = "none";
            dom.taskTimer.textContent = "已完成 (3.2s)";

            if (nextVersionData) {
              studioState.versions.push(nextVersionData);
              studioState.activeVersionIdx = studioState.versions.length - 1;
            }

            setAppState("success");
            updateVersionUI();
            updateReviewUI();
            renderActiveView();
          }, 400);
        }
      }, p.time);
    });
  }

  // ==================== 八类状态基准设置 (Benchmark States) ====================
  function setAppState(state) {
    studioState.currentState = state;

    // 更新底部 benchmark 按钮高亮
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
        dom.taskStatusTitle.textContent = "等待任务";
        dom.taskTimer.textContent = "空闲";
        dom.taskProgressBar.style.width = "0%";
        dom.steps.forEach(s => s.className = "task-step");
        dom.btnStopTask.style.display = "none";
        renderActiveView();
        break;

      case "generating":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "智能体自主推演中";
        break;

      case "partial":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "部分结果已渲染";
        dom.taskTimer.textContent = "草稿";
        dom.taskProgressBar.style.width = "60%";
        dom.steps[0].className = "task-step completed";
        dom.steps[1].className = "task-step completed";
        dom.steps[2].className = "task-step current";
        dom.steps[3].className = "task-step";
        renderActiveView();
        break;

      case "success":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "推演成功 · 已锁定";
        dom.taskProgressBar.style.width = "100%";
        dom.steps.forEach(s => s.className = "task-step completed");
        dom.btnStopTask.style.display = "none";
        renderActiveView();
        break;

      case "failed":
        modal.style.display = "grid";
        icon.textContent = "⚠";
        icon.style.background = "rgba(239, 68, 68, 0.15)";
        icon.style.color = "var(--accent-red)";
        title.textContent = "模型服务连接超时";
        desc.textContent = "本次构形推演由于上游网络抖动中断。系统已保留当前参数与设计记忆，且未扣除任何生成点数与配额。";
        actionBtn.textContent = "重新尝试生成";
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
        title.textContent = "推演已由用户主动终止";
        desc.textContent = "任务已在第 2 阶段安全中止。当前中间草图已自动暂存，设计配额毫发无损。";
        actionBtn.textContent = "继续未完任务";
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
        title.textContent = "本地离线保护模式";
        desc.textContent = "当前处于脱机环境。所有本地 Canvas 引擎与 Bayer / ASCII 滤镜均可完全正常运行。";
        actionBtn.textContent = "切换为在线检查";
        actionBtn.onclick = () => {
          setAppState("success");
        };
        break;

      case "hydrated":
        modal.style.display = "none";
        dom.taskStatusTitle.textContent = "会话已刷新恢复";
        dom.taskTimer.textContent = "恢复于 10秒前";
        dom.taskStatusNote.textContent = "已自本地存储完整恢复上一轮评审与版本树。";
        renderActiveView();
        break;
    }
  }

  // ==================== 界面状态更新 (Review & Version Tree) ====================
  function updateReviewUI() {
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
    dom.versionCountBadge.textContent = studioState.versions.length + " 个版本";
    dom.versionList.innerHTML = "";

    studioState.versions.forEach((ver, idx) => {
      const item = document.createElement("div");
      item.className = "version-item" + (idx === studioState.activeVersionIdx ? " active" : "");
      item.innerHTML = `
        <div class="version-info">
          <div class="version-tag">${ver.id} · ${ver.name}</div>
          <div class="version-note">${ver.note} · 评分: ${ver.score}</div>
        </div>
        <div class="version-actions">
          <button class="preset-chip ${idx === studioState.activeVersionIdx ? "active" : ""}">
            ${idx === studioState.activeVersionIdx ? "当前" : "切入"}
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

  // ==================== 导出规格展卡 (Export Spec Sheet) ====================
  function openExportModal() {
    const curVer = studioState.versions[studioState.activeVersionIdx];
    dom.exportVersionTag.textContent = `${curVer.id} (${curVer.name})`;
    dom.exportScoreNum.textContent = `${curVer.score}/100`;

    // 在展卡专用画布中绘制
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
      link.download = `musheng-furniture-${studioState.versions[studioState.activeVersionIdx].id}.png`;
      link.href = dom.exportCanvas.toDataURL("image/png");
      link.click();
    });
  }

  // ==================== 界面事件总装 ====================
  function setupEventListeners() {
    // 渲染着色器视图切换 (Solid / Dither / ASCII / Blueprint)
    document.querySelectorAll("[data-vmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-vmode]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        studioState.viewMode = btn.dataset.vmode;
        renderActiveView();
      });
    });

    // 工具栏工具切换
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
      studioState.activeTool = "boxEdit";
      dom.toolBoxEdit.classList.add("active");
      dom.toolPan.classList.remove("active");
      dom.toolCompare.classList.remove("active");
      dom.viewport.classList.add("selecting");
      dom.compareContainer.style.display = "none";
    });

    dom.toolCompare.addEventListener("click", () => {
      if (studioState.activeTool === "compare") {
        // 关闭对比
        studioState.activeTool = "pan";
        dom.toolCompare.classList.remove("active");
        dom.toolPan.classList.add("active");
        dom.compareContainer.style.display = "none";
      } else {
        // 开启对比
        studioState.activeTool = "compare";
        dom.toolCompare.classList.add("active");
        dom.toolPan.classList.remove("active");
        dom.toolBoxEdit.classList.remove("active");
        dom.compareContainer.style.display = "block";
        renderActiveView();
      }
    });

    // 滤镜微调面板
    dom.toolDitherTune.addEventListener("click", () => {
      const p = dom.filterTunePanel;
      p.style.display = (p.style.display === "flex") ? "none" : "flex";
    });
    dom.btnCloseFilterTune.addEventListener("click", () => {
      dom.filterTunePanel.style.display = "none";
    });

    // 滤镜滑块
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
      dom.studioContrastVal.textContent = v.toFixed(2) + "x";
      renderActiveView();
    });

    // 框选改一处气泡按钮
    dom.btnApplyInpaint.addEventListener("click", applyInpaintingModification);
    dom.btnCancelInpaint.addEventListener("click", hideInpaintPopover);
    dom.btnCloseInpaint.addEventListener("click", hideInpaintPopover);

    // 智能体推演按钮
    dom.btnMainGenerate.addEventListener("click", () => triggerGenerationFlow());
    dom.btnHeaderGenerate.addEventListener("click", () => triggerGenerationFlow());
    dom.btnStopTask.addEventListener("click", () => setAppState("stopped"));

    // 采纳评审建议
    dom.btnAdoptSuggestion.addEventListener("click", () => {
      const currentVer = studioState.versions[studioState.activeVersionIdx];
      const newVersion = {
        id: "V" + (studioState.versions.length + 1),
        name: "专家建议自修版",
        note: "采纳鹅脖立柱纤薄收束建议",
        score: Math.min(96, currentVer.score + 3),
        params: Object.assign({}, currentVer.params, {
          armThinness: 0.68,
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
        suggestion: "全构件已进入高度平衡状态，各向榫卯比例均衡，可准备定稿出图。"
      };
      triggerGenerationFlow(newVersion);
    });

    // 风格起点选择
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

    // 预设提示词
    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pKey = btn.dataset.preset;
        if (pKey === "song-quanyi") {
          dom.promptInput.value = "当代宋韵极简圈椅，五接月牙扶手，轻悬舒展，深棕黑胡桃";
          studioState.config.type = "armchair";
          studioState.config.style = "song";
        } else if (pKey === "ming-tea") {
          dom.promptInput.value = "明式收分大平头条案，云纹牙头，冰盘沿攒边打槽";
          studioState.config.type = "table";
          studioState.config.style = "ming";
        } else if (pKey === "zen-bed") {
          dom.promptInput.value = "数字禅意三围板罗汉榻，鼓腿膨牙，内翻马蹄足，原色灰织硬包";
          studioState.config.type = "daybed";
          studioState.config.style = "zen";
        } else if (pKey === "curio") {
          dom.promptInput.value = "新中式错落几何博古架，非对称宋明开光，深黑木作与数字金属交融";
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

    // 8类状态 benchmark 切换按钮
    document.querySelectorAll("[data-set-state]").forEach(btn => {
      btn.addEventListener("click", () => {
        setAppState(btn.dataset.setState);
      });
    });

    // 移动端底部 Tab 切换
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

        // 对应更新 V1 / V2
        studioState.versions.forEach(v => {
          v.params.type = p.type;
          v.params.style = p.style;
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

    updateVersionUI();
    updateReviewUI();
    renderActiveView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
