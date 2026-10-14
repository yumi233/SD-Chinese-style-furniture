// Workbench side of the design agent: the locked brief, the user's own
// references, three directions, the real processing stages, the result
// rationale and the versions of one piece of furniture. Everything that came
// from a user or a model is written with textContent, never as HTML.
import { apiJson, jsonOptions } from "./api.js";
import { enhanceDialog } from "./dialogs.js";

const STAGES = ["brief", "references", "generating", "reviewing", "saving"];
const PHASE_TO_STAGE = { preparing: "brief", brief: "brief", references: "references", generating: "generating", reviewing: "reviewing", saving: "saving", completed: "saving" };
const PURPOSES = { silhouette: "轮廓", material: "材质", structure: "结构", atmosphere: "氛围" };
const CATEGORIES = { seat: "椅", bench: "凳", table: "桌几", cabinet: "柜架", screen: "屏风", stool: "坐墩", bed: "床榻", other: "其他" };
const MATERIALS = { wood: "木材", metal: "金属", bamboo: "竹", rattan: "藤", stone: "石材", glass: "玻璃", upholstery: "软包", fabric: "织物", leather: "皮革" };
const KIND_LABELS = { user: "我的参考", realCase: "真实案例", aiConcept: "AI 概念图", previous: "上一版" };
const ACTION_LABELS = { new: "首版", variation: "再来一版", newDirection: "新方向", refine: "细化", views: "三视图概念" };
const STATUS_LABELS = { pass: "通过", fail: "未满足需求", revise: "需要改进", incomplete: "评审不完整", error: "评审失败", cannot_determine: "无法判断", not_applicable: "不适用" };
const MAX_IMAGE_REFERENCES = 3;

const $ = (id) => document.getElementById(id);

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

function safeLink(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function fill(list, items, empty) {
  list.replaceChildren(...(items.length ? items : [el("li", { className: "async-note", text: empty })]));
}

export function initDesignAgent({ getRequestContext, startGeneration, openPop, isSignedIn }) {
  const state = { session: null, sessionData: null, directionId: "", directions: [], references: [], selected: new Map(), resolution: {}, lastBriefText: "", compare: new Set() };
  const briefStatus = $("briefStatus");
  const mustHave = $("mustHaveChips");
  const avoid = $("avoidChips");
  const openChips = $("briefOpenChips");
  const assumptions = $("briefAssumptions");
  const priority = $("briefPriority");
  const clarify = $("briefClarify");
  const stageList = $("stageList");
  const compareModal = $("compareModal");
  if (compareModal) {
    enhanceDialog(compareModal, { closeSelector: "[data-close-compare]" });
    compareModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-compare]")) compareModal.classList.add("hidden");
    });
  }

  // ---- Brief preview -----------------------------------------------------
  let briefTimer = 0;
  let briefRevision = 0;
  function previewBrief() {
    window.clearTimeout(briefTimer);
    briefTimer = window.setTimeout(loadBrief, 450);
  }
  async function loadBrief() {
    const context = getRequestContext();
    const text = context.originalPrompt.trim();
    if (!text) {
      briefStatus.textContent = "写下设计目标后，这里会列出系统锁定的需求。";
      [mustHave, avoid, openChips, assumptions].forEach((node) => node.replaceChildren());
      return;
    }
    if (!isSignedIn()) {
      briefStatus.textContent = "登录后可预览系统锁定的需求。";
      return;
    }
    const revision = ++briefRevision;
    try {
      const { brief, direction } = await apiJson("/design/brief", jsonOptions(context, { method: "POST" }));
      if (revision !== briefRevision) return;
      state.lastBriefText = text;
      renderBrief(brief, direction);
    } catch (error) {
      if (revision === briefRevision) briefStatus.textContent = `需求预览暂不可用：${error.message}`;
    }
  }
  function chip(text, className = "") {
    return el("span", { className, text });
  }
  function renderBrief(brief, direction) {
    mustHave.replaceChildren(...brief.requirements.map((item) => chip(item.label.replace(/^[^：]+：/, ""), item.strength === "soft" ? "soft" : "")));
    // Derived bans ("全金属" rules out wood, stone...) are grouped by their cause.
    const derived = new Map();
    for (const item of brief.prohibitions.filter((entry) => entry.derived)) {
      const cause = (item.label.match(/由“(.+)”推出/) || [])[1] || "其他要求";
      derived.set(cause, [...(derived.get(cause) || []), item.label.replace(/^禁止：/, "").replace(/（.*$/, "")]);
    }
    avoid.replaceChildren(
      ...brief.prohibitions.filter((entry) => !entry.derived).map((item) => chip(item.label.replace(/^禁止：/, ""))),
      ...[...derived].map(([cause, labels]) => chip(`因「${cause}」：${labels.join("、")}`, "derived")),
    );
    openChips.replaceChildren(...brief.openAreas.map((area) => chip(area)));
    assumptions.replaceChildren(...[...brief.assumptions, ...brief.avoid.map((phrase) => `“${phrase}”作为偏好处理（未能对应到具体构件或材料）`)].map((line) => el("li", { text: line })));
    priority.textContent = `冲突时的优先级：${brief.priority.join(" > ")}`;
    briefStatus.textContent = brief.needsClarification
      ? "需求里有互相矛盾的地方，请先确认。"
      : `已锁定 ${brief.requirements.length} 项需求、${brief.prohibitions.length} 项禁止${direction ? `；方向：${direction.rationale[0] || ""}` : ""}`;
    renderClarification(brief.conflicts || []);
  }

  // ---- Clarification ----------------------------------------------------------
  function renderClarification(conflicts) {
    const open = conflicts.filter((item) => item.blocking);
    clarify.hidden = !open.length;
    if (!open.length) return clarify.replaceChildren();
    const rows = open.map((conflict) => {
      const choice = state.resolution[conflict.concept];
      const keepRequirement = el("button", { className: `pack-chip${choice === "require" ? " active" : ""}`, text: `保留「${conflict.requiredBy}」`, attrs: { type: "button" } });
      const keepBan = el("button", { className: `pack-chip${choice === "prohibit" ? " active" : ""}`, text: `保留「${conflict.prohibitedBy}」`, attrs: { type: "button" } });
      keepRequirement.addEventListener("click", () => { state.resolution[conflict.concept] = "require"; renderClarification(conflicts); });
      keepBan.addEventListener("click", () => { state.resolution[conflict.concept] = "prohibit"; renderClarification(conflicts); });
      return el("div", { className: "clarify-row" }, [el("p", { text: `「${conflict.label}」：「${conflict.requiredBy}」与「${conflict.prohibitedBy}」矛盾` }), el("div", { className: "pack-chips" }, [keepRequirement, keepBan])]);
    });
    const answered = open.every((conflict) => state.resolution[conflict.concept]);
    const retry = el("button", { className: "wb-button", text: "按我的选择生成", attrs: { type: "button" } });
    retry.disabled = !answered;
    retry.addEventListener("click", () => startGeneration({}));
    clarify.replaceChildren(el("h4", { text: "需要你确认" }), ...rows, retry);
  }

  function handleTaskError(error) {
    const conflicts = error?.payload?.details?.clarification;
    if (error?.status !== 422 || !Array.isArray(conflicts)) return false;
    renderClarification(conflicts.map((item) => ({ ...item, blocking: true })));
    briefStatus.textContent = "需求里有互相矛盾的地方，请先确认，再生成。";
    openPop?.("constraints");
    return true;
  }

  // ---- Stages -------------------------------------------------------------
  function renderStages(phase, { round, maxRounds, view } = {}) {
    const current = PHASE_TO_STAGE[phase];
    if (!stageList || !current) return;
    stageList.hidden = false;
    const index = STAGES.indexOf(current);
    stageList.querySelectorAll("li").forEach((item, position) => {
      item.dataset.state = position < index ? "done" : position === index ? "current" : "todo";
      item.toggleAttribute("aria-current", position === index);
    });
    const label = stageList.querySelector(`[data-stage="${current}"]`);
    if (label && current === "generating") label.textContent = view ? `生成图片（${{ front: "正视", side: "侧视", top: "俯视" }[view] || view}）` : round && maxRounds > 1 ? `生成图片（第 ${round} 轮）` : "生成图片";
  }
  function hideStages() {
    if (stageList) stageList.hidden = true;
  }

  // ---- References -------------------------------------------------------------
  const referenceList = $("referenceList");
  const referenceStatus = $("referenceStatus");
  async function refreshReferences() {
    if (!isSignedIn()) {
      fill(referenceList, [], "登录后可上传参考。");
      return;
    }
    try {
      const { references } = await apiJson("/references");
      state.references = references;
      for (const id of [...state.selected.keys()]) if (!references.some((item) => item.id === id)) state.selected.delete(id);
      renderReferences();
    } catch (error) {
      referenceStatus.textContent = `参考读取失败：${error.message}`;
    }
  }
  function selectedImageCount() {
    return state.references.filter((item) => item.kind === "image" && state.selected.has(item.id)).length;
  }
  function renderReferences() {
    const items = state.references.map((reference) => {
      const selected = state.selected.has(reference.id);
      const use = el("input", { attrs: { type: "checkbox", "aria-label": `下一次生成使用「${reference.title}」` } });
      use.checked = selected;
      use.disabled = !selected && reference.kind === "image" && selectedImageCount() >= MAX_IMAGE_REFERENCES;
      use.addEventListener("change", () => {
        if (use.checked) state.selected.set(reference.id, reference.purposes);
        else state.selected.delete(reference.id);
        renderReferences();
      });
      const preview = reference.kind === "image"
        ? el("img", { attrs: { src: `/api/v1/references/${encodeURIComponent(reference.id)}/file`, alt: "", loading: "lazy" } })
        : el("span", { className: "reference-doc", text: reference.mimeType === "application/pdf" ? "PDF" : "TXT" });
      const title = el("input", { className: "yui-input", attrs: { type: "text", value: reference.title, "aria-label": "参考名称", maxlength: "80" } });
      title.addEventListener("change", () => patchReference(reference.id, { title: title.value }));
      const purposes = el("div", { className: "pack-chips", attrs: { role: "group", "aria-label": "用途" } }, Object.entries(PURPOSES).map(([key, label]) => {
        const button = el("button", { className: `pack-chip${reference.purposes.includes(key) ? " active" : ""}`, text: label, attrs: { type: "button", "aria-pressed": String(reference.purposes.includes(key)) } });
        button.addEventListener("click", () => {
          const next = reference.purposes.includes(key) ? reference.purposes.filter((item) => item !== key) : [...reference.purposes, key];
          patchReference(reference.id, { purposes: next });
        });
        return button;
      }));
      const category = el("select", { className: "yui-select", attrs: { "aria-label": "家具类别" } }, Object.entries(CATEGORIES).map(([key, label]) => {
        const option = el("option", { text: label, attrs: { value: key } });
        option.selected = reference.category === key;
        return option;
      }));
      category.addEventListener("change", () => patchReference(reference.id, { category: category.value }));
      const materials = el("div", { className: "pack-chips", attrs: { role: "group", "aria-label": "材质" } }, Object.entries(MATERIALS).map(([key, label]) => {
        const on = reference.materials.includes(key);
        const button = el("button", { className: `pack-chip${on ? " active" : ""}`, text: label, attrs: { type: "button", "aria-pressed": String(on) } });
        button.addEventListener("click", () => patchReference(reference.id, { materials: on ? reference.materials.filter((item) => item !== key) : [...reference.materials, key] }));
        return button;
      }));
      const remove = el("button", { className: "wb-icon-button", text: "×", attrs: { type: "button", "aria-label": `删除「${reference.title}」` } });
      remove.addEventListener("click", () => deleteReference(reference.id));
      const basis = el("small", { text: reference.annotation?.source === "user" ? "标注：你已修改" : `自动标注：${reference.annotation?.basis || ""}` });
      const doc = reference.kind === "document" ? el("small", { text: reference.parsed ? "文档文字只作为参考资料，不会当作指令" : "PDF 已保存，暂不解析文字" }) : null;
      return el("li", { className: `reference-item${selected ? " is-selected" : ""}` }, [
        el("label", { className: "reference-item__use" }, [use, el("span", { text: "用于下次" })]),
        preview,
        el("div", { className: "reference-item__body" }, [title, purposes, el("div", { className: "reference-item__row" }, [category, remove]), materials, basis, doc]),
      ]);
    });
    fill(referenceList, items, "还没有参考。上传后可以选择用途。");
  }
  async function patchReference(id, patch) {
    try {
      const { reference } = await apiJson(`/references/${encodeURIComponent(id)}`, jsonOptions(patch, { method: "PATCH" }));
      state.references = state.references.map((item) => (item.id === id ? reference : item));
      if (state.selected.has(id)) state.selected.set(id, reference.purposes);
      renderReferences();
    } catch (error) {
      referenceStatus.textContent = `修改失败：${error.message}`;
    }
  }
  async function deleteReference(id) {
    try {
      await apiJson(`/references/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.selected.delete(id);
      await refreshReferences();
    } catch (error) {
      referenceStatus.textContent = `删除失败：${error.message}`;
    }
  }
  const LIMITS = { "image/png": 5, "image/jpeg": 5, "image/webp": 5, "application/pdf": 6, "text/plain": 0.2, "text/markdown": 0.2 };
  function typeOf(file) {
    if (file.type) return file.type;
    return /\.md$/i.test(file.name) ? "text/markdown" : /\.txt$/i.test(file.name) ? "text/plain" : "";
  }
  $("referenceUpload")?.addEventListener("change", async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    for (const file of files) {
      const type = typeOf(file);
      if (!LIMITS[type]) {
        referenceStatus.textContent = `${file.name}：不支持的文件类型`;
        continue;
      }
      if (file.size > LIMITS[type] * 1024 * 1024) {
        referenceStatus.textContent = `${file.name}：文件过大（上限 ${LIMITS[type]} MB）`;
        continue;
      }
      referenceStatus.textContent = `正在上传 ${file.name}…`;
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*;base64,/, ""));
          reader.onerror = () => reject(new Error("读取失败"));
          reader.readAsDataURL(file);
        });
        await apiJson("/references", jsonOptions({ filename: file.name, mimeType: type, data }, { method: "POST" }));
        referenceStatus.textContent = `已上传 ${file.name}，请核对自动标注。`;
      } catch (error) {
        referenceStatus.textContent = `${file.name}：${error.message}`;
      }
    }
    await refreshReferences();
  });

  // ---- Directions -------------------------------------------------------------
  const directionList = $("directionList");
  async function loadDirections() {
    if (!isSignedIn()) return fill(directionList, [], "登录后可获取设计方向。");
    const context = getRequestContext();
    if (!context.originalPrompt.trim()) return fill(directionList, [], "先在下方写下设计目标。");
    directionList.replaceChildren(el("li", { className: "async-note", text: "正在根据描述整理方向…" }));
    try {
      const { directions, brief } = await apiJson("/design/directions", jsonOptions(context, { method: "POST" }));
      if (!directions.length) {
        renderClarification(brief.conflicts || []);
        return fill(directionList, [], "需求里有矛盾，请先在「约束」里确认。");
      }
      state.directions = directions;
      if (!directions.some((item) => item.id === state.directionId)) state.directionId = "";
      renderDirections();
    } catch (error) {
      fill(directionList, [], `方向暂不可用：${error.message}`);
    }
  }
  function renderDirections() {
    const chosen = state.directionId || state.directions[0]?.id;
    directionList.replaceChildren(...state.directions.map((direction, index) => {
      const pick = el("button", { className: "wb-button", text: direction.id === chosen ? "已选用" : "用这个方向", attrs: { type: "button", "aria-pressed": String(direction.id === chosen) } });
      pick.addEventListener("click", () => { state.directionId = direction.id; renderDirections(); });
      const thumbs = el("div", { className: "direction-thumbs" }, direction.thumbnails.map((thumb) => el("figure", {}, [el("img", { attrs: { src: thumb.url, alt: "", loading: "lazy" } }), el("figcaption", { text: "AI 概念图" })])));
      const cases = el("ul", { className: "design-list" }, direction.cases.map((item) => {
        const link = safeLink(item.sourceLinks?.[0]?.url);
        const line = el("li", { text: `真实案例 · ${item.title}：${item.contribution}` });
        if (link) line.append(" ", el("a", { text: "出处", attrs: { href: link, target: "_blank", rel: "noopener noreferrer" } }));
        return line;
      }));
      return el("li", { className: `direction-card${direction.id === chosen ? " is-chosen" : ""}` }, [
        el("p", { className: "eyebrow", text: index === 0 ? "默认 · 最贴合需求" : `方向 ${index + 1}` }),
        el("h3", { text: direction.title }),
        el("p", { text: direction.summary }),
        el("ul", { className: "design-list" }, direction.rationale.map((line) => el("li", { text: line }))),
        direction.thumbnails.length ? thumbs : null,
        direction.cases.length ? cases : null,
        pick,
      ]);
    }));
  }
  $("directionsRefresh")?.addEventListener("click", loadDirections);

  // ---- Results ----------------------------------------------------------------
  const panel = $("designPanel");
  function statusOf(evaluation) {
    if (!evaluation) return null;
    if (evaluation.evaluationFailed) return evaluation.evaluationPending ? null : "error";
    return evaluation.status || null;
  }
  function renderResult(json) {
    const design = json.design || json.rounds?.at(-1)?.design;
    if (!design) return;
    panel.hidden = false;
    state.session = json.session || state.session;
    const evaluation = json.bestEvaluation || null;
    const status = statusOf(evaluation);
    const chipEl = $("designStatus");
    chipEl.textContent = status ? STATUS_LABELS[status] || status : "未评审（单次生成）";
    chipEl.className = `status-chip ${status === "pass" ? "success" : status ? "warn" : "idle"}`;

    $("designLocked").replaceChildren(
      ...design.brief.requirements.map((item) => chip(item.label)),
      ...design.brief.prohibitions.filter((item) => !item.derived).map((item) => chip(item.label, "avoid")),
    );
    fill($("designReferences"), [
      ...design.references.map((item) => {
        const line = el("li", {}, [el("span", { className: `kind-badge kind-${item.kind}`, text: KIND_LABELS[item.kind] || item.kind }), ` ${item.title}：${item.contribution}`]);
        const link = safeLink(item.source?.url);
        if (link) line.append(" ", el("a", { text: "出处", attrs: { href: link, target: "_blank", rel: "noopener noreferrer" } }));
        return line;
      }),
      ...(design.referenceAdjustments || []).map((item) => el("li", { className: "is-warning", text: `已调整「${item.title}」：${item.change}` })),
    ], "本次没有使用参考。");

    const changes = [
      ...(design.edit ? [`按你的要求修改：${design.edit.scope.join("；")}`, `保持不变：${design.edit.keep.join("、")}`] : []),
      ...(design.direction?.variationHint ? [`同方向变化：${design.direction.variationHint}`] : []),
      ...(design.direction?.rationale || []),
      ...((json.rounds || []).flatMap((round) => (round.corrections || []).map((item) => `第 ${round.round} 轮修正：${item.issue}`))),
      ...(design.removedFromPrompt || []).map((item) => `已移除冲突的预设：${item.text}（${item.reason}）`),
    ];
    fill($("designChanges"), changes.map((line) => el("li", { text: line })), "首版，没有修改。");
    renderCriteria(evaluation);
    const issues = [
      ...(evaluation?.problems || []),
      ...((evaluation?.criteria?.requirements?.items || []).filter((item) => item.status === "cannot_determine").map((item) => `无法从图片判断「${item.label}」`)),
      ...(json.stopReason && !["passed"].includes(json.stopReason) ? [`迭代停止原因：${{ round_limit: "达到轮数上限", no_improvement: "连续两轮没有改善", evaluation_error: "评审出错", evaluation_incomplete: "评审不完整", generation_error: "生成出错", user_stop: "已手动停止" }[json.stopReason] || json.stopReason}`] : []),
    ];
    fill($("designIssues"), [...new Set(issues)].map((line) => el("li", { text: line })), status ? "没有待解决的问题。" : "单次生成不做评审；切换到「智能体迭代」可逐项检查。");
    const capability = design.capability?.imageEdit;
    $("designCapability").textContent = capability ? `当前引擎的细化方式：${capability.note}` : "";
    $("refineSubmit").disabled = capability ? !capability.supported : false;
    loadSession();
  }
  function renderCriteria(evaluation) {
    const list = $("designCriteria");
    const criteria = evaluation?.criteria;
    if (!criteria) return fill(list, [], "单次生成不做评审。");
    const row = (label, item) => el("li", { className: `criterion criterion--${item?.status || "missing"}` }, [
      el("span", { className: "criterion__status", text: item?.status ? STATUS_LABELS[item.status] || item.status : "缺失" }),
      el("span", { className: "criterion__label", text: label }),
      item?.evidence ? el("small", { text: item.evidence }) : null,
    ]);
    fill(list, [
      ...(criteria.requirements?.items || []).map((item) => row(item.label, item)),
      row("风格一致", criteria.style),
      row("结构与比例可信", criteria.plausibility),
      row("与上一版一致", criteria.consistency),
    ], "没有评审项。");
  }

  // ---- Versions ---------------------------------------------------------------
  async function loadSession() {
    if (!state.session?.id) return;
    try {
      const { session } = await apiJson(`/design-sessions/${encodeURIComponent(state.session.id)}`);
      state.sessionData = session;
      renderVersions();
    } catch {
      /* The proposal panel still shows this result; versions retry on the next result. */
    }
  }
  function renderVersions() {
    const session = state.sessionData;
    const list = $("designVersions");
    state.compare = new Set([...state.compare].filter((version) => session.versions.some((item) => item.version === version)));
    fill(list, session.versions.slice().reverse().map((version) => {
      const active = version.version === session.activeVersion;
      const pick = el("input", { attrs: { type: "checkbox", "aria-label": `选择 v${version.version} 对比` } });
      pick.checked = state.compare.has(version.version);
      pick.addEventListener("change", () => {
        if (pick.checked) state.compare.add(version.version);
        else state.compare.delete(version.version);
        if (state.compare.size > 2) state.compare.delete([...state.compare][0]);
        renderVersions();
      });
      const restore = el("button", { className: "wb-button", text: active ? "当前版本" : "设为当前", attrs: { type: "button" } });
      restore.disabled = active;
      restore.addEventListener("click", () => restoreVersion(version.version));
      const image = version.image?.url ? el("img", { attrs: { src: version.image.url, alt: `v${version.version}`, loading: "lazy" } }) : null;
      const note = version.kind === "refine" ? `改：${(version.edit?.scope || []).join("；")}` : version.kind === "views" ? "三视图概念（不是工程图）" : version.direction?.rationale?.[0] || "";
      const evaluation = version.evaluation?.status ? ` · ${STATUS_LABELS[version.evaluation.status] || version.evaluation.status}` : "";
      return el("li", { className: `version-item${active ? " is-active" : ""}` }, [
        pick,
        image,
        el("div", {}, [el("strong", { text: `v${version.version} · ${ACTION_LABELS[version.kind] || version.kind}${evaluation}` }), el("small", { text: note }), el("small", { text: version.model?.model ? `模型：${version.model.model}` : "" })]),
        restore,
      ]);
    }), "还没有版本。");
    $("compareVersionsButton").disabled = state.compare.size !== 2;
  }
  async function restoreVersion(version) {
    try {
      const { session } = await apiJson(`/design-sessions/${encodeURIComponent(state.sessionData.id)}/restore`, jsonOptions({ version }, { method: "POST" }));
      state.sessionData = session;
      renderVersions();
    } catch (error) {
      $("designCapability").textContent = `恢复失败：${error.message}`;
    }
  }
  $("compareVersionsButton")?.addEventListener("click", () => {
    const versions = state.sessionData.versions.filter((item) => state.compare.has(item.version));
    $("compareGrid").replaceChildren(...versions.map((version) => el("figure", {}, [
      version.image?.url ? el("img", { attrs: { src: version.image.url, alt: `v${version.version}` } }) : el("p", { text: "没有图片" }),
      el("figcaption", { text: `v${version.version} · ${ACTION_LABELS[version.kind] || version.kind}${version.edit?.scope?.length ? ` · 改：${version.edit.scope.join("；")}` : ""}` }),
    ])));
    compareModal.classList.remove("hidden");
  });

  // ---- Actions ------------------------------------------------------------------
  $("designActions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-design-action]");
    if (!button || !state.session?.id) return;
    startGeneration({ action: button.dataset.designAction, sessionId: state.session.id, baseVersion: state.sessionData?.activeVersion });
  });
  $("refineForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const changeRequest = $("refineInput").value.trim();
    if (!changeRequest || !state.session?.id) {
      $("designCapability").textContent = state.session?.id ? "请写下这一版要改的地方。" : "请先生成一版方案。";
      return;
    }
    startGeneration({ action: "refine", sessionId: state.session.id, changeRequest, baseVersion: state.sessionData?.activeVersion });
  });

  return {
    previewBrief,
    refreshReferences,
    loadDirections,
    renderStages,
    hideStages,
    renderResult,
    handleTaskError,
    focusRefine() {
      if (panel.hidden) return false;
      $("refineInput").focus();
      return true;
    },
    extendPayload(payload) {
      const extra = {};
      if (state.selected.size) extra.references = [...state.selected].map(([id, purposes]) => ({ id, purposes }));
      if (Object.keys(state.resolution).length) extra.conflictResolution = { ...state.resolution };
      if (state.directionId && (!payload.action || payload.action === "new")) extra.directionId = state.directionId;
      return { ...payload, ...extra };
    },
    reset() {
      state.session = null;
      state.sessionData = null;
      state.directionId = "";
      state.resolution = {};
      panel.hidden = true;
    },
  };
}
