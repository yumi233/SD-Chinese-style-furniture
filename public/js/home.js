import "./modules/dock.js";
import { mountHomeDemo } from "./home/demo.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// The prompt enters the real studio; phrases only fill it in.
const form = $("heroPrompt");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("homePrompt").value.trim() || $("homePrompt").placeholder;
  location.assign(`/studio?prompt=${encodeURIComponent(text)}`);
});
mountHomeDemo($("studioDemo"), { reduced });
document.querySelectorAll("[data-seed]").forEach((button) => button.addEventListener("click", () => {
  $("homePrompt").value = button.dataset.seed;
  $("homePrompt").focus();
}));

// The dock waits until the hero has scrolled away, so it never covers the prompt and phrases.
const dock = document.querySelector(".dock");
const hero = document.querySelector(".hero");
if (dock && hero && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => dock.classList.toggle("is-shown", !entry.isIntersecting), { threshold: 0 }).observe(hero);
} else dock?.classList.add("is-shown");
