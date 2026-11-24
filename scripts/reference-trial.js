// Loopback trial. The real Studio, queue and provider adapter use only fixture services.
const catalog = require("../src/lib/designCatalog.json");
const { randomUUID } = require("node:crypto");
const { startFixture } = require("../test/support/studio-server.fixture");
const { parseDesignResult } = require("../src/agent/runtime");

async function startTrial() {
  const runtime = {
    status: async () => ({ available: true }),
    startSession: async () => ({ runtimeSessionRef: "ms-" + randomUUID() }),
    sendMessage: async ({ text }) => {
      const observations = catalog.filter(row => text.includes(row.title + " (" + row.source + ") — " + row.principle))
        .map(row => row.title + " · " + row.principle);
      const prompt = (text.startsWith("[上下文：") ? text.split("。]\n").slice(1).join("。]\n") : text).trim();
      return { text: JSON.stringify({
        reply: "本机模拟回执。" + (observations.length ? observations.join("\n") : "本次没有匹配的公开作品。"),
        ready: Boolean(prompt),
        brief: prompt ? { prompt, use: "", size: "", wood: "", structure: "", style: "newChinese", constraints: [] } : null,
      }) };
    },
    readResult: parseDesignResult,
    cancel: () => false,
  };
  const fixture = await startFixture({ designChatRuntime: runtime, guestChatRuntime: runtime, guestGeneration: { perSession: 20, perDay: 100 } });
  console.log("离线试用（图片回包为木生标志） " + fixture.base + "/studio?guest=1");
  for (const event of ["SIGINT", "SIGTERM"]) process.once(event, () => fixture.close().then(() => process.exit()));
}

startTrial().catch(error => { console.error(error.message); process.exitCode = 1; });
