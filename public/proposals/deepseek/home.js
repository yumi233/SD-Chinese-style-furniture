(function () {
  "use strict";

  const state = {
    type: "chair",
    style: "ming",
    seed: 280,
    effect: "ascii",
    grid: window.matchMedia("(max-width: 760px)").matches ? 16 : 12
  };

  const prompt = document.querySelector("#heroBrief");
  const canvas = document.querySelector("#heroCanvas");
  const objectTabs = document.querySelector("#objectTabs");
  const effectTabs = document.querySelector("#effectTabs");
  const effectGrid = document.querySelector("#effectGrid");
  const effectGridValue = document.querySelector("#effectGridValue");
  const briefForm = document.querySelector("#briefForm");
  const mobileToggle = document.querySelector(".mobile-nav-toggle");
  const mobileMenu = document.querySelector("#mobileMenu");
  const loginDialog = document.querySelector("#loginDialog");
  const loginEmail = document.querySelector("#loginEmail");
  const loginSubmit = document.querySelector("#loginSubmit");

  function renderHero() {
    if (!window.MushengScene || !canvas) {
      return;
    }
    window.MushengScene.render(canvas, {
      type: state.type,
      style: state.style,
      seed: state.seed,
      version: 1,
      effect: state.effect,
      grid: state.grid,
      contrast: 88,
      mask: state.effect === "ascii" ? 90 : 88
    });
  }

  function inferFromPrompt(value) {
    const text = value.trim();
    if (/桌|案|台/.test(text)) {
      state.type = "table";
    } else if (/柜|橱/.test(text)) {
      state.type = "cabinet";
    } else if (/凳|墩/.test(text)) {
      state.type = "stool";
    } else if (/椅|坐具/.test(text)) {
      state.type = "chair";
    }

    if (/新中式|当代|现代/.test(text)) {
      state.style = "modern";
    } else if (/宋|雅/.test(text)) {
      state.style = "song";
    } else if (/禅|侘寂/.test(text)) {
      state.style = "zen";
    } else if (/明/.test(text)) {
      state.style = "ming";
    }

    state.seed = Array.from(text).reduce((total, char, index) => {
      return (total + char.charCodeAt(0) * (index + 3)) % 9999;
    }, 17);
    syncPressedStates();
    renderHero();
  }

  function syncPressedStates() {
    objectTabs.querySelectorAll("[data-object]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.object === state.type);
    });
    effectTabs.querySelectorAll("[data-effect]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.effect === state.effect);
    });
    document.querySelectorAll("[data-prompt-style]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.promptStyle === state.style);
    });
    effectGrid.value = String(state.grid);
    effectGridValue.value = String(state.grid);
  }

  objectTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-object]");
    if (!button) {
      return;
    }
    state.type = button.dataset.object;
    state.seed += 7;
    syncPressedStates();
    renderHero();
  });

  effectTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-effect]");
    if (!button) {
      return;
    }
    state.effect = button.dataset.effect;
    const defaults = {
      paper: 8,
      ascii: window.matchMedia("(max-width: 760px)").matches ? 16 : 12,
      dither: 8
    };
    state.grid = defaults[state.effect];
    effectGrid.value = String(state.grid);
    effectGridValue.value = String(state.grid);
    syncPressedStates();
    renderHero();
  });

  effectGrid.addEventListener("input", () => {
    state.grid = Number(effectGrid.value);
    effectGridValue.value = String(state.grid);
    renderHero();
  });

  document.querySelector("#shuffleScene").addEventListener("click", () => {
    state.seed = (state.seed * 31 + 19) % 10007;
    renderHero();
  });

  canvas.addEventListener("click", () => {
    state.seed = (state.seed + 113) % 10007;
    renderHero();
  });

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      state.seed = (state.seed + 113) % 10007;
      renderHero();
    }
  });

  let promptTimer = 0;
  prompt.addEventListener("input", () => {
    window.clearTimeout(promptTimer);
    promptTimer = window.setTimeout(() => inferFromPrompt(prompt.value), 180);
  });

  document.querySelectorAll("[data-prompt-style]").forEach((button) => {
    button.addEventListener("click", () => {
      state.style = button.dataset.promptStyle;
      syncPressedStates();
      renderHero();
    });
  });

  briefForm.addEventListener("submit", (event) => {
    event.preventDefault();
    inferFromPrompt(prompt.value.trim());
    const intent = {
      prompt: prompt.value.trim() || "一把适合小户型的明式扶手椅，白蜡木，靠背轻巧",
      type: state.type,
      style: state.style,
      effect: state.effect,
      grid: state.grid,
      seed: state.seed
    };
    localStorage.setItem("musheng.deepseek.intent", JSON.stringify(intent));
    window.location.href = "studio.html?new=1";
  });

  document.querySelectorAll(".specimen-canvas").forEach((item) => {
    window.MushengScene.render(item, {
      type: item.dataset.type,
      style: item.dataset.style,
      seed: Number(item.dataset.seed),
      version: item.dataset.type === "stool" ? 3 : 2,
      effect: item.dataset.type === "stool" ? "dither" : "paper",
      grid: 8,
      contrast: 64,
      mask: 88
    });
  });

  mobileToggle.addEventListener("click", () => {
    const open = mobileToggle.getAttribute("aria-expanded") === "true";
    mobileToggle.setAttribute("aria-expanded", String(!open));
    mobileMenu.hidden = open;
  });

  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) {
      mobileToggle.setAttribute("aria-expanded", "false");
      mobileMenu.hidden = true;
    }
  });

  document.querySelectorAll("[data-open-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (loginDialog.open) {
        return;
      }
      loginDialog.showModal();
      window.setTimeout(() => loginEmail.focus(), 40);
    });
  });

  loginSubmit.addEventListener("click", () => {
    const email = loginEmail.value.trim();
    if (email && (!email.includes("@") || email.endsWith("@"))) {
      loginEmail.setCustomValidity("请输入完整的邮箱地址");
      loginEmail.reportValidity();
      return;
    }
    loginEmail.setCustomValidity("");
    if (email) {
      localStorage.setItem("musheng.deepseek.account", JSON.stringify({ email }));
    }
    window.location.href = "studio.html";
  });

  loginEmail.addEventListener("input", () => loginEmail.setCustomValidity(""));

  document.querySelectorAll(".dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        dialog.close();
      }
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  document.querySelectorAll(".timeline-note, .specimen-card").forEach((element) => {
    observer.observe(element);
  });

  syncPressedStates();
  renderHero();
})();
