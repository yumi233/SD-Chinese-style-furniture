// Styled select: the native <select> stays in the page as the source of truth (existing code keeps
// reading and writing it), while people see and use a button with a listbox that grows from it.
const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
let openSelect = null;

function labelFor(select) {
  if (select.getAttribute("aria-label")) return select.getAttribute("aria-label");
  const label = select.closest("label") || (select.id && document.querySelector(`label[for="${select.id}"]`));
  return label ? [...label.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent.trim()).join("") : "";
}

export function enhanceSelect(select) {
  if (select.dataset.enhanced) return;
  select.dataset.enhanced = "true";
  const wrap = document.createElement("span");
  wrap.className = "yui-picker";
  select.before(wrap);
  wrap.append(select);
  select.classList.add("yui-picker__native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "yui-picker__trigger";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  let name = labelFor(select);
  const list = document.createElement("ul");
  list.className = "yui-picker__list";
  list.setAttribute("role", "listbox");
  if (name) list.setAttribute("aria-label", name);
  list.hidden = true;
  wrap.append(button, list);

  const sync = () => {
    name = labelFor(select);
    if (name) list.setAttribute("aria-label", name);
    const option = select.options[select.selectedIndex];
    button.innerHTML = `<span class="yui-picker__value"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
    button.firstChild.textContent = option ? option.textContent : "";
    button.setAttribute("aria-label", name ? `${name}：${option ? option.textContent : ""}` : option?.textContent || "");
    button.disabled = select.disabled;
  };
  const render = () => {
    list.innerHTML = "";
    [...select.options].forEach((option, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.index = String(index);
      item.textContent = option.textContent;
      item.setAttribute("aria-selected", String(index === select.selectedIndex));
      if (option.disabled) item.setAttribute("aria-disabled", "true");
      list.append(item);
    });
  };
  const close = (focus = false) => {
    if (list.hidden) return;
    list.hidden = true;
    wrap.classList.remove("is-open", "is-up");
    button.setAttribute("aria-expanded", "false");
    if (openSelect === close) openSelect = null;
    if (focus) button.focus();
  };
  const open = () => {
    if (select.disabled) return;
    openSelect?.();
    render();
    list.hidden = false;
    // Open upward when the space below runs out (composer sits at the bottom of the screen).
    const below = innerHeight - button.getBoundingClientRect().bottom;
    wrap.classList.toggle("is-up", below < Math.min(list.scrollHeight, 240) + 16);
    wrap.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    openSelect = close;
    (list.querySelector('[aria-selected="true"]') || list.firstElementChild)?.focus({ preventScroll: true });
  };
  const choose = (index) => {
    if (select.options[index]?.disabled) return;
    const changed = index !== select.selectedIndex;
    nativeIndex.set.call(select, index);
    sync();
    close(true);
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  button.addEventListener("click", () => (list.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); open(); }
  });
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[role=option]");
    if (item) choose(Number(item.dataset.index));
  });
  list.addEventListener("keydown", (event) => {
    const items = [...list.children].filter((item) => item.getAttribute("aria-disabled") !== "true");
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (document.activeElement?.dataset.index) choose(Number(document.activeElement.dataset.index));
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // keep the surrounding dialog open
      close(true);
    } else if (event.key === "Tab") {
      // Hidden options lose WebKit's tab position. Move from the trigger in
      // the containing dialog/document, including its visible button controls.
      event.preventDefault();
      close();
      const scope = select.closest("dialog") || document.body;
      const controls = [...scope.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.disabled && !control.closest("[inert]") && control.getClientRects().length && getComputedStyle(control).visibility !== "hidden");
      const at = controls.indexOf(button);
      controls[(at + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus();
    }
  });
  // A click on the wrapping label text should reach the visible control, not the hidden one.
  select.closest("label")?.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) { event.preventDefault(); button.focus(); }
  });

  // Keep the face in step with code that sets value, selectedIndex or replaces the options.
  Object.defineProperty(select, "value", { configurable: true, get() { return nativeValue.get.call(this); }, set(v) { nativeValue.set.call(this, v); sync(); } });
  Object.defineProperty(select, "selectedIndex", { configurable: true, get() { return nativeIndex.get.call(this); }, set(v) { nativeIndex.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "selected"] });
  select.addEventListener("change", sync);
  // Apps that relabel options (e.g. a language switch) dispatch this event on window.
  window.addEventListener("yui:refresh", sync);
  select.form?.addEventListener("reset", () => setTimeout(sync));
  sync();
}

document.addEventListener("pointerdown", (event) => {
  if (openSelect && !event.target.closest(".yui-picker")) openSelect();
}, true);

export function enhanceSelects(root = document) {
  root.querySelectorAll("select").forEach(enhanceSelect);
}

enhanceSelects();
// Selects added later (model settings fields) get the same face.
new MutationObserver((records) => {
  for (const record of records) for (const node of record.addedNodes) {
    if (node.nodeType !== 1) continue;
    if (node.matches("select")) enhanceSelect(node);
    else enhanceSelects(node);
  }
}).observe(document.body, { childList: true, subtree: true });
