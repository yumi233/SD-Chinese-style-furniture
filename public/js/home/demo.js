const CARD_WIDTH = 272;
const REVEAL_MS = 1100;
const SCORES = { 1: 88, 2: 92, 3: 94 };

export function mountHomeDemo(root, { reduced = () => false } = {}) {
  if (!root) return { generate() {} };
  const $ = id => document.getElementById(id);
  const canvas = $("demoCanvas");
  const world = $("demoWorld");
  const cardsHost = $("demoCards");
  const bubble = $("demoBubble");
  const compare = $("demoCompare");
  const slider = $("demoCompareSlider");
  const mobile = () => matchMedia("(max-width: 720px)").matches;
  const state = {
    manual: false,
    step: -1,
    versions: [],
    selected: 1,
    compareSelection: [],
    region: null,
    pan: { x: 0, y: 0 },
    run: 0,
    flow: 0,
  };
  let revealTimer = 0;
  let drag = null;
  let scrollFrame = 0;
  let scrollTimer = 0;

  const wait = ms => new Promise(resolve => {
    if (reduced()) resolve();
    else setTimeout(resolve, ms);
  });
  const setStatus = text => { $("demoStatus").textContent = text; };
  const setStep = step => {
    if (state.step === step) return;
    state.step = step;
    root.querySelectorAll("[data-demo-step]").forEach(button => {
      const active = Number(button.dataset.demoStep) === step;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      if (active && mobile()) button.scrollIntoView({ behavior: reduced() ? "instant" : "smooth", block: "nearest", inline: "nearest" });
    });
  };
  const markManual = () => {
    state.manual = true;
    state.flow += 1;
    state.run += 1;
    clearTimeout(revealTimer);
  };
  const moveCursor = (element, x, y, visible = true) => {
    element.style.setProperty("--cursor-x", `${x}px`);
    element.style.setProperty("--cursor-y", `${y}px`);
    element.classList.toggle("is-visible", visible);
  };
  const hideCursors = () => {
    $("demoAgentCursor").classList.remove("is-visible");
    $("demoYouCursor").classList.remove("is-visible");
  };
  const applyPan = () => {
    world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px)`;
    canvas.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
  };
  const panToVersion = version => {
    const card = cardsHost.querySelector(`[data-version="${version}"]`);
    if (!card) return;
    const right = card.offsetLeft + card.offsetWidth + state.pan.x;
    const left = card.offsetLeft + state.pan.x;
    if (right > canvas.clientWidth - 16) state.pan.x -= right - canvas.clientWidth + 24;
    if (left < 16) state.pan.x += 24 - left;
    applyPan();
  };
  const drawEdges = () => {
    const paths = state.versions.filter(version => version > 1).map(version => {
      const from = cardsHost.querySelector('[data-version="1"]');
      const to = cardsHost.querySelector(`[data-version="${version}"]`);
      if (!from || !to) return "";
      const x1 = from.offsetLeft + from.offsetWidth / 2;
      const y1 = from.offsetTop + 144;
      const x2 = to.offsetLeft;
      const y2 = to.offsetTop + 144;
      if (x2 < x1) {
        const fromBottom = from.offsetTop + from.offsetHeight;
        const toTop = to.offsetTop;
        return `<path d="M ${x1} ${fromBottom} C ${x1} ${fromBottom + 64}, ${x2 + CARD_WIDTH / 2} ${toTop - 64}, ${x2 + CARD_WIDTH / 2} ${toTop}" />`;
      }
      const bend = Math.max(48, (x2 - x1) / 2);
      return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" />`;
    });
    $("demoEdges").innerHTML = paths.join("");
  };
  const updateCards = () => {
    cardsHost.querySelectorAll(".demo-version").forEach(card => {
      const version = Number(card.dataset.version);
      card.classList.toggle("is-selected", state.selected === version && compare.hidden);
      card.classList.toggle("is-compared", state.compareSelection.includes(version));
      const compareButton = card.querySelector("[data-card-compare]");
      compareButton.setAttribute("aria-pressed", String(state.compareSelection.includes(version)));
    });
    drawEdges();
  };
  const makeCard = (version, revealing) => {
    const card = document.createElement("article");
    card.className = `demo-version${revealing ? " is-revealing" : ""}`;
    card.dataset.version = String(version);
    card.innerHTML = `
      <header class="demo-version__head"><strong>v${version}</strong><span class="demo-version__score${revealing ? " demo-version__score--pending" : ""}">${revealing ? "···" : SCORES[version]}</span></header>
      <div class="demo-version__media"><img src="${version === 1 ? "/assets/hero-meadow.png" : "/assets/hero-tall.webp"}" alt="浅木椅第 ${version} 版" draggable="false" /><canvas class="demo-version__pixels" width="32" height="24" aria-hidden="true" hidden></canvas></div>
      <div class="demo-version__actions">
        <button type="button" data-card-region>改一处</button>
        <button type="button" data-card-arm>改扶手</button>
        <button type="button" data-card-compare aria-pressed="false">对比</button>
      </div>`;
    card.querySelector("[data-card-region]").addEventListener("click", () => {
      markManual();
      setStep(1);
      armRegion(card);
    });
    card.querySelector("[data-card-arm]").addEventListener("click", () => {
      markManual();
      setStep(1);
      selectPreset(card);
    });
    card.querySelector("[data-card-compare]").addEventListener("click", () => {
      markManual();
      selectForCompare(version);
    });
    enableRegion(card);
    return card;
  };
  const pixelate = card => {
    if (reduced()) return () => {};
    const image = card.querySelector("img");
    const layer = card.querySelector(".demo-version__pixels");
    const context = layer.getContext("2d");
    if (!context) return () => {};
    const draw = () => {
      try {
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;
        const targetRatio = layer.width / layer.height;
        const sourceRatio = sourceWidth / sourceHeight;
        const width = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
        const height = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
        const objectX = version === 1 ? .72 : .56;
        const x = (sourceWidth - width) * objectX;
        const y = (sourceHeight - height) * .39;
        context.drawImage(image, x, y, width, height, 0, 0, layer.width, layer.height);
        layer.hidden = false;
      } catch {
        layer.hidden = true;
      }
    };
    if (image.complete && image.naturalWidth) draw();
    else image.addEventListener("load", draw, { once: true });
    return () => { layer.hidden = true; image.removeEventListener("load", draw); };
  };
  const addVersion = async (version, { instant = false, reveal = true } = {}) => {
    if (state.versions.includes(version)) return;
    state.versions.push(version);
    state.selected = version;
    const run = ++state.run;
    const card = makeCard(version, reveal && !instant && !reduced());
    cardsHost.append(card);
    updateCards();
    panToVersion(version);
    if (reveal && !instant && !reduced()) {
      const stopPixels = pixelate(card);
      setStatus(`v${version} · 显影中`);
      moveCursor($("demoAgentCursor"), Math.min(canvas.clientWidth - 96, 280), 96, true);
      await wait(REVEAL_MS);
      stopPixels();
      if (run !== state.run || !card.isConnected) return;
      card.classList.remove("is-revealing");
    }
    const score = card.querySelector(".demo-version__score");
    score.textContent = String(SCORES[version]);
    score.classList.remove("demo-version__score--pending");
    setStatus(`v${version} · ${SCORES[version]}`);
    if (state.step === 0) moveCursor($("demoAgentCursor"), Math.min(canvas.clientWidth - 100, 200), 92, true);
  };
  const ensureV1 = options => addVersion(1, options);
  const ensureV2 = options => addVersion(2, options);
  const closeBubble = () => {
    bubble.hidden = true;
    state.region = null;
    canvas.classList.remove("is-region");
    canvas.querySelectorAll(".demo-selection").forEach(selection => selection.remove());
  };
  const closeCompare = () => {
    const wasOpen = !compare.hidden;
    compare.hidden = true;
    state.compareSelection = [];
    $("demoCompareMode").setAttribute("aria-pressed", "false");
    $("demoModifyMode").setAttribute("aria-pressed", "true");
    if (wasOpen) $("demoCompareClose").focus({ preventScroll: true });
    hideCursors();
    updateCards();
  };
  const openCompare = () => {
    if (!state.versions.includes(2)) return;
    closeBubble();
    state.compareSelection = [1, 2];
    compare.hidden = false;
    setStep(2);
    $("demoCompareMode").setAttribute("aria-pressed", "true");
    $("demoModifyMode").setAttribute("aria-pressed", "false");
    slider.value = "50";
    $("demoCompareStage").style.setProperty("--compare-value", "50%");
    moveCursor($("demoAgentCursor"), canvas.clientWidth * .5 + 20, canvas.clientHeight * .55, true);
    slider.focus({ preventScroll: true });
    updateCards();
  };
  const selectForCompare = version => {
    closeCompare();
    setStep(2);
    if (state.compareSelection.includes(version)) state.compareSelection = state.compareSelection.filter(item => item !== version);
    else state.compareSelection = [...state.compareSelection, version].slice(-2);
    if (state.compareSelection.length === 2) {
      if (state.compareSelection.includes(1) && state.compareSelection.includes(2)) openCompare();
      else state.compareSelection = [1, 2], openCompare();
    } else {
      setStatus(`已选 v${version} · 再选一版`);
      updateCards();
    }
  };
  const showBubble = (card, box) => {
    state.region = { version: Number(card.dataset.version), box };
    bubble.hidden = false;
    $("demoChange").value = "扶手再薄一点";
    $("demoChange").focus({ preventScroll: true });
    setStep(1);
    const media = card.querySelector(".demo-version__media");
    moveCursor($("demoYouCursor"), card.offsetLeft + state.pan.x + media.offsetWidth * .7, card.offsetTop + state.pan.y + 112, true);
  };
  const selectPreset = card => {
    canvas.querySelectorAll(".demo-selection").forEach(selection => selection.remove());
    const box = { x: .28, y: .24, width: .5, height: .24 };
    const selection = document.createElement("span");
    selection.className = "demo-selection";
    Object.assign(selection.style, { left: "28%", top: "24%", width: "50%", height: "24%" });
    card.querySelector(".demo-version__media").append(selection);
    showBubble(card, box);
  };
  function armRegion(card) {
    closeCompare();
    closeBubble();
    canvas.classList.add("is-region");
    card.querySelector(".demo-version__media").classList.add("is-armed");
    setStatus("在图上框选扶手");
    card.querySelector(".demo-version__media").scrollIntoView({ behavior: reduced() ? "instant" : "smooth", block: "nearest", inline: "nearest" });
  }
  function enableRegion(card) {
    const media = card.querySelector(".demo-version__media");
    media.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      markManual();
      setStep(1);
      closeBubble();
      canvas.classList.add("is-region");
      const bounds = media.getBoundingClientRect();
      const selection = document.createElement("span");
      selection.className = "demo-selection";
      media.append(selection);
      drag = { type: "region", media, card, bounds, selection, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId };
      media.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    media.addEventListener("pointermove", event => {
      if (drag?.type !== "region" || drag.media !== media) return;
      const left = Math.max(0, Math.min(event.clientX, drag.startX) - drag.bounds.left);
      const top = Math.max(0, Math.min(event.clientY, drag.startY) - drag.bounds.top);
      const right = Math.min(drag.bounds.width, Math.max(event.clientX, drag.startX) - drag.bounds.left);
      const bottom = Math.min(drag.bounds.height, Math.max(event.clientY, drag.startY) - drag.bounds.top);
      Object.assign(drag.selection.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    });
    const finish = event => {
      if (drag?.type !== "region" || drag.media !== media) return;
      const current = drag;
      drag = null;
      const width = parseFloat(current.selection.style.width || "0");
      const height = parseFloat(current.selection.style.height || "0");
      if (width < 12 || height < 12) {
        current.selection.remove();
        selectPreset(card);
        return;
      }
      const box = {
        x: parseFloat(current.selection.style.left) / current.bounds.width,
        y: parseFloat(current.selection.style.top) / current.bounds.height,
        width: width / current.bounds.width,
        height: height / current.bounds.height,
      };
      showBubble(card, box);
      if (event.pointerId !== undefined && media.hasPointerCapture(event.pointerId)) media.releasePointerCapture(event.pointerId);
    };
    media.addEventListener("pointerup", finish);
    media.addEventListener("pointercancel", () => { drag = null; });
  }
  const runStep = async step => {
    const flow = ++state.flow;
    setStep(step);
    closeBubble();
    closeCompare();
    hideCursors();
    if (step === 0) {
      await ensureV1({ reveal: true });
      if (flow !== state.flow) return;
      moveCursor($("demoAgentCursor"), Math.min(canvas.clientWidth - 100, 200), 92, true);
    } else if (step === 1) {
      await ensureV1({ instant: true });
      if (flow !== state.flow) return;
      const card = cardsHost.querySelector('[data-version="1"]');
      selectPreset(card);
    } else if (step === 2) {
      await ensureV1({ instant: true });
      await ensureV2({ reveal: true });
      if (flow !== state.flow) return;
      openCompare();
    } else {
      await ensureV1({ instant: true });
      await ensureV2({ instant: true });
      if (flow !== state.flow) return;
      state.selected = 2;
      setStatus("v2 · 92");
      updateCards();
      panToVersion(2);
      const rect = $("demoExport").getBoundingClientRect();
      const base = canvas.getBoundingClientRect();
      moveCursor($("demoYouCursor"), rect.left - base.left, Math.min(canvas.clientHeight - 40, rect.top - base.top), true);
    }
  };
  const goToStep = step => {
    runStep(step);
    if (mobile() || reduced()) return;
    const rootTop = root.getBoundingClientRect().top + scrollY;
    const travel = Math.max(1, root.offsetHeight - innerHeight);
    const scrollTarget = rootTop + travel * (step + 1) / 4 + 4;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { scrollTarget = null; }, 1600);
    scrollTo({ top: scrollTarget, behavior: "instant" });
  };

  root.querySelectorAll("[data-demo-step]").forEach(button => button.addEventListener("click", () => goToStep(Number(button.dataset.demoStep))));
  $("demoGenerate").addEventListener("click", () => {
    markManual();
    $("demoDraft").hidden = true;
    cardsHost.replaceChildren();
    state.versions = [];
    setStep(0);
    addVersion(1, { reveal: true });
  });
  $("demoModifyMode").addEventListener("click", () => {
    markManual();
    closeCompare();
    setStep(1);
    ensureV1({ instant: true }).then(() => selectPreset(cardsHost.querySelector('[data-version="1"]')));
  });
  $("demoCompareMode").addEventListener("click", async () => {
    markManual();
    await ensureV1({ instant: true });
    await ensureV2({ reveal: true });
    openCompare();
  });
  $("demoCompareClose").addEventListener("click", () => { markManual(); closeCompare(); setStep(2); });
  slider.addEventListener("input", () => {
    markManual();
    $("demoCompareStage").style.setProperty("--compare-value", `${slider.value}%`);
  });
  bubble.addEventListener("submit", event => {
    event.preventDefault();
    markManual();
    if (!$("demoChange").value.trim()) return;
    closeBubble();
    setStep(1);
    addVersion(state.versions.includes(2) ? 3 : 2, { reveal: true }).then(() => {
      moveCursor($("demoAgentCursor"), Math.min(canvas.clientWidth - 100, 260), 92, true);
    });
  });
  $("demoExport").addEventListener("click", () => {
    markManual();
    setStep(3);
    const version = state.selected || 1;
    const link = document.createElement("a");
    link.href = version === 1 ? "/assets/hero-meadow.png" : "/assets/hero-tall.webp";
    link.download = `木生-浅木椅-v${version}.${version === 1 ? "png" : "webp"}`;
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(`v${version} 已导出`);
  });
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button, input, .demo-version, .demo-draft")) return;
    markManual();
    drag = { type: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: state.pan.x, panY: state.pan.y };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-panning");
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", event => {
    if (drag?.type !== "pan") return;
    state.pan.x = drag.panX + event.clientX - drag.x;
    state.pan.y = drag.panY + event.clientY - drag.y;
    applyPan();
  });
  const endPan = () => { if (drag?.type === "pan") drag = null; canvas.classList.remove("is-panning"); };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("keydown", event => {
    if (event.target !== canvas) return;
    const directions = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (!directions[event.key]) return;
    markManual();
    event.preventDefault();
    state.pan.x += directions[event.key][0];
    state.pan.y += directions[event.key][1];
    applyPan();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !root.contains(document.activeElement)) return;
    closeBubble();
    closeCompare();
  });
  const onScroll = () => {
    if (scrollFrame || state.manual || reduced() || mobile()) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const rootTop = root.getBoundingClientRect().top + scrollY;
      const travel = Math.max(1, root.offsetHeight - innerHeight);
      const progress = Math.max(0, Math.min(.999, (scrollY - rootTop) / travel));
      if (scrollY < rootTop - innerHeight || scrollY > rootTop + root.offsetHeight) return;
      const step = Math.min(3, Math.floor(progress * 4));
      if (step !== state.step) runStep(step);
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { drawEdges(); onScroll(); }, { passive: true });
  if (mobile() || reduced()) runStep(0);
  else if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && state.step < 0 && !state.manual) runStep(0);
    }, { threshold: .08 }).observe(root);
  } else runStep(0);

  return {
    generate() {
      markManual();
      closeBubble();
      closeCompare();
      cardsHost.replaceChildren();
      state.versions = [];
      state.selected = 1;
      state.pan = { x: 0, y: 0 };
      applyPan();
      $("demoDraft").hidden = true;
      setStep(0);
      root.scrollIntoView({ behavior: reduced() ? "instant" : "smooth", block: "start" });
      addVersion(1, { reveal: true });
    },
  };
}
