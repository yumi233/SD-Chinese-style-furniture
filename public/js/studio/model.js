export const DIMENSIONS = [
  ["cultureAccuracy", "文化"], ["structureReasoning", "结构"],
  ["materialCraft", "工艺"], ["designInnovation", "创新"],
  ["sceneFit", "场景"], ["aiUsage", "AI 运用"],
];
export const ACTIVE = new Set(["queued", "running"]);
export const PHASES = { preparing: "理解需求", generating: "出图", reviewing: "评审", saving: "保存", completed: "已完成" };
export function score(value) {
  return value != null && Number.isFinite(Number(value)) ? Math.round(Math.max(0, Math.min(100, Number(value)))) : null;
}
export function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export function requirementTags(text) {
  return [...new Set(String(text).split(/[，,。；;\s：:]+/).filter(Boolean))].slice(0, 6);
}
export function regionDescription(box) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return `${y < 1 / 3 ? "上" : y > 2 / 3 ? "下" : "中"}${x < 1 / 3 ? "左" : x > 2 / 3 ? "右" : "间"}区域`;
}
// Each round shares its server history ID. Local node keys never become parentId.
export function versionNodes(records) {
  const sorted = [...records].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  const nodes = sorted.flatMap(record => {
    const rounds = record.rounds?.length ? record.rounds : (record.images || []).map((image, i) => ({ image, round: i + 1, prompt: record.finalPrompt }));
    return rounds.map((round, index) => ({
      key: `${record.id}:${index}`, historyId: record.id, record, round: round.round,
      image: round.image, prompt: round.prompt || record.finalPrompt,
      evaluation: round.evaluation || (record.bestRound === round.round ? record.bestEvaluation : null),
      parentKey: index && record.type === "agent" ? `${record.id}:${index - 1}` : null,
    }));
  });
  const byRecord = new Map(sorted.map(record => {
    const family = nodes.filter(node => node.historyId === record.id);
    return [record.id, family.find(node => node.round === record.bestRound) || family.at(-1)];
  }));
  nodes.forEach((node, index) => {
    if (!node.parentKey) node.parentKey = byRecord.get(node.record.parentId)?.key || null;
    node.version = index + 1;
  });
  return nodes;
}
export function familyRecords(records, id) {
  const connected = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      if (connected.has(record.id) && record.parentId && records.some(item => item.id === record.parentId) && !connected.has(record.parentId)) {
        connected.add(record.parentId); changed = true;
      }
      if (connected.has(record.parentId) && !connected.has(record.id)) { connected.add(record.id); changed = true; }
    }
  }
  return records.filter(record => connected.has(record.id));
}
export function layoutNodes(nodes) {
  const positions = new Map();
  const visiting = new Set();
  const depths = new Map();
  const depth = node => {
    if (depths.has(node.key)) return depths.get(node.key);
    if (visiting.has(node.key)) return 0;
    visiting.add(node.key);
    const parent = nodes.find(item => item.key === node.parentKey);
    const value = parent ? Math.min(nodes.length, depth(parent) + 1) : 0;
    visiting.delete(node.key); depths.set(node.key, value); return value;
  };
  const rows = new Map();
  for (const node of nodes) {
    const column = depth(node);
    const row = rows.get(column) || 0;
    rows.set(column, row + 1);
    positions.set(node.key, { x: column * 408, y: row * 392 });
  }
  return positions;
}
export function suggestions(evaluation = {}) {
  return [...new Set([...(evaluation.learningFeedback?.nextSteps || []), evaluation.suggestion, ...(evaluation.problems || [])].filter(item => typeof item === "string" && item.trim()))].slice(0, 6);
}
export function generationPayload({ description, parent, memory = [], settings = {} }) {
  const originalPrompt = [parent ? `基于已有方案：${parent.record.originalPrompt || parent.prompt}` : "", description, memory.length ? `必须保留：${memory.join("；")}` : "", settings.constraints].filter(Boolean).join("\n");
  return {
    engine: settings.engine || "imageModel", mode: settings.mode || "normal",
    originalPrompt, prompt: [originalPrompt, settings.englishPrompt].filter(Boolean).join("\n"),
    ...(parent ? { parentId: parent.historyId } : {}),
    style: settings.style || "ming", quality: settings.quality || "hd", size: settings.size || "16:9-720p",
    mood: Number(settings.mood ?? 62), negativePrompt: settings.negativePrompt || "",
    targetScore: Number(settings.targetScore || 85), maxRounds: Number(settings.maxRounds || 2),
  };
}
