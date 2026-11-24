import { studioCopy } from "../modules/locale.js";

export function initComposerInputs({ canAttach, notify, updateComposer, toolbar, apiPath = path => path }) {
  const el = id => document.getElementById(id);
  const input = el("promptInput"), picker = el("referenceFile"), hints = el("briefHints");
  let revision = 0, reference = "", taskId = "", loading = false, locked = false;

  let lastValue, lastWidth;
  function fitBrief() {
    if (input.value === lastValue && input.clientWidth === lastWidth) return;
    lastValue = input.value; lastWidth = input.clientWidth;
    input.style.height = "auto";
    const borderHeight = input.offsetHeight - input.clientHeight;
    input.style.height = Math.min(160, input.scrollHeight + borderHeight) + "px";
  }
  new ResizeObserver(() => requestAnimationFrame(fitBrief)).observe(input);
  function clear() {
    revision++;
    reference = ""; taskId = ""; loading = false; picker.value = "";
    el("referenceThumb").removeAttribute("src");
    el("referenceName").textContent = "";
    el("referencePreview").hidden = true;
    hints.open = false;
  }
  function adopt(id, recovered) {
    taskId = id; reference = "";
    if (recovered || el("referencePreview").hidden) el("referenceName").textContent = studioCopy("brief.image");
    el("referenceThumb").src = `/api/v1${apiPath(`/generation-tasks/${encodeURIComponent(id)}/reference`)}`;
    el("referencePreview").hidden = false;
  }
  function sync(busy) {
    locked = busy; fitBrief();
    el("attachReference").disabled = busy || loading;
    el("removeReference").disabled = busy;
    const brief = input.value.trim();
    hints.hidden = !brief || brief.length > 48 || busy;
    if (hints.hidden) hints.open = false;
  }
  function localize() {
    el("composerMore").setAttribute("aria-label", studioCopy("brief.tools"));
    for (const [id, key] of [["attachReference", "attach"], ["removeReference", "remove"], ["briefHintLabel", "hints"]]) {
      el(id).textContent = studioCopy("brief." + key);
    }
    el("briefHintChoices").replaceChildren(...["use", "size", "wood", "joint"].map(key => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yui-chip";
      button.tabIndex = 0;
      button.textContent = studioCopy("brief." + key);
      button.addEventListener("click", () => {
        if (!input.value.includes(button.textContent)) {
          const separator = document.documentElement.dataset.locale === "en" ? ". " : "，";
          input.value = input.value.trimEnd() + separator + button.textContent;
        }
        hints.open = false; input.focus(); sync(locked);
      });
      return button;
    }));
  }
  el("attachReference").addEventListener("click", event => { toolbar.closeTools(event.currentTarget); if (canAttach()) picker.click(); });
  el("removeReference").addEventListener("click", () => { clear(); updateComposer(); toolbar.returnTarget(el("attachReference")).focus(); });
  picker.addEventListener("change", async () => {
    const file = picker.files[0];
    picker.value = "";
    if (!file || locked || !canAttach()) return;
    clear();
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      notify(studioCopy("brief.type")); updateComposer(); return;
    }
    const stamp = revision;
    loading = true; updateComposer();
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = data; await img.decode();
      if (img.naturalWidth * img.naturalHeight > 16000000) throw new Error();
      if (stamp !== revision) return;
      notify(""); reference = data;
      el("referenceThumb").src = data;
      el("referenceName").textContent = file.name;
      el("referencePreview").hidden = false;
    } catch {
      if (stamp === revision) notify(studioCopy("brief.invalid"));
    } finally {
      if (stamp === revision) { loading = false; updateComposer(); }
    }
  });
  localize();
  input.addEventListener("input", () => sync(locked));
  window.addEventListener("musheng:locale-change", localize);
  function attachment() {
    if (taskId) return { referenceTaskId: taskId };
    return reference ? { referenceDataUrl: reference } : null;
  }
  function info() {
    const att = attachment();
    if (!att) return null;
    return {
      name: el("referenceName").textContent || studioCopy("brief.image"),
      previewSrc: el("referenceThumb").getAttribute("src") || "",
      attachment: att,
    };
  }
  function setDataUrl(dataUrl, name = "") {
    if (!dataUrl) return;
    revision++;
    taskId = "";
    reference = dataUrl;
    el("referenceThumb").src = dataUrl;
    el("referenceName").textContent = name || studioCopy("brief.image");
    el("referencePreview").hidden = false;
    updateComposer();
  }
  return { sync, clear, adopt, attachment, info, setDataUrl, loading: () => loading };
}
