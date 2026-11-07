const studies = [
  { key: "ming", image: "chair", name: "明式雅韵", tw: "明式雅韻" },
  { key: "newChinese", image: "bench", name: "当代简约", tw: "當代簡約" },
  { key: "song", image: "cabinet", name: "宋韵留白", tw: "宋韻留白" },
  { key: "zen", image: "lounge", name: "禅意空间", tw: "禪意空間" },
];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const hoverCapable = matchMedia("(any-hover: hover)");
for (const [index, root] of [...document.querySelectorAll("[data-idea-folder]")].entries()) {
  const cardsId = `idea-folder-cards-${index}`;
  root.innerHTML = `
    <div class="folder-shadow" aria-hidden="true"></div>
    <div class="folder-back" aria-hidden="true"><span></span></div>
    <button class="folder-front" type="button" aria-expanded="false" aria-controls="${cardsId}" aria-label="展开设计起点">
      <span class="folder-emblem" aria-hidden="true">M</span>
      <span class="folder-front-label"><span class="folder-title">设计起点</span><span class="folder-arrow" aria-hidden="true">↗</span></span>
    </button>
    <div class="folder-cards" id="${cardsId}" aria-hidden="true" inert>
      ${studies.map((s, i) => `<a class="folder-card" href="/studio?style=${s.key}" style="--card-index:${i}" aria-label="以${s.name}开始设计"><span class="folder-card-art"><img src="/assets/studies/${s.image}-tile.svg" alt="" draggable="false"/></span><span class="folder-card-label"><span class="folder-card-name">${s.name}</span><span aria-hidden="true">↗</span></span></a>`).join("")}
    </div>`;
  const trigger = root.querySelector(".folder-front");
  const cards = root.querySelector(".folder-cards");
  let hovered = false;
  let pinned = false;
  let suppressed = false;
  let leaveTimer;
  let frame = 0;
  let tiltX = 0;
  let tiltY = 0;
  function update() {
    const cardFocused = cards.contains(document.activeElement);
    const open = !suppressed && (hovered || pinned || cardFocused);
    root.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
    const traditional = document.documentElement.dataset.locale === "tw";
    const label = traditional ? "設計起點" : "设计起点";
    trigger.querySelector(".folder-title").textContent = label;
    trigger.setAttribute("aria-label", (open ? "收起" : traditional ? "展開" : "展开") + label);
    cards.querySelectorAll(".folder-card").forEach((card, i) => {
      const name = traditional ? studies[i].tw : studies[i].name;
      card.querySelector(".folder-card-name").textContent = name;
      card.setAttribute("aria-label", traditional ? `以${name}開始設計` : `以${name}开始设计`);
    });
    cards.inert = !open;
    cards.setAttribute("aria-hidden", String(!open));
  }
  function renderTilt() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      root.style.setProperty("--folder-tilt-x", `${tiltX}deg`);
      root.style.setProperty("--folder-tilt-y", `${tiltY}deg`);
      frame = 0;
    });
  }
  function resetTilt() { tiltX = tiltY = 0; renderTilt(); }
  root.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse" || !hoverCapable.matches) return;
    clearTimeout(leaveTimer);
    hovered = true;
    suppressed = false;
    update();
  });
  root.addEventListener("pointerleave", () => {
    resetTilt();
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { hovered = false; suppressed = false; update(); }, 100);
  });
  root.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType !== "mouse" || !hoverCapable.matches) return;
    const rect = root.getBoundingClientRect();
    tiltX = -((event.clientY - rect.top) / rect.height - .5) * 5;
    tiltY = ((event.clientX - rect.left) / rect.width - .5) * 7;
    renderTilt();
  });
  trigger.addEventListener("click", () => {
    const wasOpen = root.dataset.open === "true";
    pinned = !wasOpen;
    suppressed = wasOpen;
    update();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    trigger.focus({ preventScroll: true });
    pinned = false;
    suppressed = true;
    update();
    resetTilt();
  });
  root.addEventListener("focusin", update);
  root.addEventListener("focusout", () => queueMicrotask(update));
  document.addEventListener("click", (event) => {
    if (root.contains(event.target)) return;
    pinned = hovered = false;
    suppressed = true;
    update();
  });
  reduced.addEventListener("change", resetTilt);
  window.addEventListener("musheng:locale-change", update);
  update();
}
