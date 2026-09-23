import "./modules/dock.js";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const preview = document.getElementById("productPreview");
const productObject = document.getElementById("productObject");
const productImage = document.getElementById("productImage");
const live = document.getElementById("landingCaseLive");
const label = document.getElementById("landingCaseNumber");
const autoButton = document.getElementById("previewAutoRotate");

const views = [
  { nameCn: "正视", nameTw: "正視", src: "/assets/ming-chair-front-view.png", altCn: "明式圈椅正视图", altTw: "明式圈椅正視圖" },
  { nameCn: "左侧", nameTw: "左側", src: "/assets/ming-chair-side-view.png", altCn: "明式圈椅左侧视图", altTw: "明式圈椅左側視圖" },
  { nameCn: "后视", nameTw: "後視", src: "/assets/ming-chair-rear-view.png", altCn: "明式圈椅后视图", altTw: "明式圈椅後視圖" },
  { nameCn: "右侧", nameTw: "右側", src: "/assets/ming-chair-side-view.png", altCn: "明式圈椅右侧视图", altTw: "明式圈椅右側視圖", mirror: true },
];
let current = 0;
let timer = 0;
let pointerStart = null;

function stopAuto() {
  if (timer) window.clearInterval(timer);
  timer = 0;
  autoButton?.setAttribute("aria-pressed", "false");
}

function renderView() {
  if (!productImage || !productObject) return;
  const view = views[current];
  const traditional = document.documentElement.dataset.locale === "tw";
  const viewName = traditional ? view.nameTw : view.nameCn;
  productObject.classList.add("is-changing");
  window.setTimeout(() => {
    productImage.src = view.src;
    productImage.alt = traditional ? view.altTw : view.altCn;
    productImage.classList.toggle("is-mirrored", Boolean(view.mirror));
    productObject.classList.remove("is-changing");
  }, reducedMotion() ? 0 : 110);
  if (label) label.textContent = viewName;
  if (live) live.textContent = traditional ? `目前椅子視角：${viewName}` : `当前椅子视角：${viewName}`;
}

function rotate(delta, { pause = true } = {}) {
  if (pause) stopAuto();
  current = (current + delta + views.length) % views.length;
  renderView();
}

document.getElementById("previewRotateLeft")?.addEventListener("click", () => rotate(-1));
document.getElementById("previewRotateRight")?.addEventListener("click", () => rotate(1));
autoButton?.addEventListener("click", () => {
  if (reducedMotion()) {
    if (live) live.textContent = document.documentElement.dataset.locale === "tw"
      ? "系統已開啟減少動態效果；自動旋轉未啟動。"
      : "系统已开启减少动态效果；自动旋转未启动。";
    return;
  }
  if (timer) {
    stopAuto();
    if (live) live.textContent = document.documentElement.dataset.locale === "tw" ? "自動旋轉已暫停。" : "自动旋转已暂停。";
    return;
  }
  autoButton.setAttribute("aria-pressed", "true");
  if (live) live.textContent = document.documentElement.dataset.locale === "tw" ? "已開始自動旋轉；再次點擊可暫停。" : "已开始自动旋转；再次点击可暂停。";
  timer = window.setInterval(() => rotate(1, { pause: false }), 1400);
});

preview?.addEventListener("pointerdown", (event) => {
  stopAuto();
  pointerStart = event.clientX;
  preview.setPointerCapture?.(event.pointerId);
});
preview?.addEventListener("pointerup", (event) => {
  if (pointerStart === null) return;
  const delta = event.clientX - pointerStart;
  pointerStart = null;
  if (Math.abs(delta) >= 18) rotate(delta > 0 ? 1 : -1, { pause: false });
});
preview?.addEventListener("pointercancel", () => { pointerStart = null; });
preview?.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    rotate(-1);
  } else if (["ArrowRight", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    rotate(1);
  } else if (event.key === "Home") {
    event.preventDefault();
    stopAuto();
    current = 0;
    renderView();
  } else if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    autoButton?.click();
  }
});

renderView();
window.addEventListener("musheng:locale-change", renderView);
