import "./modules/dock.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// Seeds fill the prompt and go straight to the studio, which reads ?prompt=.
const form = $("heroPrompt");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("homePrompt").value.trim() || $("homePrompt").placeholder;
  location.assign(`/studio?prompt=${encodeURIComponent(text)}`);
});
document.querySelectorAll("[data-seed]").forEach((button) => button.addEventListener("click", () => {
  $("homePrompt").value = button.dataset.seed;
  form.requestSubmit();
}));

// Frame demo: v1 → v2 redevelops the picture once; pressing again goes back.
const orb = $("frameOrb");
$("frameDemo").addEventListener("click", (event) => {
  const on = !orb.classList.contains("is-v2");
  orb.classList.remove("is-v2");
  void orb.offsetWidth;
  orb.classList.toggle("is-v2", on);
  $("frameVersion").textContent = on ? "v2" : "v1";
  event.currentTarget.setAttribute("aria-pressed", String(on));
  event.currentTarget.firstChild.textContent = on ? "回到 v1 " : "看看 v2 ";
});

// Review rings draw in when they scroll into view.
const DIMS = [["文化", 87], ["结构", 90], ["工艺", 86], ["创新", 84], ["场景", 91], ["AI 运用", 89]];
const R = [108, 94, 80, 66, 52, 38];
$("dims").innerHTML = DIMS.map(([name, score]) => `<li><span>${name}</span><b>${score}</b></li>`).join("");
$("rings").innerHTML = DIMS.map(([, score], i) => `
  <circle cx="120" cy="120" r="${R[i]}" stroke="var(--line)" stroke-width="7"/>
  <circle data-score="${score}" cx="120" cy="120" r="${R[i]}" stroke="${i === 0 ? "var(--olive)" : "var(--ink)"}" stroke-opacity="${1 - i * 0.13}" stroke-width="7" stroke-dasharray="0 999" transform="rotate(-90 120 120)" style="transition-delay:${i * 110}ms"/>`).join("");
const draw = () => $("rings").querySelectorAll("[data-score]").forEach((circle) => {
  const length = 2 * Math.PI * circle.r.baseVal.value;
  circle.setAttribute("stroke-dasharray", `${(length * circle.dataset.score) / 100} ${length}`);
});
if (reduced() || !("IntersectionObserver" in window)) draw();
else new IntersectionObserver(([entry], observer) => { if (entry.isIntersecting) { draw(); observer.disconnect(); } }, { threshold: 0.4 }).observe($("rings"));
