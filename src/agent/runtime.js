// The design chat talks to an agent framework only through this interface.
// An adapter implements every method; swapping frameworks swaps the adapter.
//
//   status()                                  -> Promise<{ available, reason }>
//   startSession()                            -> Promise<{ runtimeSessionRef }>
//   sendMessage({ runtimeSessionRef, text })  -> Promise<{ text }>  raw assistant reply
//   readResult(text)                          -> { reply, ready, brief }  strict, throws on error
//   cancel(runtimeSessionRef)                 -> boolean  stops a running reply
const RUNTIME_METHODS = ["status", "startSession", "sendMessage", "readResult", "cancel"];

const STYLES = ["ming", "newChinese", "song", "zen"];
const BRIEF_FIELDS = ["prompt", "use", "size", "wood", "structure", "style", "constraints"];
const LIMITS = { reply: 1200, prompt: 1000, field: 160, constraint: 160, constraints: 8 };

// Each code maps to one user-facing message. Raw provider output, stderr and
// local paths never leave the adapter.
const AGENT_ERRORS = {
  disabled: [503, "设计对话未启用"],
  missing: [503, "未找到对话程序 Pi，请联系管理员安装后再试"],
  unconfigured: [503, "对话模型未配置，请联系管理员"],
  auth: [503, "对话模型认证失败，请联系管理员检查凭据"],
  gateway: [503, "对话模型网关无法连接，请稍后再试"],
  timeout: [504, "对话模型回复超时，请重新发送"],
  too_large: [502, "对话模型回复过长，请换个说法重新发送"],
  invalid_result: [502, "对话模型回复格式无效，请重新发送"],
  cancelled: [499, "已停止回复"],
  failed: [502, "对话模型暂时不可用，请稍后再试"],
};

class AgentRuntimeError extends Error {
  constructor(code) {
    const [statusCode, message] = AGENT_ERRORS[code] || AGENT_ERRORS.failed;
    super(message);
    this.name = "AgentRuntimeError";
    this.code = AGENT_ERRORS[code] ? code : "failed";
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

function assertAgentRuntime(runtime) {
  for (const method of RUNTIME_METHODS) {
    if (typeof runtime?.[method] !== "function") throw new TypeError(`agent runtime is missing ${method}()`);
  }
  return runtime;
}

// The system prompt asks for exactly this object. Only an optional ```json
// fence around the whole reply is removed; anything else is rejected.
function parseDesignResult(text) {
  const raw = String(text ?? "").trim();
  const fenced = raw.match(/^```(?:json)?\n([\s\S]*)\n```$/);
  let value;
  try {
    value = JSON.parse(fenced ? fenced[1] : raw);
  } catch {
    throw new AgentRuntimeError("invalid_result");
  }
  if (!isPlainObject(value) || !sameKeys(value, ["reply", "ready", "brief"])) throw new AgentRuntimeError("invalid_result");
  const reply = boundedText(value.reply, LIMITS.reply, true);
  if (typeof value.ready !== "boolean") throw new AgentRuntimeError("invalid_result");
  if (!value.ready) {
    if (value.brief !== null) throw new AgentRuntimeError("invalid_result");
    return { reply, ready: false, brief: null };
  }
  const brief = value.brief;
  if (!isPlainObject(brief) || !sameKeys(brief, BRIEF_FIELDS)) throw new AgentRuntimeError("invalid_result");
  if (!STYLES.includes(brief.style)) throw new AgentRuntimeError("invalid_result");
  if (!Array.isArray(brief.constraints) || brief.constraints.length > LIMITS.constraints) throw new AgentRuntimeError("invalid_result");
  return {
    reply,
    ready: true,
    brief: {
      prompt: boundedText(brief.prompt, LIMITS.prompt, true),
      use: boundedText(brief.use, LIMITS.field),
      size: boundedText(brief.size, LIMITS.field),
      wood: boundedText(brief.wood, LIMITS.field),
      structure: boundedText(brief.structure, LIMITS.field),
      style: brief.style,
      constraints: brief.constraints.map(item => boundedText(item, LIMITS.constraint, true)),
    },
  };
}

function boundedText(value, max, required = false) {
  if (typeof value !== "string") throw new AgentRuntimeError("invalid_result");
  const text = value.trim();
  if ((required && !text) || text.length > max) throw new AgentRuntimeError("invalid_result");
  return text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// Incrementally extract the decoded JSON string for `"reply":"..."` from partial
// streamed output so the user sees natural text instead of raw JSON syntax.
function extractPartialReply(raw) {
  const source = String(raw || "");
  const match = /"reply"\s*:\s*"/.exec(source);
  if (!match) return "";
  let result = "";
  let index = match.index + match[0].length;
  while (index < source.length) {
    const ch = source[index];
    if (ch === '"') break;
    if (ch === "\\") {
      if (index + 1 >= source.length) break;
      const next = source[index + 1];
      if (next === "n") { result += "\n"; index += 2; continue; }
      if (next === "r") { result += "\r"; index += 2; continue; }
      if (next === "t") { result += "\t"; index += 2; continue; }
      if (next === '"' || next === "\\" || next === "/") { result += next; index += 2; continue; }
      if (next === "u") {
        if (index + 6 > source.length) break;
        const hex = source.slice(index + 2, index + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { result += String.fromCharCode(parseInt(hex, 16)); index += 6; continue; }
      }
      result += next; index += 2; continue;
    }
    result += ch;
    index += 1;
  }
  return result.slice(0, LIMITS.reply);
}

function validateBriefPatch(patch) {
  if (!isPlainObject(patch)) throw new Error("要求格式无效");
  const edits = {};
  for (const key of ["use", "size", "wood", "structure"]) {
    if (!Object.hasOwn(patch, key)) continue;
    if (typeof patch[key] !== "string") throw new Error("要求字段必须为文本");
    const text = patch[key].trim();
    if (text.length > LIMITS.field) throw new Error(`单项要求不能超过 ${LIMITS.field} 字`);
    edits[key] = text;
  }
  if (Object.hasOwn(patch, "style")) {
    if (!STYLES.includes(patch.style)) throw new Error("风格取值无效");
    edits.style = patch.style;
  }
  if (Object.hasOwn(patch, "prompt")) {
    if (typeof patch.prompt !== "string") throw new Error("描述必须为文本");
    const text = patch.prompt.trim();
    if (!text || text.length > LIMITS.prompt) throw new Error(`描述需为 1–${LIMITS.prompt} 字`);
    edits.prompt = text;
  }
  if (Object.hasOwn(patch, "constraints")) {
    if (!Array.isArray(patch.constraints) || patch.constraints.length > LIMITS.constraints) throw new Error("要点最多 8 条");
    edits.constraints = patch.constraints.map(item => {
      if (typeof item !== "string") throw new Error("要点必须为文本");
      const text = item.trim();
      if (!text || text.length > LIMITS.constraint) throw new Error(`单条要点需为 1–${LIMITS.constraint} 字`);
      return text;
    });
  }
  if (!Object.keys(edits).length) throw new Error("没有可保存的修改");
  return edits;
}

const DESIGN_SYSTEM_PROMPT = `你是木生家具工作台的需求助手，帮用户在出图前把中式家具或茶室空间的要求问清楚。
规则：
- 每次最多追问 1–2 个最影响出图的点，按顺序考虑：用途与空间、尺寸、木材、结构与榫卯、风格。不要一次抛出一张表单。
- 用户已经说清的内容不要重复问。用户说"随你定"时给出合理默认值。
- 讨论用户指定的家具或茶室空间；空间问题优先确认尺度、动线与采光，不生成图片，不调用工具，保持在本次设计范围内。
- 用户的语言就是回复语言（简体、繁体或英文）。
- 家具按用途、尺寸、木材、结构和风格整理；空间按人数、尺度、动线、采光与围合整理，不适用的字段留空。用户要求直接整理时使用已有信息。
输出：只输出一个 JSON 对象，不要任何其他文字，不要 Markdown。格式二选一：
{"reply":"追问或确认的话","ready":false,"brief":null}
{"reply":"一句确认的话","ready":true,"brief":{"prompt":"可直接用于出图的一段完整设计描述","use":"用途与空间","size":"尺寸","wood":"木材","structure":"结构与连接","style":"ming|newChinese|song|zen 之一","constraints":["必须保留的要点，最多 8 条"]}}
style 取值：ming 明式，newChinese 新中式，song 宋韵，zen 禅意。prompt 不超过 300 字。`;

module.exports = {
  AGENT_ERRORS,
  AgentRuntimeError,
  DESIGN_SYSTEM_PROMPT,
  RUNTIME_METHODS,
  STYLES,
  assertAgentRuntime,
  extractPartialReply,
  parseDesignResult,
  validateBriefPatch,
};
