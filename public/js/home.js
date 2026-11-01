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

// The pre-rendered ASCII stays as the fallback; a live field drawn from the same crop fades in over
// it, drifts slowly and answers the pointer with a lens. Any failure leaves the still image.
const art = document.querySelector(".hero__art");
// Phones still get the drift and the touch ripple; only the hover lens needs a fine pointer.
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
if (art && "IntersectionObserver" in window && !reduced()) {
  const narrow = matchMedia("(max-width: 720px)").matches;
  // Same crops as the still renders (x, y, w, h as fractions of the source photo).
  const crop = narrow ? [0.4, 0.02, 0.6, 0.96] : [0, 0.06, 1, 0.88];
  const zone = narrow ? { x: 0, y: 0.48, w: 0.9, h: 0.38 } : { x: 0.02, y: 0.52, w: 0.44, h: 0.44 };
  const photo = new Image();
  photo.decoding = "async";
  photo.src = "/assets/hero-meadow.png";
  photo.decode().then(async () => {
    const source = document.createElement("canvas");
    source.width = Math.round(photo.naturalWidth * crop[2]);
    source.height = Math.round(photo.naturalHeight * crop[3]);
    source.getContext("2d").drawImage(photo, photo.naturalWidth * crop[0], photo.naturalHeight * crop[1], source.width, source.height, 0, 0, source.width, source.height);
    const { mountAsciiField, createSettings } = await import("./modules/ascii-field.js");
    mountAsciiField(art, { source, look: "paper", titleZone: zone, drift: true, ripple: true, lens: finePointer, lightPaper: true, settings: createSettings({ filter: "ascii" }) });
    art.classList.add("is-live");
  }).catch(() => { /* keep the still image */ });
}

// Works wall: a held finger (or mouse button) develops the photo; letting go returns the draft.
document.querySelectorAll(".work").forEach((work) => {
  const open = (event) => { if (event.pointerType !== "mouse" || event.button === 0) work.classList.add("is-open"); };
  const close = () => work.classList.remove("is-open");
  work.addEventListener("pointerdown", open);
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => work.addEventListener(type, close));
  work.addEventListener("contextmenu", (event) => event.preventDefault());
});
