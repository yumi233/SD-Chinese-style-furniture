(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const canvas = $("#hero-canvas");
  const settings = { mode: "dither", grain: 5, intensity: 70, texture: 2, fontSize: 10, sample: "dark", mask: 88 };
  function draw() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * Math.min(devicePixelRatio || 1, 2));
    canvas.height = Math.round(r.height * Math.min(devicePixelRatio || 1, 2));
    Furniture.render(canvas, { type: "chair", thin: true }, { ...settings, zoom: 1.1, panY: -canvas.height * .07 });
  }
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    settings.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    settings.mask = settings.mode === "ascii" ? 90 : 88; $("#mask").value = settings.mask; draw();
  }));
  const bindings = { grain: "grain", "font-size": "fontSize", intensity: "intensity", texture: "texture", sample: "sample", mask: "mask" };
  for (const [id, key] of Object.entries(bindings)) $("#" + id).addEventListener("input", e => { settings[key] = key === "sample" ? e.target.value : Number(e.target.value); $("#grain-value").value = settings.grain; draw(); });
  $("#effect-settings").addEventListener("click", () => { const panel = $("#effect-panel"); panel.hidden = !panel.hidden; $("#effect-settings").setAttribute("aria-expanded", String(!panel.hidden)); });
  $("#quick-start").addEventListener("submit", e => { e.preventDefault(); const prompt = $("#home-prompt").value.trim() || "一把适合小空间的轻盈新中式圈椅，白蜡木，保留环抱感。"; location.href = "studio.html?prompt=" + encodeURIComponent(prompt); });
  new ResizeObserver(draw).observe(canvas); draw();
})();
