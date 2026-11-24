const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startFixture } = require("./support/studio-server.fixture");
const { parseDesignResult } = require("../src/agent/runtime");

// Same opt-in browser setup as v3Browser.test.js. The chat runtime is an
// offline double: no Pi process and no model call.
const enabled = Boolean(process.env.V3_QA_PLAYWRIGHT && process.env.V3_QA_CHROMIUM && process.env.V3_QA_WEBKIT);
const BRIEF = {
  prompt: "设计一把黑胡桃木明式圈椅，用于书房单人阅读，座宽 58 厘米、座高 45 厘米，扶手轻薄，外露楔钉榫",
  use: "书房单人阅读", size: "座宽 58 厘米，座高 45 厘米", wood: "黑胡桃木", structure: "外露楔钉榫", style: "ming",
  constraints: ["扶手轻薄", "保留圈椅弧线"],
};
const TURNS = [
  { reply: "放在哪个房间、主要做什么用？", ready: false, brief: null },
  { reply: "想用什么木材？座宽大概多少？", ready: false, brief: null },
  { reply: "整理好了，可以填入工作台。", ready: true, brief: BRIEF },
];

function chatRuntime() {
  const turns = new Map();
  return {
    available: true, reason: null, sent: 0,
    async status() { return { available: this.available, reason: this.reason }; },
    async startSession() { return { runtimeSessionRef: `ms-${String(turns.size).padStart(36, "0")}` }; },
    async sendMessage({ runtimeSessionRef }) {
      this.sent += 1;
      const turn = turns.get(runtimeSessionRef) || 0;
      turns.set(runtimeSessionRef, turn + 1);
      await new Promise(resolve => setTimeout(resolve, 400));
      return { text: JSON.stringify(TURNS[Math.min(turn, TURNS.length - 1)]) };
    },
    readResult: parseDesignResult,
    cancel() { return false; },
  };
}

test("design chat fills the composer on desktop Chromium and iPhone WebKit", { skip: !enabled, timeout: 300000 }, async t => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const out = process.env.V3_QA_OUTPUT;
  if (out) fs.mkdirSync(out, { recursive: true });
  for (const [name, locale, width] of [["desktop", "zh-CN", 1440], ["iphone-393", "en-US", 393], ["iphone-375", "zh-CN", 375]]) {
    const runtime = chatRuntime();
    const fixture = await startFixture({ designChatRuntime: runtime });
    const mobile = name !== "desktop";
    const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
    try {
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], viewport: { ...devices["iPhone 15"].viewport, width }, locale } : { viewport: { width: 1440, height: 1000 }, locale });
      await context.route(/^https?:/, route => new URL(route.request().url()).origin === fixture.base ? route.continue() : route.abort("blockedbyclient"));
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const shot = async label => {
        if (!out) return;
        await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
        await page.screenshot({ path: path.join(out, `chat-${name}-${label}.png`) });
      };
      const generations = () => fixture.calls.filter(call => call.url.startsWith("/v1/images")).length;
      const reaches = async (selector, minimum = 40) => {
        const box = await page.locator(selector).evaluate(element => {
          const { left, top, width, height } = element.getBoundingClientRect();
          return { width, height, hit: element.contains(document.elementFromPoint(left + width / 2, top + height / 2)) };
        });
        assert.ok(box.width >= minimum && box.height >= minimum && box.hit, `${selector}: ${JSON.stringify(box)}`);
      };

      // Phones keep the entry in the composer's overflow menu.
      const openChat = async label => {
        const entry = page.locator("#designChatButton");
        await entry.waitFor({ state: "attached" });
        await page.waitForFunction(() => !document.getElementById("designChatButton").hidden);
        // The extra entry must not push Generate out of the composer toolbar.
        await page.waitForFunction(() => {
          const { right } = document.getElementById("generateButton").getBoundingClientRect();
          return right <= document.getElementById("composer").getBoundingClientRect().right;
        });
        await reaches("#generateButton", mobile ? 40 : 36);
        if (await page.locator("#composerMore").isVisible()) await page.locator("#composerMore").click();
        await reaches("#designChatButton", mobile ? 40 : 36);
        if (label) await shot(label);
        await entry.click();
        await page.locator("#designChatModal[open]").waitFor();
      };
      await page.goto(fixture.base + "/studio");
      const registered = await page.evaluate(async () => (await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Chat", email: `chat-${Date.now()}@example.com`, password: "safe-pass-8" }) })).status);
      assert.equal(registered, 201);
      await page.reload();

      await t.test(`${name}: two to three turns end in a brief that fills the composer`, async () => {
        await openChat("entry");
        assert.equal(await page.evaluate(() => document.activeElement.id), "designChatInput");
        for (const [index, text] of ["想要一把圈椅", "书房里一个人看书用", "黑胡桃木，座宽 58 厘米"].entries()) {
          await page.locator("#designChatInput").fill(text);
          await page.locator("#designChatSend").click();
          await page.locator('.design-chat-message[aria-busy="true"]').waitFor();
          await page.locator(".design-chat-message").nth(2 * index + 1).filter({ hasText: TURNS[index].reply }).waitFor();
          if (index === 0) await shot("asking");
        }
        await page.locator("#designChatBrief").waitFor();
        assert.equal(await page.locator("#designChatBriefPrompt").innerText(), BRIEF.prompt);
        assert.equal(await page.locator("#designChatApply").isVisible(), true);
        await reaches("#designChatApply");
        await reaches("#designChatSend");
        await shot("brief");
        await page.locator("#designChatApply").click();
        await page.locator("#designChatModal[open]").waitFor({ state: "detached" });
        await page.waitForFunction(() => document.activeElement?.id === "promptInput");
        assert.equal(await page.locator("#promptInput").inputValue(), BRIEF.prompt);
        assert.equal(await page.locator("#styleSelect").inputValue(), "ming");
        assert.equal(await page.locator("#constraintsInput").inputValue(), "扶手轻薄；保留圈椅弧线");
        assert.equal(await page.evaluate(() => document.activeElement.id), "promptInput");
        assert.equal(generations(), 0, "the chat never generates an image");
        await shot("filled");
      });

      await t.test(`${name}: the conversation survives a reload`, async () => {
        await page.reload();
        await openChat();
        await page.locator("#designChatBrief").waitFor();
        assert.equal(await page.locator(".design-chat-message").count(), 6);
        assert.equal(runtime.sent, 3);
        await page.locator('#designChatModal [data-close-dialog]').click();
      });

      await t.test(`${name}: an unavailable Pi is explained and direct generation still works`, async () => {
        runtime.available = false; runtime.reason = "missing";
        await page.reload();
        await openChat();
        await page.locator("#designChatAlert").waitFor();
        assert.match(await page.locator("#designChatAlertText").innerText(), /Pi/);
        await shot("unavailable");
        await page.locator("#designChatInput").fill("还在吗");
        await page.locator("#designChatSend").click();
        await page.locator("#designChatAlertText").filter({ hasText: /Pi/ }).waitFor();
        assert.equal(runtime.sent, 3, "an unavailable runtime is never called");
        await page.locator("#designChatDirect").click();
        await page.locator("#designChatModal[open]").waitFor({ state: "detached" });
        await page.locator("#promptInput").fill("设计一张宋韵白蜡木茶桌");
        await page.locator("#generateButton").click();
        await page.waitForFunction(() => document.querySelector(".version-card:not([data-pending]) img")?.naturalWidth > 0, null, { timeout: 30000 });
        assert.equal(generations(), 1);
        assert.equal(await page.locator("#designChatButton").evaluate(el => el.hidden), false, "the entry stays available for version-based chat");
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
});

test("a guest chats, fills the composer and generates one image without an account", { skip: !enabled, timeout: 300000 }, async () => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const out = process.env.V3_QA_OUTPUT;
  for (const [name, locale, width] of [["desktop", "zh-CN", 1440], ["iphone-393", "zh-CN", 393], ["iphone-375", "en-US", 375]]) {
    // Two turns: one question, then the brief.
    const runtime = chatRuntime();
    const send = runtime.sendMessage.bind(runtime);
    runtime.sendMessage = async input => { const reply = await send(input); return runtime.sent === 2 ? { text: JSON.stringify(TURNS[2]) } : reply; };
    const fixture = await startFixture({ guestChatRuntime: runtime, guestGeneration: {} });
    const mobile = name !== "desktop";
    const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
    try {
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], viewport: { ...devices["iPhone 15"].viewport, width }, locale } : { viewport: { width, height: 1000 }, locale });
      await context.route(/^https?:/, route => new URL(route.request().url()).origin === fixture.base ? route.continue() : route.abort("blockedbyclient"));
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [], posts = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (request.method() === "POST") posts.push(new URL(request.url()).pathname); });
      const shot = async label => {
        if (!out) return;
        await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
        await page.screenshot({ path: path.join(out, `guest-${name}-${label}.png`) });
      };
      await page.goto(fixture.base + "/studio?guest=1");
      await page.waitForFunction(() => !document.getElementById("designChatButton").hidden);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.locator("#composerMore").isVisible()) await page.locator("#composerMore").click();
      await page.locator("#designChatButton").click();
      await page.locator("#designChatModal[open]").waitFor();
      assert.equal(await page.locator("#designChatNew").isHidden(), true, "a guest keeps one conversation");
      for (const [index, text] of ["想要一把圈椅", "书房，黑胡桃木，座宽 58 厘米"].entries()) {
        await page.locator("#designChatInput").fill(text);
        await page.locator("#designChatSend").click();
        await page.locator(".design-chat-message").nth(2 * index + 1).filter({ hasText: index ? TURNS[2].reply : TURNS[0].reply }).waitFor();
      }
      await page.locator("#designChatBrief").waitFor();
      await shot("brief");
      await page.locator("#designChatApply").click();
      await page.waitForFunction(() => document.activeElement?.id === "promptInput");
      assert.equal(await page.locator("#promptInput").inputValue(), BRIEF.prompt);
      assert.deepEqual(posts.filter(url => url.includes("design-chat")), ["/api/v1/guest/design-chat/messages", "/api/v1/guest/design-chat/messages"]);

      // An unavailable Pi is explained; the rest of the page still answers.
      runtime.available = false; runtime.reason = "gateway";
      await page.reload();
      await page.waitForFunction(() => !document.getElementById("designChatButton").hidden);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.locator("#composerMore").isVisible()) await page.locator("#composerMore").click();
      await page.locator("#designChatButton").click();
      await page.locator("#designChatAlert").waitFor();
      assert.equal(await page.locator(".design-chat-message").count(), 4, "the conversation survives a reload");
      await shot("unavailable");
      await page.locator("#designChatDirect").click();
      await page.locator('#generationMode [data-mode="agent"]').click();
      assert.equal(await page.locator('#generationMode [data-mode="agent"]').getAttribute("aria-pressed"), "true");
      await page.locator('#generationMode [data-mode="normal"]').click();

      // The trial allows one image. The hint says so before the first try.
      const hint = page.locator("#quotaHint");
      await hint.filter({ hasText: locale === "en-US" ? /Trial: 1 image left/ : /试用可生成 1 张，登录后可继续/ }).waitFor();
      const generationPosts = () => posts.filter(url => url === "/api/v1/guest/generation-tasks").length;
      const quota = () => page.evaluate(async () => (await (await fetch("/api/v1/guest/generation-tasks/quota")).json()).quota.generation);
      // An engine failure shows its reason and gives the slot back.
      await page.locator("#promptInput").fill("FAIL_FIXTURE 一把圈椅");
      await page.locator("#generateButton").click();
      await page.locator("[data-pending] .task-failure-reason").filter({ hasText: locale === "en-US" ? /unavailable|connection/i : /生成服务不可用/ }).waitFor({ timeout: 20000 });
      await shot("failed");
      assert.equal((await quota()).remaining, 1);
      // A real run of the pipeline: one image, saved to the guest's own history.
      await page.locator("#promptInput").fill(BRIEF.prompt);
      await page.locator("#generateButton").click();
      await page.waitForFunction(() => document.querySelector(".version-card:not([data-pending]) img")?.naturalWidth > 0, null, { timeout: 30000 });
      assert.equal(generationPosts(), 2);
      assert.equal(fixture.calls.filter(call => call.url.startsWith("/v1/images")).length, 2);
      assert.match(await page.locator(".version-card:not([data-pending]) img").getAttribute("src"), /\/api\/guest\/history\/assets\//);
      await shot("generated");
      // After a refresh the image is still there and the trial is used up.
      await page.reload();
      await page.waitForFunction(() => document.querySelector(".version-card img")?.naturalWidth > 0, null, { timeout: 15000 });
      await hint.filter({ hasText: locale === "en-US" ? /Trial limit of 1 image reached/ : /试用可生成 1 张，已用完；登录后可继续/ }).waitFor();
      assert.equal(await page.locator("#generateButton").isDisabled(), true);
      assert.deepEqual(await quota(), { limit: 1, remaining: 0, resetAt: null, message: "试用可生成 1 张，已用完；登录后可继续" });
      await shot("used-up");
      assert.equal(generationPosts(), 2, "the used-up trial sends nothing more");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
});

test("design chat covers brief editing, selected version context, direct generate, reference reuse, streaming and history", { skip: !enabled, timeout: 240000 }, async t => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const refPng = path.join(__dirname, "../public/assets/brand/musheng-icon-64.png");
  for (const [name, width, height] of [["desktop", 1440, 900], ["iphone-393", 393, 852], ["iphone-320", 320, 568]]) {
    const seen = [];
    let cancelOnNext = false;
    const runtime = {
      available: true, reason: null,
      async status() { return { available: true, reason: null }; },
      async startSession() { return { runtimeSessionRef: `ms-${String(seen.length + 1).padStart(36, "0")}` }; },
      async sendMessage(input) {
        seen.push(input);
        if (cancelOnNext) {
          cancelOnNext = false;
          input.onDelta?.("已流式输出首段");
          await new Promise(resolve => setTimeout(resolve, 150));
          const err = new (require("../src/agent/runtime").AgentRuntimeError)("cancelled");
          err.partialText = "已流式输出首段";
          throw err;
        }
        input.onDelta?.("先看造型，");
        await new Promise(resolve => setTimeout(resolve, 40));
        input.onDelta?.("先看造型，已为你整理好要求。");
        return { text: JSON.stringify({ reply: "先看造型，已为你整理好要求。", ready: true, brief: BRIEF }) };
      },
      readResult: parseDesignResult,
      cancel() { return true; },
    };
    const fixture = await startFixture({ designChatRuntime: runtime, guestChatRuntime: runtime, guestGeneration: {} });
    const mobile = name !== "desktop";
    const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
    try {
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], viewport: { width, height }, locale: "zh-CN" } : { viewport: { width, height }, locale: "zh-CN" });
      await context.route(/^https?:/, route => new URL(route.request().url()).origin === fixture.base ? route.continue() : route.abort("blockedbyclient"));
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const openChat = async () => {
        await page.waitForFunction(() => !document.getElementById("designChatButton").hidden);
        if (await page.locator("#composerMore").isVisible()) await page.locator("#composerMore").click();
        await page.locator("#designChatButton").click();
        await page.locator("#designChatModal[open]").waitFor();
      };

      await page.goto(fixture.base + "/studio");
      const reg = await page.evaluate(async () => (await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Six", email: `six-${Date.now()}@example.com`, password: "safe-pass-8" }) })).status);
      assert.equal(reg, 201);
      await page.reload();

      // 1. Attach reference on workbench composer -> reuse in chat via chip without re-uploading.
      await page.locator("#referenceFile").setInputFiles(refPng);
      await page.locator("#referencePreview:not([hidden])").waitFor();
      await openChat();
      await page.locator("#designChatUseComposerRef").click();
      await page.locator("#designChatRefPreview:not([hidden])").waitFor();
      await page.locator("#designChatInput").fill("用工作台那张做一把圈椅");
      await page.locator("#designChatSend").click();
      await page.locator("#designChatBrief:not([hidden])").waitFor();
      assert.equal(seen[0].attachments?.[0]?.role, "reference");
      await page.locator("#designChatRemoveRef").click();

      // 2. Edit brief in-place (wood + style) -> messages preserved -> direct generate!
      await page.locator("#designChatEditBrief").click();
      await page.locator("#briefEditWood").fill("白蜡木");
      await page.locator("#briefEditStyle").selectOption("song");
      await page.locator("#designChatSaveBrief").click();
      await page.locator("#designChatBriefEditor").waitFor({ state: "hidden" });
      assert.match(await page.locator("#designChatBriefFields").innerText(), /白蜡木/);
      assert.match(await page.locator("#designChatBriefFields").innerText(), /宋韵/);
      assert.equal(await page.locator(".design-chat-message").count(), 2);
      await page.locator("#designChatGenerate").click();
      await page.locator("#designChatModal[open]").waitFor({ state: "detached" });
      await page.waitForFunction(() => document.querySelector(".version-card:not([data-pending]) img")?.naturalWidth > 0, null, { timeout: 25000 });
      assert.equal(await page.locator("#styleSelect").inputValue(), "song");
      if (await page.locator("#removeReference").isVisible()) await page.locator("#removeReference").click();

      // 3. Chat based on selected version v1 + streaming interrupted preserves partial text!
      await openChat();
      assert.match(await page.locator("#designChatContext").innerText(), /v1/);
      await page.locator("#designChatNew").click();
      await page.locator("#designChatInput").fill("基于 v1 把扶手做细");
      await page.locator("#designChatSend").click();
      await page.locator("#designChatBrief:not([hidden])").waitFor();
      assert.equal(seen.at(-1).attachments?.some(item => item.role === "parent"), true);
      cancelOnNext = true;
      await page.locator("#designChatInput").fill("再细化腿部");
      await page.locator("#designChatSend").click();
      await page.locator('.design-chat-message[data-status="incomplete"]').waitFor();
      assert.match(await page.locator('.design-chat-message[data-status="incomplete"]').innerText(), /已流式输出首段/);
      assert.match(await page.locator('.design-chat-message[data-status="incomplete"]').innerText(), /未完成/);

      // 4. History list shows both conversations, switches back and deletes without affecting canvas/history!
      await page.locator("#designChatHistoryBtn").click();
      await page.locator("#designChatHistory:not([hidden])").waitFor();
      assert.equal(await page.locator("#designChatHistoryList .design-chat-history__item").count(), 2);
      await page.locator("#designChatHistoryList [data-chat-delete]").first().click();
      await page.waitForFunction(() => document.querySelectorAll("#designChatHistoryList .design-chat-history__item").length === 1);
      assert.equal(await page.locator(".version-card:not([data-pending])").count(), 1, "deleting chat keeps generation history");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
});
