const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startFixture } = require("./support/studio-server.fixture");

// Opt in with existing Playwright/browser installations; no dependency install,
// real model calls, desktop windows, user accounts or production configuration.
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 8000); })]); }
  finally { clearTimeout(timer); }
}
const enabled = Boolean(process.env.V3_QA_PLAYWRIGHT && process.env.V3_QA_CHROMIUM && process.env.V3_QA_WEBKIT);
test("v3 headless Chromium and iPhone WebKit regression journeys", { skip: !enabled, timeout: 240000 }, async t => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const fixture = await startFixture({ controlled: true });
  const out = process.env.V3_QA_OUTPUT;
  if (out) fs.mkdirSync(out, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const name = mobile ? "iphone" : "desktop";
      const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], acceptDownloads: true } : { viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      await context.route(/^https?:/, route => {
        if (new URL(route.request().url()).origin !== fixture.base) return route.abort("blockedbyclient");
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [], posts = [];
      const generationCount = () => fixture.calls.filter(call => call.url === "/v1/images/generations").length;
      const generationsBefore = generationCount();
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        if (request.url().endsWith("/generation-tasks") && request.method() === "POST") posts.push(request.postDataJSON());
      });
      const shot = async label => { if (out) await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: true }); };
      const goto = async url => { await page.goto(fixture.base + url); };
      // A loaded parent and busy=false also occur BEFORE workspace recovery.
      // Bind completion to the accepted task and its actual history record.
      const ready = () => page.waitForFunction(() => document.querySelector(".version-card.selected img")?.naturalWidth > 0);
      const taskUrl = id => `${fixture.base}/api/v1/generation-tasks${id ? `/${id}` : ""}`;
      const responseFor = (url, method) => page.waitForResponse(response => response.url() === url && response.request().method() === method);
      const beginTask = async (button = "#generateButton") => {
        const gate = fixture.holdGeneration();
        const accepted = responseFor(taskUrl(), "POST");
        await page.locator(button).click();
        const response = await accepted;
        assert.equal(response.status(), 202, await response.text());
        const { task } = await response.json();
        // The provider cannot finish before the test explicitly releases it.
        await bounded(gate.entered, "fixture image request");
        await page.waitForFunction(id => {
          const stored = Object.keys(localStorage).filter(key => key.startsWith("musheng-v3-task:"));
          return stored.some(key => JSON.parse(localStorage.getItem(key))?.id === id)
            && document.querySelector("[data-pending]")
            && document.querySelector("#generateButton").dataset.busy === "true"
            && !document.querySelector("#generateButton").disabled;
        }, task.id);
        return { task, gate };
      };
      const watchCompletion = task => page.waitForResponse(async response => {
        if (response.url() !== taskUrl(task.id) || response.request().method() !== "GET" || !response.ok()) return false;
        const body = await response.json();
        return !["queued", "running"].includes(body.task?.status);
      });
      const renderedResult = async (response, cards) => {
        const { task } = await response.json();
        assert.equal(task.status, "completed", task.message);
        const id = task.result.historyRecord.id;
        await page.waitForFunction(({ id, cards }) => {
          const selected = document.querySelector(".version-card.selected");
          return selected?.dataset.key.startsWith(`${id}:`) && selected.querySelector("img")?.naturalWidth > 0
            && document.querySelectorAll(".version-card[data-key]").length === cards
            && document.querySelector("#generateButton").dataset.busy === "false";
        }, { id, cards });
        return task;
      };
      const completeTask = async ({ task, gate }, cards) => {
        const completed = watchCompletion(task);
        gate.release();
        return renderedResult(await completed, cards);
      };
      const recoveredRunning = () => page.waitForFunction(() => document.querySelector("[data-pending]")
        && document.querySelector("#generateButton").dataset.busy === "true");
      // Hold exactly the lookup that follows history, not a timer of guessed duration.
      const holdLookup = async () => {
        const entered = deferred(), release = deferred();
        let held = false;
        const handler = async route => {
          if (route.request().method() === "GET" && !held) { held = true; entered.resolve(); await release.promise; }
          await route.continue();
        };
        await page.route(taskUrl(), handler);
        return { entered: entered.promise, release: release.resolve, dispose: async () => { release.resolve(); await page.unroute(taskUrl(), handler); } };
      };
      let failed = false;
      const step = (title, action) => t.test(title, { skip: failed ? "Earlier journey step failed" : false }, async () => {
        try { await action(); }
        catch (error) {
          failed = true;
          if (out) {
            const state = await page.evaluate(() => ({ url: location.pathname, busy: document.querySelector("#generateButton")?.dataset.busy,
              cards: [...document.querySelectorAll(".version-card[data-key]")].map(card => card.dataset.key),
              pending: document.querySelector("[data-pending]")?.dataset.status, toast: document.querySelector("#toast")?.textContent })).catch(() => ({}));
            fs.writeFileSync(path.join(out, `${name}-failure.json`), JSON.stringify({ title, message: error.message, state }, null, 2));
          }
          throw error;
        }
      });
      const picker = id => page.locator(`#${id}`).locator("..").locator(".yui-picker__trigger");
      try {
        await step(`${name}: homepage phrases, four demo scenes, locale, theme and touch fallback`, async () => {
          await goto("/");
          await page.locator("[data-seed]").first().click();
          assert.equal(await page.locator("#homePrompt").inputValue(), "一张留白的茶桌，胡桃木");
          if (mobile) {
            // Touch keeps the drifting field (no hover lens); the still render stays underneath.
            await page.waitForSelector(".hero__art.is-live canvas.is-active");
          } else {
            await page.waitForSelector(".hero__art.is-live canvas.is-active");
            await page.mouse.move(1000, 340);
          }
          await page.locator("#demoSteps").scrollIntoViewIfNeeded();
          await page.mouse.move(0, 0);
          await page.waitForFunction(() => document.querySelector("#demoStage").dataset.scene === "modify", null, { timeout: 14000 });
          for (let i = 0; i < 4; i++) {
            await page.locator(`[data-demo-step="${i}"]`).click();
            assert.equal(await page.locator(`[data-demo-step="${i}"]`).getAttribute("aria-pressed"), "true");
          }
          await page.locator("#end-title").scrollIntoViewIfNeeded();
          await page.locator("[data-locale-toggle]").click();
          await page.waitForFunction(() => document.querySelector('[data-demo-step="3"]').textContent.includes("導出"));
          assert.match(await page.locator("[data-seed]").nth(1).innerText(), /單椅/);
          await page.locator("[data-theme-toggle]").click();
          assert.equal(await page.locator("html").getAttribute("data-theme"), "night");
          await page.locator("#hero-title").scrollIntoViewIfNeeded(); await shot("home-night-fixed");
          await page.locator("#heroPrompt button").click();
          await page.waitForURL(url => url.pathname === "/studio" && !url.searchParams.has("prompt"));
          assert.equal(await page.locator("#promptInput").inputValue(), "一张留白的茶桌，胡桃木");
        });
        const email = `${name}-${Date.now()}@example.invalid`, password = "Fixture-Password-123";
        await step(`${name}: real HTTP auth, next redirect, errors, password visibility, night contrast`, async () => {
          await goto("/login.html?next=" + encodeURIComponent("/studio?prompt=测试输入"));
          await page.waitForFunction(() => window.mushengLogin && document.querySelector("#authTitle").textContent === "登入");
          const contrast = await page.evaluate(() => {
            // Night inverts the art; the title zone fades glyphs to paper, so test against inverted paper #F5F5F5.
            const filter = getComputedStyle(document.querySelector(".login-visual__art")).filter;
            const invert = Number(filter.match(/invert\(([\d.]+)\)/)?.[1] || 0);
            const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            const bg = luminance([245, 245, 245].map(c => c * (1 - invert) + (255 - c) * invert));
            return [".login-brand", ".login-visual__title", ".login-visual__title span:last-child"].map(selector => {
              const fg = luminance(getComputedStyle(document.querySelector(selector)).color.match(/[\d.]+/g).slice(0, 3).map(Number));
              return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05);
            });
          });
          assert.ok(contrast.every(ratio => ratio >= 4.5), "night hero copy meets AA against its brightest background");
          await shot("login-night-fixed");
          await page.locator("#email").fill(email); await page.locator("#password").fill(password);
          await page.locator("#authSubmit").click();
          await page.waitForFunction(() => document.querySelector("#email").getAttribute("aria-invalid") === "true");
          await page.locator("#authModeToggle").click();
          await page.locator("#displayName").fill("测试用户");
          await page.locator("#passwordToggle").click(); assert.equal(await page.locator("#password").getAttribute("type"), "text");
          await page.locator("#passwordToggle").click();
          await page.locator("#authSubmit").click(); await page.waitForURL(url => url.pathname === "/studio" && !url.searchParams.has("prompt"));
          await page.waitForFunction(() => document.querySelector("#userProfileButton").textContent === "测试用户");
          assert.equal(await page.locator("#promptInput").inputValue(), "测试输入");
        });
        await step(`${name}: every settings picker, range, nested Escape and opener focus`, async () => {
          await picker("styleSelect").click(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
          assert.equal(await page.locator("#styleSelect").inputValue(), "zen");
          await picker("styleSelect").click(); await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => document.activeElement.id), "settingsButton");
          await picker("styleSelect").click(); await page.keyboard.press("Shift+Tab");
          assert.equal(await page.evaluate(() => document.activeElement.dataset.mode), "agent");
          await page.locator("#settingsButton").click();
          await page.waitForFunction(() => document.querySelector("#settingsTitle").textContent === "生成設定");
          for (const id of ["taskEngineSelect", "qualitySelect", "sizeSelect", "targetScore", "maxAgentRounds"]) {
            await picker(id).click(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
            await picker(id).click(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("Escape");
            assert.equal(await page.locator("#settingsModal").evaluate(d => d.open), true);
            assert.equal(await picker(id).evaluate(b => document.activeElement === b), true);
          }
          await picker("maxAgentRounds").click(); await page.keyboard.press("Home"); await page.keyboard.press("Enter");
          await page.locator("#moodRange").focus(); const mood = await page.locator("#moodRange").inputValue();
          await page.keyboard.press("ArrowRight"); assert.equal(Number(await page.locator("#moodRange").inputValue()), Number(mood) + 1);
          if (mobile) {
            await page.locator(".mobile-workspace-actions [data-theme-toggle]").click();
            assert.equal(await page.locator("html").getAttribute("data-theme"), "day");
            await page.locator(".mobile-workspace-actions [data-locale-toggle]").click();
          }
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "settingsButton");
          if (!mobile) await page.locator(".studio-bar [data-locale-toggle]").click();
          await page.locator("#historyNavButton").click(); await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "historyNavButton");
        });
        await step(`${name}: single result, refresh, parentId, memory, agent review and suggestions`, async () => {
          await page.locator("#promptInput").fill("黑胡桃木圈椅，保留靠背弧线");
          const first = await beginTask();
          await page.reload(); await recoveredRunning();
          await completeTask(first, 1);
          assert.equal(posts.length, 1, "reload never creates another task");
          assert.equal(await page.locator("#totalScore").innerText(), "—");
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator("#memoryOptions input").first().focus(); await page.keyboard.press("Space");
          assert.equal(await page.locator("#memoryOptions input").first().isChecked(), true);
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator('[data-mode="agent"]').click(); await page.locator("#promptInput").fill("扶手再薄一点");
          await page.locator("#maxAgentRounds").evaluate(select => { select.value = "1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
          const second = await beginTask();
          const terminal = await completeTask(second, 2);
          assert.equal(terminal.result.historyRecord.rounds.length, 1);
          assert.equal(posts.length, 2); assert.ok(posts[1].parentId); assert.match(posts[1].originalPrompt, /必须保留/);
          assert.equal(await page.locator(".version-card[data-key]").count(), 2);
          assert.ok(await page.locator("#versionEdges path").count());
          assert.equal(await page.locator("#totalScore").innerText(), "78");
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator("#suggestions button").first().click(); assert.match(await page.locator("#promptInput").inputValue(), /收细椅腿/);
          await shot("agent-stop");
        });
        await step(`${name}: region, comparison modes, keyboard slider, PNG, history and locale roundtrip`, async () => {
          await page.locator('[data-mode="normal"]').click();
          await page.locator('.version-card.selected [data-action="region"]').click();
          const r = await page.locator(".version-card.selected .card-media").boundingBox();
          await page.mouse.move(r.x + r.width * .2, r.y + r.height * .2); await page.mouse.down();
          await page.mouse.move(r.x + r.width * .7, r.y + r.height * .6, { steps: 8 }); await page.mouse.up();
          await page.waitForFunction(() => document.querySelector("#regionModal").open);
          await shot("region"); await page.locator("#regionInput").fill("左侧扶手变薄");
          const regionTask = await beginTask('#regionForm button[type="submit"]');
          await completeTask(regionTask, 3); assert.equal(posts.length, 3); assert.ok(posts[2].parentId); assert.match(posts[2].originalPrompt, /区域/);
          await page.locator('.version-card.selected [data-action="compare"]').click();
          await page.locator(".version-card[data-key]").first().focus(); await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.querySelector("#compareModal").open);
          for (const mode of ["slider", "overlay", "side"]) {
            await page.locator(`[data-compare-mode="${mode}"]`).click();
            assert.equal(await page.locator("#compareStage").getAttribute("data-mode"), mode);
            if (mode !== "side") { await page.locator("#compareRange").focus(); await page.keyboard.press("ArrowRight"); }
            await shot(`compare-${mode}`);
          }
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.matches(".version-card[data-key]"));
          const download = page.waitForEvent("download"); await page.locator("#exportButton").click();
          const file = await download; const bytes = fs.readFileSync(await file.path());
          assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.equal(bytes.readUInt32BE(16), 1600); assert.equal(bytes.readUInt32BE(20), 1400);
          if (out) await file.saveAs(path.join(out, `${name}-fixture-export.png`));
          await page.locator("#historyNavButton").click(); await page.locator("#historyFilterInput").fill("没有匹配的文字");
          assert.equal(await page.locator("#historyGrid article").count(), 0); await page.locator("#historyFilterInput").fill("");
          await page.locator('[data-history-action="open"]').first().click(); await ready();
          await page.locator("#promptInput").fill("用户的设计描述不要转换");
          if (mobile) await page.locator("#settingsButton").click();
          const toggle = page.locator(mobile ? ".mobile-workspace-actions [data-locale-toggle]" : ".studio-bar [data-locale-toggle]");
          await toggle.click();
          await page.waitForFunction(mobile => mobile
            ? document.querySelector("#settingsTitle").textContent === "生成設定"
            : document.querySelector('.version-card.selected [data-action="download"]').textContent === "下載", mobile);
          if (mobile) { assert.match(await page.locator("#settingsTitle").innerText(), /設定/); } else { assert.match(await page.locator('.version-card.selected [data-action="download"]').innerText(), /下載/); }
          assert.equal(await page.locator("#promptInput").inputValue(), "用户的设计描述不要转换");
          assert.equal(await page.locator("#userProfileButton").innerText(), "测试用户");
          await toggle.click(); if (mobile) await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.querySelector('.version-card.selected [data-action="download"]').textContent === "下载");
          await shot("studio-fixed");
        });
        await step(`${name}: delayed recovery cannot mistake a loaded parent for the new task result`, async () => {
          await page.locator("#promptInput").fill("恢复完成后再显示新版本");
          const next = await beginTask();
          const lookup = await holdLookup();
          try {
            await page.reload(); await bounded(lookup.entered, "active task lookup"); await ready();
            const before = await page.evaluate(() => ({ cards: document.querySelectorAll(".version-card[data-key]").length,
              busy: document.querySelector("#generateButton").dataset.busy }));
            t.diagnostic(`${name} before recovery: ${JSON.stringify(before)} (not a completion condition)`);
            assert.equal(before.cards, 3, "only the parent family is loaded while the new image is held");
            lookup.release(); await recoveredRunning();
            await completeTask(next, 4);
          } finally { next.gate.release(); await lookup.dispose(); }
        });
        let completedDuringRecovery;
        await step(`${name}: completion between history and task lookup reloads the canonical history`, async () => {
          await page.locator("#promptInput").fill("在历史快照之后完成的新版本");
          const next = await beginTask();
          const lookup = await holdLookup();
          try {
            await page.reload(); await bounded(lookup.entered, "active task lookup"); await ready();
            assert.equal(await page.locator(".version-card[data-key]").count(), 4);
            next.gate.release();
            // Read the real fixture state. This is a condition poll, not a delay
            // guessed from provider speed; the workspace lookup is still held.
            await page.waitForFunction(async id => (await (await fetch(`/api/v1/generation-tasks/${id}`)).json()).task.status === "completed", next.task.id, { polling: 100 });
            const completed = watchCompletion(next.task);
            lookup.release();
            completedDuringRecovery = await renderedResult(await completed, 5);
            assert.equal(completedDuringRecovery.result.historyRecord.parentId, next.task.request.parentId);
            t.diagnostic(`${name} late completion: server completed, rendered 5 cards including the accepted task's record`);
          } finally { next.gate.release(); await lookup.dispose(); }
        });
        await step(`${name}: refreshing a deleted terminal record does not resurrect it`, async () => {
          const id = completedDuringRecovery.result.historyRecord.id;
          const deleted = await context.request.delete(`${fixture.base}/api/v1/history/${id}`);
          assert.equal(deleted.status(), 200);
          await page.reload();
          await page.waitForFunction(({ id, taskId }) => {
            const saved = Object.keys(localStorage).filter(key => key.startsWith("musheng-v3-task:"));
            return !saved.some(key => JSON.parse(localStorage.getItem(key))?.id === taskId)
              && ![...document.querySelectorAll(".version-card[data-key]")].some(card => card.dataset.key.startsWith(`${id}:`))
              && document.querySelectorAll(".version-card[data-key]").length === 4;
          }, { id, taskId: completedDuringRecovery.id });
          assert.equal((await (await context.request.get(`${fixture.base}/api/v1/history`)).json()).records.length, 4);
        });
        await step(`${name}: normal cancellation survives refresh and the next generation succeeds`, async () => {
          await page.locator('[data-mode="normal"]').click();
          await page.locator("#promptInput").fill("取消这次单次生成");
          const running = await beginTask();
          const stopped = responseFor(`${taskUrl(running.task.id)}/stop`, "POST");
          await page.locator("#generateButton").click();
          assert.equal((await (await stopped).json()).task.stopRequested, true);
          await page.waitForFunction(() => document.querySelector('[data-pending]')?.dataset.status === "cancelled");
          assert.match(await page.locator('[data-pending] .card-phase').innerText(), /已取消/);
          running.gate.release();
          await page.reload();
          await page.waitForFunction(() => document.querySelector('[data-pending]')?.dataset.status === "cancelled"
            && document.querySelector('#generateButton').dataset.busy === "false");
          const next = await beginTask();
          await completeTask(next, 5);
        });
        await step(`${name}: new homepage brief wins over terminal task; mobile new work and active recovery`, async () => {
          const historyLoaded = responseFor(`${fixture.base}/api/v1/history`, "GET");
          const tasksLoaded = responseFor(taskUrl(), "GET");
          await goto("/studio?prompt=" + encodeURIComponent("新的茶桌描述"));
          await Promise.all([historyLoaded, tasksLoaded]);
          await page.waitForFunction(() => !document.querySelector("#emptyState").hidden
            && !Object.keys(localStorage).some(key => key.startsWith("musheng-v3-task:") && !key.includes(":demo-")));
          assert.equal(await page.locator("#promptInput").inputValue(), "新的茶桌描述");
          assert.equal(new URL(page.url()).searchParams.has("prompt"), false, "home brief is consumed once, not replayed on reload");
          assert.match(await page.locator("#generateButton").innerText(), /生成/);
          assert.equal(await page.locator("#memoryOptions input:checked").count(), 0);
          if (mobile) {
            await page.locator("#settingsButton").click(); await page.locator("#mobileNewWorkButton").click();
            assert.equal(await page.locator("#promptInput").inputValue(), "");
          }
          // Demo isolates the active-task precedence without spending model quota.
          await goto("/studio?demo=generating&prompt=新输入");
          await page.waitForFunction(() => document.querySelector("#generateButton").dataset.busy === "true");
          assert.notEqual(await page.locator("#promptInput").inputValue(), "新输入");
        });
        await step(`${name}: long profile name preserves navigation and admin pickers remain keyboard accessible`, async () => {
          const historyLoaded = responseFor(`${fixture.base}/api/v1/history`, "GET");
          const tasksLoaded = responseFor(taskUrl(), "GET");
          await goto("/studio"); await Promise.all([historyLoaded, tasksLoaded]); await ready();
          const me = await (await context.request.get(fixture.base + "/api/v1/auth/me")).json();
          fixture.userStore.adminUserIds.add(me.user.id); // isolated fixture only
          await page.reload(); await ready();
          await page.locator("#userProfileButton").click();
          await page.locator('#profileAccountView [name="displayName"]').fill("很长的中文用户名".repeat(5));
          await page.locator('#profileAccountView button[type="submit"]').click();
          await page.waitForFunction(() => document.querySelector("#profileMessage").textContent.includes("已保存"));
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "userProfileButton");
          const visible = await page.locator("#exportButton").evaluate(button => {
            const r = button.getBoundingClientRect();
            return r.right <= innerWidth && r.left >= 0 && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          });
          assert.equal(visible, true, "long names must not push export out of the viewport");
          await page.locator("#modelConfigButton").click(); await page.waitForSelector('#modelFields input');
          for (const select of await page.locator("#configModal select").all()) {
            const trigger = select.locator("..").locator("button");
            await trigger.click(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
            await trigger.click(); await page.keyboard.press("Escape");
            assert.equal(await page.locator("#configModal").evaluate(d => d.open), true);
          }
          await shot("admin-night"); await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "modelConfigButton");
        });
        await step(`${name}: reduced motion stays still and still allows demo scene selection`, async () => {
          await page.emulateMedia({ reducedMotion: "reduce" }); await goto("/");
          await page.locator("#demoSteps").scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          assert.equal(await page.locator(".hero__art canvas").count(), 0);
          const scene = await page.locator("#demoStage").getAttribute("data-scene");
          await page.waitForTimeout(400); assert.equal(await page.locator("#demoStage").getAttribute("data-scene"), scene);
          await page.locator('[data-demo-step="3"]').click();
          await page.waitForFunction(() => document.querySelector("#demoSheet").classList.contains("is-on"));
          await page.emulateMedia({ reducedMotion: "no-preference" });
        });
        await step(`${name}: logout clears private UI, login and safe next`, async () => {
          const historyLoaded = responseFor(`${fixture.base}/api/v1/history`, "GET");
          const tasksLoaded = responseFor(taskUrl(), "GET");
          await goto("/studio"); await Promise.all([historyLoaded, tasksLoaded]); await ready();
          await page.locator("#userProfileButton").click(); await page.locator("#profileLogoutButton").click();
          await page.waitForFunction(() => document.querySelector("#userProfileButton").textContent === "登录");
          assert.equal(await page.locator(".version-card[data-key]").count(), 0);
          await goto("/login.html?next=https://example.invalid/elsewhere");
          await page.waitForFunction(() => window.mushengLogin?.nextPath === "/studio");
          await page.locator("#email").fill(email); await page.locator("#password").fill(password); await page.locator("#authSubmit").click();
          await page.waitForURL("**/studio"); await ready();
          assert.deepEqual(errors, []);
          assert.equal(posts.length, 7, "refresh/recovery must not submit another task");
          assert.equal(generationCount() - generationsBefore, 7, "only accepted tasks issue provider generation calls");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        });
      } finally { await browser.close(); }
      if (failed) break;
    }
  } finally { await fixture.close(); }
});
