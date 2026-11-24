const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { AgentRuntimeError, DESIGN_SYSTEM_PROMPT, assertAgentRuntime, extractPartialReply, parseDesignResult } = require("./runtime");

const KEY_ENV = "MUSHENG_PI_API_KEY";
const SESSION_REF = /^ms-[a-f0-9-]{36}$/;
// Pi reads `@path` arguments as file attachments, so the user's text is never
// the first character of the message argument.
const MESSAGE_PREFIX = "用户：";
const STDERR_LIMIT = 8 * 1024;
const THINKING = ["off", "minimal", "low", "medium", "high"];

// Runs Pi as a one-shot child per message. Pi only sees a private agent
// directory holding one provider and one model, an empty working directory,
// its own HOME/TMPDIR and a minimal environment. Tools, extensions, MCP,
// skills, prompt templates, context files and automatic retries are all off.
function createPiAdapter(options = {}) {
  const {
    command = "pi",
    provider = "magpie",
    model = "",
    thinking = "",
    modelsFile = "",
    dataDir,
    timeoutMs = 90_000,
    maxOutputBytes = 2 * 1024 * 1024,
    systemPrompt = DESIGN_SYSTEM_PROMPT,
    baseEnv = process.env,
    spawnImpl = spawn,
    probeGateway = probeTcp,
  } = options;
  if (!dataDir) throw new TypeError("Pi adapter requires dataDir");
  const dirs = {
    agent: path.join(dataDir, "agent"),
    home: path.join(dataDir, "home"),
    tmp: path.join(dataDir, "tmp"),
    sessions: path.join(dataDir, "sessions"),
    work: path.join(dataDir, "work"),
  };
  const running = new Map();

  function resolveSetup() {
    const executable = resolveCommand(command, baseEnv.PATH);
    if (!executable) return { reason: "missing" };
    if (!model || !provider) return { reason: "unconfigured" };
    let source;
    try {
      source = JSON.parse(fs.readFileSync(modelsFile, "utf8"))?.providers?.[provider];
    } catch {
      return { reason: "unconfigured" };
    }
    const modelEntry = Array.isArray(source?.models) ? source.models.find(item => item?.id === model) : null;
    if (!modelEntry || typeof source.baseUrl !== "string") return { reason: "unconfigured" };
    const apiKey = resolveKey(source.apiKey, baseEnv);
    if (!apiKey) return { reason: "auth" };
    writePrivateConfig(dirs, provider, model, source, modelEntry);
    return { executable, apiKey, baseUrl: source.baseUrl };
  }

  async function status() {
    const setup = resolveSetup();
    if (setup.reason) return { available: false, reason: setup.reason };
    if (probeGateway && !(await probeGateway(setup.baseUrl))) return { available: false, reason: "gateway" };
    return { available: true, reason: null };
  }

  async function startSession() {
    return { runtimeSessionRef: `ms-${randomUUID()}` };
  }

  function sendMessage({ runtimeSessionRef, text, attachments = [], onDelta } = {}) {
    if (!SESSION_REF.test(String(runtimeSessionRef || ""))) return Promise.reject(new AgentRuntimeError("failed"));
    if (running.has(runtimeSessionRef)) return Promise.reject(new AgentRuntimeError("failed"));
    const setup = resolveSetup();
    if (setup.reason) return Promise.reject(new AgentRuntimeError(setup.reason));
    const tempFiles = [];
    const attachmentArgs = [];
    try {
      for (const item of Array.isArray(attachments) ? attachments : []) {
        if (!item?.bytes || !Buffer.isBuffer(item.bytes)) continue;
        const ext = item.mimeType === "image/jpeg" ? ".jpg" : item.mimeType === "image/webp" ? ".webp" : ".png";
        const file = path.join(dirs.tmp, `att-${randomUUID()}${ext}`);
        fs.writeFileSync(file, item.bytes, { mode: 0o600 });
        tempFiles.push(file);
        attachmentArgs.push(`@${file}`);
      }
    } catch {
      for (const file of tempFiles) fs.rmSync(file, { force: true });
      return Promise.reject(new AgentRuntimeError("failed"));
    }
    const args = [
      "-p", "--mode", "json", "--no-tools",
      "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes",
      "--no-context-files", "--no-approve", "--offline",
      "--provider", provider, "--model", model,
      ...(THINKING.includes(thinking) ? ["--thinking", thinking] : []),
      "--session-dir", dirs.sessions, "--session-id", runtimeSessionRef,
      "--system-prompt", systemPrompt,
      ...attachmentArgs,
      "--", MESSAGE_PREFIX + String(text),
    ];
    const env = {
      PATH: [path.dirname(setup.executable), path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
      HOME: dirs.home,
      TMPDIR: dirs.tmp,
      LANG: "C.UTF-8",
      PI_CODING_AGENT_DIR: dirs.agent,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      NO_COLOR: "1",
      [KEY_ENV]: setup.apiKey,
    };
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(setup.executable, args, { cwd: dirs.work, env, stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        for (const file of tempFiles) fs.rmSync(file, { force: true });
        reject(new AgentRuntimeError("missing"));
        return;
      }
      const state = { child, failure: null, stdoutBytes: 0, pending: Buffer.alloc(0), stderr: "", assistant: null, settled: false, streamText: "", lastReply: "" };
      running.set(runtimeSessionRef, state);
      let killTimer;
      const stop = code => {
        if (state.failure) return;
        state.failure = code;
        try { child.kill("SIGTERM"); } catch { /* already gone */ }
        killTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, 2000);
        killTimer.unref?.();
      };
      state.stop = stop;
      const timer = setTimeout(() => stop("timeout"), timeoutMs);

      const handleRecord = line => {
        if (!line.trim()) return;
        let event;
        try { event = JSON.parse(line); } catch { stop("failed"); return; }
        if (event?.type === "session" && event.id !== runtimeSessionRef) stop("failed");
        // Tools are disabled; a tool call or an automatic retry means the
        // isolation did not hold, so the run is stopped rather than trusted.
        if (event?.type === "tool_execution_start" || event?.type === "auto_retry_start"
          || event?.assistantMessageEvent?.type === "toolcall_start") stop("failed");
        if (event?.type === "message_update") {
          const delta = event.assistantMessageEvent?.type === "text_delta"
            ? event.assistantMessageEvent.delta
            : typeof event.delta === "string" ? event.delta : "";
          if (delta) {
            state.streamText += delta;
            const preview = extractPartialReply(state.streamText);
            if (preview.length > state.lastReply.length) {
              state.lastReply = preview;
              try { onDelta?.(preview); } catch { /* ignore listener errors */ }
            }
          }
        }
        if (event?.type === "message_end" && event.message?.role === "assistant") state.assistant = event.message;
        if (event?.type === "agent_settled") state.settled = true;
      };
      child.stdout.on("data", chunk => {
        state.stdoutBytes += chunk.length;
        if (state.stdoutBytes > maxOutputBytes) { stop("too_large"); return; }
        state.pending = Buffer.concat([state.pending, chunk]);
        let index;
        while ((index = state.pending.indexOf(0x0a)) !== -1) {
          const line = state.pending.subarray(0, index).toString("utf8").replace(/\r$/, "");
          state.pending = state.pending.subarray(index + 1);
          handleRecord(line);
        }
      });
      child.stderr.on("data", chunk => {
        if (state.stderr.length < STDERR_LIMIT) state.stderr += chunk.toString("utf8").slice(0, STDERR_LIMIT - state.stderr.length);
      });
      child.on("error", error => {
        if (!state.failure) state.failure = error?.code === "ENOENT" ? "missing" : "failed";
      });
      child.on("close", code => {
        clearTimeout(timer); clearTimeout(killTimer);
        running.delete(runtimeSessionRef);
        for (const file of tempFiles) fs.rmSync(file, { force: true });
        if (!state.failure && state.pending.length) handleRecord(state.pending.toString("utf8"));
        if (state.failure) {
          const err = new AgentRuntimeError(state.failure);
          const partial = state.lastReply || extractPartialReply(state.streamText);
          if (partial) err.partialText = partial;
          reject(err);
          return;
        }
        const message = state.assistant;
        if (!message) { reject(new AgentRuntimeError(code === 0 ? "failed" : classify(state.stderr))); return; }
        if (message.stopReason === "aborted") {
          const err = new AgentRuntimeError("cancelled");
          const partial = state.lastReply || extractPartialReply(state.streamText);
          if (partial) err.partialText = partial;
          reject(err);
          return;
        }
        if (message.stopReason === "length") { reject(new AgentRuntimeError("too_large")); return; }
        if (message.stopReason !== "stop") { reject(new AgentRuntimeError(classify(`${message.errorMessage || ""}\n${state.stderr}`))); return; }
        const reply = Array.isArray(message.content)
          ? message.content.filter(block => block?.type === "text").map(block => block.text).join("")
          : typeof message.content === "string" ? message.content : "";
        resolve({ text: reply });
      });
    });
  }

  function cancel(runtimeSessionRef) {
    const state = running.get(runtimeSessionRef);
    if (!state) return false;
    state.stop("cancelled");
    return true;
  }

  // Optional: removes Pi session files untouched for longer than maxAgeMs.
  function prune(maxAgeMs) {
    let names = [];
    try { names = fs.readdirSync(dirs.sessions); } catch { return 0; }
    let removed = 0;
    for (const name of names) {
      const file = path.join(dirs.sessions, name);
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) { fs.rmSync(file, { force: true, recursive: true }); removed += 1; }
      } catch { /* already gone */ }
    }
    return removed;
  }

  return assertAgentRuntime({ status, startSession, sendMessage, readResult: parseDesignResult, cancel, prune });
}

// Only the category leaves this function; the matched text is discarded.
function classify(text) {
  const value = String(text || "");
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|api[ _-]?key|authenticat|credential|no auth/i.test(value)) return "auth";
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up|\b(502|503|504)\b|connection (refused|error|reset)/i.test(value)) return "gateway";
  if (/model[^\n]{0,40}(not found|unknown|unavailable)|no models? (match|found|available)/i.test(value)) return "unconfigured";
  return "failed";
}

function resolveCommand(command, searchPath = "") {
  const candidates = command.includes("/")
    ? [path.resolve(command)]
    : String(searchPath).split(path.delimiter).filter(Boolean).map(dir => path.join(dir, command));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* keep searching */ }
  }
  return null;
}

// Pi's own syntax: `$NAME` / `${NAME}` read the environment, `$$` is a literal
// dollar. Shell-command values (`!cmd`) are refused instead of executed.
function resolveKey(value, env) {
  if (typeof value !== "string" || !value || value.startsWith("!")) return "";
  let missing = false;
  const resolved = value.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
    if (match === "$$") return "$";
    const found = env[braced || bare];
    if (!found) missing = true;
    return found || "";
  });
  return missing ? "" : resolved;
}

function writePrivateConfig(dirs, provider, model, source, modelEntry) {
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const block = { api: source.api, baseUrl: source.baseUrl, apiKey: `$${KEY_ENV}`, models: [modelEntry] };
  if (source.name) block.name = source.name;
  if (source.compat) block.compat = source.compat;
  writeIfChanged(path.join(dirs.agent, "models.json"), { providers: { [provider]: block } });
  writeIfChanged(path.join(dirs.agent, "settings.json"), {
    defaultProvider: provider,
    defaultModel: model,
    quietStartup: true,
    enableInstallTelemetry: false,
    enableSkillCommands: false,
    packages: [], extensions: [], skills: [], prompts: [], themes: [],
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
  });
  writeIfChanged(path.join(dirs.agent, "auth.json"), {});
}

function writeIfChanged(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try { if (fs.readFileSync(filePath, "utf8") === serialized) return; } catch { /* write below */ }
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, serialized, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function probeTcp(baseUrl, timeoutMs = 1500) {
  let url;
  try { url = new URL(baseUrl); } catch { return Promise.resolve(false); }
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  return new Promise(resolve => {
    const socket = net.connect({ host: url.hostname.replace(/^\[|\]$/g, ""), port });
    const done = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

module.exports = { createPiAdapter, classify, resolveKey, probeTcp, MESSAGE_PREFIX };
