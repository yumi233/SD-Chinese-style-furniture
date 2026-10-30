(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const key = "musheng-astra-v1";
  const dimensions = ["文化准确性", "结构合理性", "材料工艺", "设计创新", "场景适配", "AI 使用"];
  const stageNames = ["理解需求", "起稿", "出图", "评审"];
  const stageDetails = ["整理家具类别、材质与约束，保留已锁定的设计记忆。", "建立轮廓、比例和支撑关系。", "主图已就绪，正在读取结构与材料细节。", "六维评审完成，这一版已加入版本轨迹。"];
  const examples = { chair: "一把适合小户型的新中式圈椅，白蜡木，环抱式靠背，轻盈的开放结构。", table: "一张白蜡木极简茶桌，薄桌面，四腿支撑，适合两人的窗边茶席。", cabinet: "一个悬浮感白蜡木边柜，细密格栅，收起杂物，让小客厅更轻盈。" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function blank() { return { id: uid(), title: "未命名作品", prompt: "", style: "新中式", ratio: "16:9-720", detail: "标准", mood: "自然光", constraints: "", english: "", lockMaterial: true, lockProportion: false, auto: false, target: 85, rounds: 2, versions: [], selected: null, task: null, status: "empty", updated: Date.now() }; }
  let store = { current: null, projects: [] };
  let storageError = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && Array.isArray(saved.projects) && saved.projects.every(p => p && p.id && Array.isArray(p.versions))) store = saved;
  } catch { storageError = true; }
  let project = store.projects.find(p => p.id === store.current) || blank();
  let timer, toastTimer, mode = "solid", zoom = 1, pan = { x: 0, y: 0 }, tool = "pan", selection = null, gesture = null;
  let disconnected = false, failNext = false, activeTab = "brief";
  const canvas = $("#work-canvas"), stage = $("#canvas-stage");
  const current = () => project.versions.find(v => v.id === project.selected);
  const running = () => Boolean(project.task?.active);
  const busy = () => Boolean(project.task?.active || project.task?.paused);
  function toast(message) { clearTimeout(toastTimer); $("#toast").textContent = message; $("#toast").hidden = false; toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 3600); }
  function notice(message, kind = "", actions = []) {
    const el = $("#notice"); el.replaceChildren(); el.className = "notice " + kind; el.hidden = !message;
    if (!message) return;
    el.append(document.createTextNode(message));
    actions.forEach(([label, action]) => { const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", action); el.append(b); });
  }
  function persist() {
    project.updated = Date.now();
    if (!store.projects.some(p => p.id === project.id)) store.projects.push(project);
    store.current = project.id;
    try { localStorage.setItem(key, JSON.stringify(store)); $("#save-status").textContent = "已保存到此浏览器"; storageError = false; }
    catch { storageError = true; $("#save-status").textContent = "保存失败 · 请先导出"; notice("浏览器无法保存。当前画布仍可操作，请先导出，刷新可能丢失本次修改。", "warning"); }
  }
  function readForm() {
    Object.assign(project, { prompt: $("#prompt").value, style: $("input[name=style]:checked").value, ratio: $("#ratio").value, detail: $("#detail").value, mood: $("#mood").value, constraints: $("#constraints").value, english: $("#english-prompt").value, lockMaterial: $("#lock-material").checked, lockProportion: $("#lock-proportion").checked, auto: $("#auto-iterate").checked, target: Math.max(60, Math.min(100, Number($("#target").value) || 85)), rounds: Number($("#rounds").value) });
  }
  function fillForm() {
    $("#prompt").value = project.prompt;
    $$("input[name=style]").forEach(r => { r.checked = r.value === project.style; });
    for (const id of ["ratio", "detail", "mood", "constraints", "target", "rounds"]) $("#" + id).value = project[id];
    $("#english-prompt").value = project.english || "";
    $("#lock-material").checked = project.lockMaterial; $("#lock-proportion").checked = project.lockProportion; $("#auto-iterate").checked = project.auto;
  }
  function setTab(tab, move = false) {
    activeTab = tab; document.body.dataset.tab = tab;
    $$('[data-tab]').forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    if (move && innerWidth <= 760) $(".mobile-tabs").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }
  function renderCanvas() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    const v = current();
    if (v) Furniture.render(canvas, v.design, { mode, zoom: zoom * 1.18, panX: pan.x*dpr, panY: pan.y*dpr - canvas.height*.025, grain: mode === "ascii" ? 8 : 5 });
    else canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);
    $("#zoom-reset").textContent = Math.round(zoom * 100) + "%";
    $("#annotation-marker").hidden = !v?.notes?.length;
  }
  function renderVersions() {
    const list = $("#version-list"); list.replaceChildren();
    $("#version-count").textContent = project.versions.length;
    if (!project.versions.length) { list.innerHTML = '<p class="muted">你的每一次尝试，都会留在这里。</p>'; return; }
    const best = project.versions.filter(v => v.score !== null).reduce((a,b) => !a || b.score > a.score ? b : a, null);
    for (const v of project.versions) {
      const b = document.createElement("button"); b.className = "version-card"; b.setAttribute("aria-pressed", String(v.id === project.selected)); b.disabled = busy(); b.dataset.version = v.id;
      const thumb = document.createElement("canvas"); thumb.className = "version-thumb"; thumb.width = 280; thumb.height = 104; thumb.setAttribute("aria-hidden", "true");
      const title = document.createElement("strong"); title.textContent = `V${v.number} · ${v.score === null ? "待评审" : v.score + " 分"}${best?.id === v.id ? " / 最佳" : ""}`;
      const caption = document.createElement("small"); caption.textContent = v.parent ? `从 V${v.parent} 分出` : "第一稿";
      b.append(thumb,title,caption); b.addEventListener("click", () => { project.selected = v.id; clearSelection(); persist(); render(); }); list.append(b); Furniture.render(thumb,v.design,{zoom:1.1});
    }
  }
  function renderReview() {
    const v = current(); $("#review-empty").hidden = Boolean(v?.score != null); $("#review-content").hidden = !v || v.score == null;
    $("#review-empty h3").textContent = v ? "这一稿，还在等评审。" : "先有作品，再聊细节。";
    $("#review-empty p").textContent = v ? "主图已保留，继续任务后补上六维评审。" : "生成后，从六个维度看看哪里值得保留，哪里还能更好。";
    if (!v || v.score == null) return;
    $("#total-score").textContent = v.score; $("#review-verdict").textContent = v.score >= project.target ? "可以留下的一版" : "值得继续推敲";
    $("#score-list").innerHTML = dimensions.map((name,i) => `<div class="score-row"><div><span>${name}</span><span>${v.scores[i]}</span></div><div class="score-track" aria-hidden="true"><span style="width:${v.scores[i]}%"></span></div></div>`).join("");
    $("#suggestion-title").textContent = v.design.thin ? "再检查一次支撑关系" : "让结构再轻一点";
    $("#suggestion-text").textContent = v.design.thin ? "形体更轻盈了。建议在实际打样前验证接合强度与承重，不把视觉评分当作工程验证。" : "保留主要轮廓，收薄横向构件，减轻视觉重量。接合处仍需保留足够余量。";
    $("#branch-note").textContent = `修改会从 V${v.number} 分出新版本，原稿保留。`;
    $("#annotations").replaceChildren();
    (v.notes || []).forEach((note,i) => { const p = document.createElement("p"); p.textContent = `${i+1}. ${note}`; $("#annotations").append(p); });
  }
  function render() {
    const v = current();
    $("#project-title").textContent = project.title + " ⌄";
    $("#empty-message").hidden = Boolean(v || busy());
    $("#canvas-version").textContent = v ? `V${v.number} / ${v.parent ? "沿着上一稿再进一步" : "想法的第一种形状"}` : busy() ? "让想法成形中" : "等待第一稿";
    $("#canvas-caption").textContent = v ? `${project.style} · ${v.design.material === "wood" ? "白蜡木" : "数字材质"} · ${v.params.ratio.split("-")[0]}${v.region ? " · 局部修改" : ""}` : "一件作品，可以有很多种可能。";
    $("#generate").textContent = busy() ? "设计进行中…" : project.versions.length ? "生成新方向 ↗" : "生成第一稿 ↗";
    $$("#generate-form input, #generate-form textarea, #generate-form select, #generate-form button").forEach(e => { e.disabled = busy(); });
    for (const id of ["new-project", "history-open", "project-title", "apply-suggestion", "apply-edit", "rerun", "restore-description", "apply-local"]) $("#" + id).disabled = busy();
    for (const id of ["select-tool", "annotate-tool", "export-open"]) $("#" + id).disabled = !v || busy();
    $("#compare-open").disabled = project.versions.length < 2 || busy();
    $("#progress-panel").hidden = !busy();
    $("#stage-badge").hidden = !busy();
    if (busy()) {
      const t = project.task;
      $("#stage-badge").textContent = t.paused ? "连接已暂停" : stageNames[t.phase];
      $("#progress-label").textContent = `${t.round > 1 ? "第 " + t.round + " 轮 · " : ""}${stageNames[t.phase]}`;
      $("#progress-detail").textContent = stageDetails[t.phase]; $("#progress").value = t.phase+1;
      $$("#stages li").forEach((li,i) => { li.className = i === t.phase ? "active" : i < t.phase ? "done" : ""; });
    }
    renderVersions(); renderReview(); renderCanvas();
  }
  function synthesizeDesign(prompt, parent, changed, params) {
    if (changed === "同参数重跑" && parent) return { ...parent.design };
    const text = prompt + " " + (changed || "");
    const type = /柜/.test(prompt) ? "cabinet" : /桌|案/.test(prompt) ? "table" : "chair";
    return {
      type: parent ? parent.design.type : type,
      material: params.lockMaterial ? (parent?.design.material || "wood") : /蓝|数字/.test(text) ? "blue" : "wood",
      thin: changed ? /薄|轻|建议|优化/.test(changed) ? true : /厚/.test(changed) ? false : !parent?.design.thin : false,
      spread: params.lockProportion && parent ? parent.design.spread : changed ? /宽/.test(changed) ? 1.2 : /窄/.test(changed) ? .85 : parent?.design.spread || 1 : 1
    };
  }
  function makeTask(change = "", options = {}) {
    if (busy()) return;
    readForm();
    if (!project.prompt.trim()) { setTab("brief"); $("#prompt").focus(); $("#prompt").reportValidity(); return; }
    clearTimeout(timer); clearSelection(); notice("");
    const parent = options.fresh ? null : current();
    const params = { style: project.style, ratio: project.ratio, detail: project.detail, mood: project.mood, constraints: project.constraints, lockMaterial: project.lockMaterial, lockProportion: project.lockProportion, english: project.english };
    if (!project.english) {
      project.english = `${project.style === "明式" ? "Ming inspired" : "Contemporary Chinese"} ${/柜/.test(project.prompt) ? "cabinet" : /桌|案/.test(project.prompt) ? "tea table" : "armchair"}, ash wood, balanced proportions, clean studio lighting.`;
      params.english = project.english; $("#english-prompt").value = project.english;
    }
    if (project.title === "未命名作品") project.title = /柜/.test(project.prompt) ? "悬浮边柜" : /桌|案/.test(project.prompt) ? "窗边茶桌" : "轻盈圈椅";
    project.task = { id: uid(), active: true, paused: false, phase: 0, round: options.round || 1, maxRounds: options.maxRounds || (project.auto ? project.rounds : 1), parent: parent?.id || null, change, region: options.region || null, params, design: synthesizeDesign(project.prompt, parent, change, params), prompt: project.prompt, candidate: null, nextAt: Date.now()+1100 };
    project.status = "generating"; persist(); render(); schedule();
    if (innerWidth <= 760) stage.scrollIntoView({block:"center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  function schedule() {
    clearTimeout(timer); if (!running()) return;
    timer = setTimeout(advance, Math.max(100, project.task.nextAt - Date.now()));
  }
  function advance() {
    if (!running()) return;
    if (disconnected) { disconnect(); return; }
    const task = project.task;
    if (failNext) { failNext = false; task.active = false; project.status = "failed"; persist(); render(); notice("出图服务暂未响应。本次演练未扣次数，需求与已有版本已保留。", "error", [["重试这一稿", retry]]); return; }
    task.phase += 1;
    if (task.phase === 2 && !task.candidate) {
      const parent = project.versions.find(v => v.id === task.parent);
      const v = { id: uid(), number: project.versions.length + 1, parent: parent?.number || null, design: task.design, params: task.params, prompt: task.prompt, change: task.change || "初始需求", region: task.region, score: null, scores: [], notes: [], created: Date.now() };
      project.versions.push(v); project.selected = v.id; task.candidate = v.id; project.status = "partial";
    }
    if (task.phase === 3) {
      const v = project.versions.find(v => v.id === task.candidate);
      v.scores = v.design.thin ? [88,87,85,91,90,86] : [87,75,79,86,82,83]; v.score = Math.round(v.scores.reduce((a,b) => a+b,0)/6);
      task.active = false; project.status = "success"; persist(); render();
      if (v.score < project.target && task.round < task.maxRounds) {
        makeTask("按照评审建议优化，让构件更薄、更轻盈", {round:task.round+1,maxRounds:task.maxRounds});
      } else { toast(`V${v.number} 已完成 · ${v.score} 分`); setTab("review"); }
      return;
    }
    task.nextAt = Date.now() + (task.phase === 2 ? 1800 : 1100); persist(); render(); schedule();
  }
  function retry() {
    const task = project.task;
    if (task && !task.active) { task.active = true; task.paused = false; task.nextAt = Date.now()+500; project.status = "generating"; disconnected = false; notice(""); persist(); render(); schedule(); }
  }
  function stop() { clearTimeout(timer); if (!project.task) return; project.task.active = false; project.task.paused = false; project.status = "stopped"; persist(); render(); notice("已停止。已出的图与历史版本都保留，不会继续后续轮次；本次演练未扣次数。", "warning", [["继续这一稿",retry]]); }
  function disconnect() {
    disconnected = true; clearTimeout(timer);
    if (project.task?.active) { project.task.active = false; project.task.paused = true; }
    project.status = "disconnected"; persist(); render();
    notice("连接中断，当前作品已保留。恢复连接后继续查询原任务，不重复创建。", "warning", [["恢复连接", () => { disconnected = false; if (project.task?.paused) retry(); else { notice("连接已恢复，作品没有变化。"); project.status = current() ? "success" : "empty"; persist(); render(); } }]]);
  }
  function clearSelection() { selection = null; $("#selection-box").hidden = true; $("#selection-editor").hidden = true; }
  function chooseTool(next) {
    tool = next; stage.classList.toggle("selecting",next === "select"); $("#pan-tool").setAttribute("aria-pressed",String(next === "pan")); $("#select-tool").setAttribute("aria-pressed",String(next === "select"));
    if (next === "select") { selection = {x:.3,y:.25,w:.4,h:.3}; showSelection(); $("#local-edit").focus(); } else clearSelection();
  }
  function showSelection() {
    const box = $("#selection-box"); box.hidden = false; box.style.left = selection.x*100+"%"; box.style.top = selection.y*100+"%"; box.style.width = selection.w*100+"%"; box.style.height = selection.h*100+"%"; $("#selection-editor").hidden = false;
  }
  function modal(title, html, wide = false) { $("#modal-title").textContent = title; $("#modal-content").innerHTML = html; $("#modal").classList.toggle("compare-dialog",wide); if (!$("#modal").open) $("#modal").showModal(); }
  function closeModal() { $("#modal").close(); }
  function openHistory() {
    const projects = [...store.projects].sort((a,b) => b.updated-a.updated);
    modal("我的作品", '<p>每件作品的需求、版本与评审，一起留在这里。</p><div id="history-list"></div><div class="modal-actions"><button id="history-new" class="primary">新建作品 ↗</button></div>');
    for (const p of projects) {
      const row = document.createElement("div"); row.className = "history-item";
      row.innerHTML = `<div><h3>${esc(p.title)}</h3><p>${p.versions.length} 个版本 · ${new Date(p.updated).toLocaleDateString("zh-CN")}</p></div><button data-restore="${esc(p.id)}">恢复到工作台</button><button class="delete" aria-label="删除${esc(p.title)}">删除</button>`;
      row.querySelector("[data-restore]").addEventListener("click", () => { clearTimeout(timer); project = p; disconnected = Boolean(p.task?.paused); persist(); fillForm(); clearSelection(); zoom=1; pan={x:0,y:0}; closeModal(); notice("已恢复作品与版本轨迹。"); render(); setTab("brief"); if(running()) schedule(); });
      row.querySelector(".delete").addEventListener("click", () => {
        modal("删除这件作品？", `<p>「${esc(p.title)}」的 ${p.versions.length} 个版本将从此浏览器移除。这个操作无法撤销。</p><div class="modal-actions"><button id="delete-confirm">确认删除</button><button id="delete-cancel" class="primary">保留作品</button></div>`);
        $("#delete-cancel").addEventListener("click",openHistory);
        $("#delete-confirm").addEventListener("click", () => { store.projects = store.projects.filter(a => a.id !== p.id); if(project.id === p.id) { project=blank(); fillForm(); } persist(); render(); openHistory(); });
      }); $("#history-list").append(row);
    }
    if(!projects.length) $("#history-list").innerHTML='<p class="muted">还没有作品。从一个想法开始吧。</p>';
    $("#history-new").addEventListener("click", () => { closeModal(); newProject(); });
  }
  function newProject() { if(busy()) return; readForm(); persist(); project=blank(); fillForm(); clearSelection(); notice(""); zoom=1; pan={x:0,y:0}; persist(); render(); setTab("brief",true); $("#prompt").focus(); }
  function compare() {
    const versions = project.versions;
    const options = versions.map(v => `<option value="${v.id}">V${v.number} · ${v.score ?? "待评审"}${v.score === null ? "" : " 分"}</option>`).join("");
    modal("两版之间，找出更好的", `<div class="compare-controls"><label>左侧版本<select id="compare-a">${options}</select></label><label>右侧版本<select id="compare-b">${options}</select></label></div><div class="compare-grid"><article><canvas id="compare-left" width="800" height="600" aria-label="左侧版本家具"></canvas><h3 id="compare-title-a"></h3><p id="compare-text-a"></p></article><article><canvas id="compare-right" width="800" height="600" aria-label="右侧版本家具"></canvas><h3 id="compare-title-b"></h3><p id="compare-text-b"></p></article></div><div id="compare-delta" class="compare-delta"></div><div class="modal-actions"><button id="choose-right" class="primary">沿右侧版本继续 ↗</button></div>`,true);
    $("#compare-a").value=versions[0].id; $("#compare-b").value=current().id === versions[0].id ? versions.at(-1).id : current().id;
    function update() {
      const a=versions.find(v=>v.id===$("#compare-a").value), b=versions.find(v=>v.id===$("#compare-b").value);
      Furniture.render($("#compare-left"),a.design); Furniture.render($("#compare-right"),b.design);
      $("#compare-title-a").textContent=`V${a.number} · ${a.score ?? "待评审"}${a.score === null ? "" : " 分"}`;
      $("#compare-title-b").textContent=`V${b.number} · ${b.score ?? "待评审"}${b.score === null ? "" : " 分"}`;
      $("#compare-text-a").textContent=a.change; $("#compare-text-b").textContent=b.change;
      $("#compare-delta").textContent=a.id===b.id ? "选择两个不同版本，才能看到变化。" : a.score===null||b.score===null ? "其中一版尚未完成评审，可以先比较形态。" : `综合 ${b.score-a.score>=0?"+":""}${b.score-a.score} 分 · 结构 ${b.scores[1]-a.scores[1]>=0?"+":""}${b.scores[1]-a.scores[1]} · 材质${a.design.material===b.design.material?"保持":"改变"} · ${a.design.thin!==b.design.thin?"构件厚度已调整":"构件厚度相同"}`;
      $("#choose-right").disabled=a.id===b.id;
    }
    $("#compare-a").addEventListener("change",update); $("#compare-b").addEventListener("change",update);
    $("#choose-right").addEventListener("click",()=>{project.selected=$("#compare-b").value;persist();render();closeModal();setTab("review",true);});update();
  }
  function wrapText(c,text,x,y,maxWidth,lineHeight,maxLines=5) {
    let line="",lines=0;
    for(const char of text) { if(c.measureText(line+char).width>maxWidth) { c.fillText(line,x,y); y+=lineHeight; line=""; lines++; if(lines>=maxLines) { c.fillText("…",x,y);return y; } } line+=char; }
    c.fillText(line,x,y);return y+lineHeight;
  }
  function download(canvasToSave,name) {
    canvasToSave.toBlob(blob=>{ if(!blob) {toast("导出失败，请重试。");return;} const a=document.createElement("a"); const url=URL.createObjectURL(blob); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast("已准备下载。"); },"image/png");
  }
  function exportOpen() {
    const v=current(); if(!v) return;
    modal("把这一版带走",'<p>主图、六维评审、材质与设计说明，排成一页。</p><canvas id="export-sheet" class="export-canvas" width="1200" height="1500" aria-label="作品导出预览"></canvas><div class="modal-actions"><button id="download-sheet" class="primary">下载作品页 PNG</button><button id="download-image">只下载主图</button></div>');
    const sheet=$("#export-sheet"),c=sheet.getContext("2d");c.fillStyle="#f3f4f6";c.fillRect(0,0,1200,1500);
    c.fillStyle="#244be8";c.font="26px sans-serif";c.fillText("木生 · 形场",64,80);
    c.fillStyle="#20242c";c.font="48px sans-serif";wrapText(c,project.title,64,160,1000,56,2);
    const art=document.createElement("canvas");art.width=1080;art.height=750;Furniture.render(art,v.design);c.drawImage(art,60,190);
    c.font="26px sans-serif";c.fillText(`V${v.number}  /  ${project.style}  /  ${v.design.material==="wood"?"白蜡木":"数字材质"}`,64,980);
    c.font="22px sans-serif";c.fillStyle="#626873";wrapText(c,v.prompt+(v.change!=="初始需求"?" 修改："+v.change:""),64,1036,1072,36,3);
    c.strokeStyle="#d9dde5";c.beginPath();c.moveTo(64,1196);c.lineTo(1136,1196);c.stroke();
    c.fillStyle="#20242c";c.font="24px sans-serif";c.fillText(`综合评审 ${v.score===null?"待完成":v.score+" / 100"}`,64,1250);
    c.font="22px sans-serif";dimensions.forEach((d,i)=>c.fillText(`${d}  ${v.scores[i]??"—"}`,64+(i%3)*360,1304+Math.floor(i/3)*44));
    c.fillStyle="#626873";c.font="18px sans-serif";c.fillText("astra 离线交互提案 · 程序化家具与模拟评审 · 不替代结构工程验证",64,1440);
    $("#download-sheet").addEventListener("click",()=>download(sheet,`木生-${project.title}-V${v.number}-作品页.png`));
    $("#download-image").addEventListener("click",()=>{
      const raw=document.createElement("canvas");const [ratio,res]=v.params.ratio.split("-");raw.height=res==="1080"?1080:720;raw.width=ratio==="16:9"?raw.height*16/9:raw.height*4/3;Furniture.render(raw,v.design);download(raw,`木生-V${v.number}.png`);
    });
  }
  function account(register=false) {
    modal(register?"建立你的设计档案":"欢迎回到木生",`<p>登录后跨设备继续同一件作品。当前提案可直接体验，无需登录。</p><form id="account-form"><label>邮箱<input type="email" required placeholder="you@example.com" autocomplete="email"></label><label>密码<input type="password" required minlength="8" autocomplete="${register?"new-password":"current-password"}" placeholder="至少 8 位"></label><button class="primary">${register?"注册":"登录"}</button></form><div class="modal-actions"><button id="account-switch">${register?"已有账号，去登录":"创建账号"}</button><button id="account-skip">继续体验</button></div>`);
    $("#account-form").addEventListener("submit",e=>{e.preventDefault();toast("登录界面演示：未发送或保存邮箱与密码。实际使用需连接账号服务。");$("#account-form").reset();});
    $("#account-switch").addEventListener("click",()=>account(!register));$("#account-skip").addEventListener("click",closeModal);
  }
  function stateDemo() {
    modal("状态演练",'<p>这里是离线提案的状态测试入口。不会调用模型或扣除次数。演练使用独立作品，现有作品保留在作品集。</p><div class="state-grid"><button data-state="empty">空态</button><button data-state="generating">生成中</button><button data-state="partial">部分结果</button><button data-state="success">成功</button><button data-state="failed">失败</button><button data-state="stopped">已停止</button><button data-state="disconnected">断线</button><button data-state="recovered">刷新恢复</button></div>');
    $$('[data-state]').forEach(b=>b.addEventListener("click",()=>{
      const state=b.dataset.state;closeModal();clearTimeout(timer);
      if(busy()) {project.task.active=false;project.task.paused=false;project.status="stopped";} readForm();persist();
      project=blank();project.title="状态演练 · "+b.textContent;project.prompt=examples.chair;fillForm();notice("");clearSelection();persist();render();setTab("brief");
      if(state==="empty") return;
      makeTask();clearTimeout(timer);
      if(["partial","success","stopped","disconnected"].includes(state)) {advance();clearTimeout(timer);advance();clearTimeout(timer);}
      if(state==="success") {advance();return;}
      if(state==="stopped") {stop();return;}
      if(state==="disconnected") {disconnect();return;}
      if(state==="failed") {failNext=true;advance();return;}
      if(state==="recovered") {persist();location.reload();return;}
      project.task.nextAt=Date.now()+(state==="partial"?6000:1100);persist();schedule();
    }));
  }
  // Forms and view controls.
  $("#generate-form").addEventListener("submit",e=>{e.preventDefault();makeTask("",{fresh:true});});
  $("#generate-form").addEventListener("input",()=>{if(!busy()){readForm();persist();}});
  $$('[data-example]').forEach(b=>b.addEventListener("click",()=>{$("#prompt").value=examples[b.dataset.example];readForm();persist();$("#prompt").focus();}));
  $("#empty-example").addEventListener("click",()=>{$("#prompt").value=examples.chair;readForm();persist();setTab("brief",true);$("#prompt").focus();});
  $("#new-project").addEventListener("click",newProject);$("#history-open").addEventListener("click",openHistory);
  $("#stop-generation").addEventListener("click",stop);$("#compare-open").addEventListener("click",compare);$("#export-open").addEventListener("click",exportOpen);
  $("#apply-suggestion").addEventListener("click",()=>makeTask("按照评审建议优化，让横向构件更薄，保留支撑关系"));
  $("#apply-edit").addEventListener("click",()=>{const value=$("#edit-prompt").value.trim();if(!value){$("#edit-prompt").focus();toast("先写一句修改意见。");return;}makeTask(value);$("#edit-prompt").value="";});
  $("#rerun").addEventListener("click",()=>{const v=current();if(!v)return;project.prompt=v.prompt;Object.assign(project,v.params);project.english=v.params.english;fillForm();makeTask("同参数重跑");});
  $("#restore-description").addEventListener("click",()=>{const v=current();if(!v)return;project.prompt=v.prompt;Object.assign(project,v.params);project.english=v.params.english;fillForm();persist();setTab("brief",true);toast("已回填此版需求与参数，尚未生成。");});
  $("#apply-local").addEventListener("click",()=>{const value=$("#local-edit").value.trim();if(!value){$("#local-edit").focus();toast("写一句选区修改意见。");return;}const region={...selection,zoom,pan:{...pan}};makeTask(value,{region});chooseTool("pan");$("#local-edit").value="";});
  $("#pan-tool").addEventListener("click",()=>chooseTool("pan"));$("#select-tool").addEventListener("click",()=>chooseTool("select"));$("#cancel-selection").addEventListener("click",()=>chooseTool("pan"));
  $("#annotate-tool").addEventListener("click",()=>{modal("给这一版留个批注",'<form id="annotation-form"><label>批注内容<textarea id="annotation-text" required maxlength="300" rows="3" placeholder="这版的靠背比例值得保留"></textarea></label><button class="primary">保存批注</button></form>');$("#annotation-form").addEventListener("submit",e=>{e.preventDefault();const value=$("#annotation-text").value.trim();if(!value)return;current().notes.push(value);persist();render();closeModal();});});
  $("#project-title").addEventListener("click",()=>{modal("给作品起个名字",`<form id="rename-form"><label>作品名称<input id="rename-value" maxlength="40" required value="${esc(project.title)}"></label><button class="primary">保存</button></form>`);$("#rename-form").addEventListener("submit",e=>{e.preventDefault();project.title=$("#rename-value").value.trim()||"未命名作品";persist();render();closeModal();});});
  $("#account-open").addEventListener("click",()=>account());$("#modal-close").addEventListener("click",closeModal);$("#demo-open").addEventListener("click",stateDemo);
  $$('[data-tab]').forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
  for(const m of ["solid","ascii","dither"]) $("#view-"+m).addEventListener("click",()=>{mode=m;for(const item of ["solid","ascii","dither"]) $("#view-"+item).setAttribute("aria-pressed",String(m===item));renderCanvas();});
  function changeZoom(delta) { zoom=Math.max(.4,Math.min(2.4,zoom+delta));clearSelection();renderCanvas(); }
  $("#zoom-in").addEventListener("click",()=>changeZoom(.1));$("#zoom-out").addEventListener("click",()=>changeZoom(-.1));
  $("#zoom-reset").addEventListener("click",()=>{zoom=1;pan={x:0,y:0};clearSelection();renderCanvas();});
  $("#keyboard-help").addEventListener("click",()=>modal("画布快捷键",'<p>画布获得焦点后：方向键平移，＋ / − 缩放，0 复位，Esc 清除选区。</p><p>鼠标滚轮缩放，按住画布拖动平移。手机可单指拖动，用 ＋ / − 调整大小。</p><p>框选按钮会给出一个可直接修改的初始选区，也可以在画布上拖出自己的区域。</p>'));
  stage.addEventListener("keydown",e=>{if(e.target!==stage)return;const moves={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(moves[e.key]){e.preventDefault();pan.x+=moves[e.key][0];pan.y+=moves[e.key][1];clearSelection();renderCanvas();}if(["+","=","-"].includes(e.key)){e.preventDefault();changeZoom(e.key==="-"?-.1:.1);}if(e.key==="0")$("#zoom-reset").click();if(e.key==="Escape")chooseTool("pan");});
  stage.addEventListener("wheel",e=>{e.preventDefault();changeZoom(e.deltaY>0?-.05:.05);},{passive:false});
  stage.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;stage.focus({preventScroll:true});const r=stage.getBoundingClientRect();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:(e.clientX-r.left)/r.width,startY:(e.clientY-r.top)/r.height,pan:{...pan}};stage.setPointerCapture(e.pointerId);});
  stage.addEventListener("pointermove",e=>{if(!gesture||gesture.id!==e.pointerId)return;const r=stage.getBoundingClientRect();if(tool==="select"&&current()&&!busy()){const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));selection={x:Math.min(x,gesture.startX),y:Math.min(y,gesture.startY),w:Math.max(.01,Math.abs(x-gesture.startX)),h:Math.max(.01,Math.abs(y-gesture.startY))};showSelection();}else{pan.x=Math.max(-r.width,Math.min(r.width,gesture.pan.x+e.clientX-gesture.x));pan.y=Math.max(-r.height,Math.min(r.height,gesture.pan.y+e.clientY-gesture.y));renderCanvas();}});
  stage.addEventListener("pointerup",()=>{gesture=null;});stage.addEventListener("pointercancel",()=>{gesture=null;});
  window.addEventListener("offline",()=>{if(busy())disconnect();});
  window.addEventListener("online",()=>{if(disconnected)notice("网络已恢复，可以继续查询原任务。","",[["继续任务",retry]]);});
  window.addEventListener("pagehide",()=>{readForm();persist();});
  new ResizeObserver(renderCanvas).observe(stage);
  // Restore an existing task by its saved phase/candidate ID, never create a second candidate.
  const query=new URLSearchParams(location.search);
  if(query.get("prompt")){project=blank();project.prompt=query.get("prompt").slice(0,1200);history.replaceState(null,"",location.pathname);}
  fillForm();setTab(activeTab);render();
  if(storageError)notice("无法读取浏览器中的草稿。当前会话可继续，建议完成后导出。","warning");
  if(running()){notice("已恢复生成现场，继续原任务；不会重复生成或扣次数。");schedule();}
  else if(project.task?.paused){disconnected=true;notice("已恢复断线前的画布与结果。","warning",[["恢复连接",retry]]);}
  else if(project.status==="failed")notice("上次出图失败，需求与版本已恢复。本次演练未扣次数。","error",[["重试这一稿",retry]]);
  else if(project.status==="stopped")notice("已恢复停止时的现场。已有结果保留。","warning",[["继续这一稿",retry]]);
  else if(project.versions.length)notice("已恢复上次作品与版本轨迹。","",[["收起",()=>notice("")]]);
  if(query.get("view")==="history")openHistory();
})();
