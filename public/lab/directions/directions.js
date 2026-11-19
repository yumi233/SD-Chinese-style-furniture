import { uiCopy } from "/js/modules/locale.js";
import { renderHome, renderLogin, renderIndex, versions } from "./views.js";

const page = document.body.dataset.page;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const byId = (id) => document.getElementById(id);
const isLogin = page.endsWith("-login");

document.body.innerHTML = page === "index" ? renderIndex() : isLogin ? renderLogin(page[0]) : renderHome(page);
document.querySelector("title").dataset.uiCopy = "";
if (isLogin) document.title = "登录 · 木生·AI";
else if (page !== "index") document.title = "木生·AI — 一句话，长出一件家具";

// The shared dock discovers controls when loaded, so mount it after the lab template.
import("/js/modules/dock.js");

function mountReveals() {
  const elements = [...document.querySelectorAll(".reveal")];
  if (!elements.length) return;
  const reveal = (target) => {
    if (!target.classList.contains("is-pending")) return;
    target.classList.remove("is-pending");
    if (!reduced.matches) target.classList.add("is-developing");
  };

  if (!reduced.matches && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
        observer.unobserve(target);
        const image = target.querySelector(".reveal-photo img, img.reveal-photo");
        const ready = image.decode?.() ?? Promise.resolve();
        // Decode first, then leave a painted character frame before showing the photograph.
        ready.catch(() => {}).finally(() => {
          window.setTimeout(() => reveal(target), target.classList.contains("hero-art") ? 560 : 120);
        });
      });
    }, { threshold: 0.16 });
    for (const target of elements) {
      target.classList.add("is-pending");
      observer.observe(target);
    }
    reduced.addEventListener("change", () => {
      if (!reduced.matches) return;
      observer.disconnect();
      elements.forEach(reveal);
    });
  }

  for (const tile of document.querySelectorAll(".work-tile.reveal")) {
    tile.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") tile.classList.add("is-held");
    });
    for (const name of ["pointerup", "pointerleave", "pointercancel"]) {
      tile.addEventListener(name, () => tile.classList.remove("is-held"));
    }
    tile.addEventListener("contextmenu", (event) => event.preventDefault());
  }
}

function mountComparisons() {
  for (const comparison of document.querySelectorAll(".comparison")) {
    const slider = comparison.querySelector("input");
    const media = comparison.querySelector(".comparison-media");
    const update = () => comparison.style.setProperty("--cut", `${slider.value}%`);
    const drag = (event) => {
      const { left, width } = media.getBoundingClientRect();
      slider.value = String((event.clientX - left) / width * 100);
      update();
    };
    slider.addEventListener("input", update);
    media.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      media.setPointerCapture(event.pointerId);
      drag(event);
    });
    media.addEventListener("pointermove", (event) => {
      if (media.hasPointerCapture(event.pointerId)) drag(event);
    });
  }
}

function mountDemo() {
  const steps = [...document.querySelectorAll("[data-step]")];
  const select = (current) => steps.forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === current));
    byId(button.getAttribute("aria-controls")).hidden = i !== current;
  });
  steps.forEach((button, i) => button.addEventListener("click", () => select(i)));
  document.querySelectorAll("[data-seed]").forEach((button) => button.addEventListener("click", () => {
    const prompt = byId("prompt");
    prompt.value = uiCopy(button.dataset.seed);
    prompt.focus();
  }));
  byId("composer").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = byId("prompt").value.trim();
    byId("demo-prompt").hidden = Boolean(text);
    byId("demo-user-prompt").hidden = !text;
    byId("demo-user-prompt").textContent = text;
    select(0);
    byId("demo").scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth" });
    steps[0].focus({ preventScroll: true });
  });
}

function mountBench() {
  const bench = byId("bench");
  const stage = byId("bench-stage");
  const image = stage.querySelector(".edit-image");
  const box = stage.querySelector(".edit-box");
  const toggle = bench.querySelector(".edit-toggle");
  const status = bench.querySelector(".bench-status");
  const cards = [...bench.querySelectorAll("[data-version]")];
  const form = byId("composer");
  const submit = form.querySelector("button");
  let current = 0;
  let start = null;

  const setEdit = (editing) => {
    bench.classList.toggle("is-editing", editing);
    toggle.setAttribute("aria-pressed", String(editing));
    submit.querySelector("[data-ui-copy]").textContent = editing ? "生成修改版" : "生成";
    if (!editing) {
      start = null;
      box.removeAttribute("style");
    }
  };

  const select = (next) => {
    current = next;
    image.src = versions[next].src;
    image.alt = versions[next].alt;
    cards.forEach((button, i) => button.setAttribute("aria-pressed", String(i === next)));
    setEdit(false);
  };

  const position = (event) => {
    const { left, top, width, height } = stage.getBoundingClientRect();
    const clamp = (value) => Math.min(100, Math.max(0, value));
    return [clamp((event.clientX - left) / width * 100), clamp((event.clientY - top) / height * 100)];
  };

  toggle.addEventListener("click", () => setEdit(!bench.classList.contains("is-editing")));
  stage.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || !bench.classList.contains("is-editing") || submit.disabled) return;
    start = position(event);
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", (event) => {
    if (!start || !stage.hasPointerCapture(event.pointerId)) return;
    const [x, y] = position(event);
    const [x0, y0] = start;
    const width = Math.abs(x - x0);
    const height = Math.abs(y - y0);
    if (width < 2 || height < 2) return;
    for (const [key, value] of Object.entries({ x: Math.min(x, x0), y: Math.min(y, y0), w: width, h: height })) {
      box.style.setProperty(`--${key}`, `${value}%`);
    }
  });
  stage.addEventListener("lostpointercapture", () => { start = null; });
  cards.forEach((button, i) => button.addEventListener("click", () => select(i)));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const finish = () => {
      select((current + 1) % versions.length);
      bench.classList.remove("is-generating");
      for (const control of [submit, toggle, ...cards]) control.disabled = false;
      status.textContent = "已完成";
    };
    if (reduced.matches) return finish();
    status.textContent = "生成中";
    bench.classList.add("is-generating");
    for (const control of [submit, toggle, ...cards]) control.disabled = true;
    window.setTimeout(finish, 480);
  });

  setEdit(true);
}

function mountLogin() {
  const form = byId("auth-form");
  const password = byId("password");
  const show = byId("show-password");
  const switchMode = byId("auth-switch");
  const note = document.querySelector(".auth-note");
  let register = false;

  show.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    show.textContent = visible ? "隐藏" : "显示";
    show.setAttribute("aria-pressed", String(visible));
  });
  switchMode.addEventListener("click", () => {
    register = !register;
    byId("auth-name").hidden = !register;
    byId("auth-title").textContent = register ? "创建账号" : "登录";
    byId("auth-question").textContent = register ? "已有账号？" : "没有账号？";
    switchMode.textContent = register ? "登录" : "注册";
    form.querySelector("button[type=submit] span").textContent = register ? "创建账号" : "登录";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    form.reset();
    password.type = "password";
    show.textContent = "显示";
    show.setAttribute("aria-pressed", "false");
    note.classList.add("is-confirmed");
    note.textContent = "演示数据 · 不调用模型，不写入真实作品";
  });
}

if (isLogin) mountLogin();
if (page === "a" || page === "b") mountDemo();
if (page === "c") mountBench();
mountComparisons();
mountReveals();
