import "./modules/dock.js";
import { mountHomeDemo } from "./home/demo.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// Only the main prompt enters the real studio; phrase buttons play the local demo.
const form = $("heroPrompt");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("homePrompt").value.trim() || $("homePrompt").placeholder;
  location.assign(`/studio?prompt=${encodeURIComponent(text)}`);
});
const demo = mountHomeDemo($("studioDemo"), { reduced });
document.querySelectorAll("[data-seed]").forEach((button) => button.addEventListener("click", () => {
  $("homePrompt").value = button.dataset.seed;
  demo.generate(button.dataset.seed);
}));

// The dock waits until the hero has scrolled away, so it never covers the prompt and phrases.
const dock = document.querySelector(".dock");
const hero = document.querySelector(".hero");
if (dock && hero && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => dock.classList.toggle("is-shown", !entry.isIntersecting), { threshold: 0 }).observe(hero);
} else dock?.classList.add("is-shown");
