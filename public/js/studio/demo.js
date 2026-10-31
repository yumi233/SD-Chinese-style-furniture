import { draftingSource } from "./media.js";
import { DIMENSIONS } from "./model.js";

const aliases = { "空态": "empty", "生成中": "generating", "部分结果": "partial", "成功": "success", "失败": "failed", "已停止": "stopped", "断线": "offline", "刷新恢复": "recovered", recovery: "recovered", disconnected: "offline", error: "failed", loading: "generating", restored: "recovered" };
// The demo implements the same response shapes as v1, without sending API requests.
export function createDemo(value) {
  const state = aliases[value] || value;
  const key = `musheng-v3-demo:${state}`;
  let data;
  try { data = JSON.parse(sessionStorage.getItem(key)); } catch { /* Storage is optional. */ }
  if (!data?.interactive) data = null;
  const image = draftingSource().toDataURL("image/png");
  const evaluation = n => ({ score: n, rubric: Object.fromEntries(DIMENSIONS.map(([key], i) => [key, n - 3 + i])), suggestion: "扶手再薄一点，保留靠背弧线", learningFeedback: { nextSteps: ["缩小座面厚度，让结构更轻巧", "保持榫卯连接，收细椅腿"] }, revisedPrompt: "A light Ming-style walnut armchair, slender armrests and curved back." });
  const record = (id, parentId, n = 86) => ({ id, parentId, title: "轻木 · 圈椅", originalPrompt: "黑胡桃木明式圈椅，保留靠背弧线", finalPrompt: "Ming-style walnut armchair, curved back.", type: "agent", style: "ming", createdAt: new Date(Date.now() - (id === "demo-one" ? 60000 : 30000)).toISOString(), images: [{ url: image }], bestRound: 1, rounds: [{ round: 1, image: { url: image }, prompt: "Ming-style walnut armchair, curved back.", evaluation: evaluation(n) }] });
  if (!data) {
    data = { records: ["empty", "generating", "recovered", "failed"].includes(state) ? [] : [record("demo-one", null, 82), record("demo-two", "demo-one", 88)], task: null };
    if (["generating", "partial", "recovered", "offline"].includes(state)) data.task = {
      id: "demo-active", requestId: "demo_initial_request", mode: "agent", status: "running", phase: "preparing", round: 0,
      request: { mode: "agent", engine: "imageModel", prompt: "设计一把轻巧的明式圈椅", originalPrompt: "设计一把轻巧的明式圈椅", ...(state === "partial" ? { parentId: "demo-two" } : {}), maxRounds: 2 },
      createdAt: new Date().toISOString(), start: Date.now() - (state === "partial" ? 4800 : 0),
    };
    if (state === "failed" || state === "stopped") data.task = { id: "demo-terminal", requestId: "demo_terminal_request", status: state === "failed" ? "failed" : "completed", phase: "generating", mode: "agent", request: { prompt: "设计一把圈椅" }, stopRequested: state === "stopped", message: state === "failed" ? "图像服务暂时不可用，请稍后重试。" : "已停止后续迭代，已有结果保留。", ...(state === "stopped" ? { result: { historyRecord: data.records.at(-1) } } : {}) };
  }
  const persist = () => { try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* Demo can run without storage. */ } };
  function tick() {
    const task = data.task;
    if (!task || !["running", "queued"].includes(task.status)) return;
    const elapsed = Date.now() - task.start;
    task.phase = elapsed < 1200 ? "preparing" : elapsed < 4200 ? "generating" : "reviewing";
    task.round = elapsed < 6200 ? 1 : 2;
    if (elapsed >= 4200) {
      const result = record(`${task.id}-result`, task.request.parentId || null, elapsed < 6200 ? 78 : 88);
      result.createdAt = task.createdAt;
      result.originalPrompt = task.request.originalPrompt || task.request.prompt;
      if (task.mode === "normal") { result.type = "generation"; result.rounds = []; result.bestRound = null; }
      else if (elapsed >= 6200 && !task.stopRequested) result.rounds = [
        { ...result.rounds[0], evaluation: evaluation(78) }, { ...result.rounds[0], round: 2, evaluation: evaluation(88) },
      ];
      task.result = { historyRecord: result, rounds: result.rounds, bestImage: result.images[0], bestEvaluation: evaluation(88) };
      data.records = [...data.records.filter(item => item.id !== result.id), result];
      if (task.mode === "normal" || (task.stopRequested && elapsed >= 5000) || elapsed >= 8500) { task.status = "completed"; task.phase = "completed"; }
    }
    persist();
  }
  persist();
  return async (path, body, method = body ? "POST" : "GET") => {
    tick();
    if (state === "offline" && Date.now() - data.task.start < 10000 && path.includes("generation-tasks/")) throw new TypeError("演示连接中断");
    if (path === "/auth/me") return { user: { id: "demo-user", displayName: "演示", email: "demo@example.invalid", isAdmin: false } };
    if (path === "/engines") return { defaultEngine: "imageModel", modes: ["imageModel"], agentEngines: ["imageModel"] };
    if (path === "/history") return { records: data.records };
    if (path.startsWith("/history/") && method === "DELETE") { const id = path.split("/").at(-1); data.records = data.records.filter(item => item.id !== id).map(item => item.parentId === id ? { ...item, parentId: null } : item); persist(); return { ok: true }; }
    if (path === "/generation-tasks" && method === "GET") return { tasks: data.task && ["running", "queued"].includes(data.task.status) ? [data.task] : [] };
    if (path === "/generation-tasks" && body) {
      data.interactive = true;
      data.task = { id: crypto.randomUUID(), requestId: body.requestId, request: body, mode: body.mode, phase: "preparing", status: "running", start: Date.now(), createdAt: new Date().toISOString() };
      persist(); return { task: structuredClone(data.task) };
    }
    if (path.endsWith("/stop")) { data.interactive = true; data.task.stopRequested = data.task.mode === "agent"; persist(); return { task: structuredClone(data.task) }; }
    if (path.startsWith("/generation-tasks/")) return { task: structuredClone(data.task) };
    if (path === "/auth/logout") return { ok: true };
    throw new Error("演示入口不保存账号或模型设置");
  };
}
