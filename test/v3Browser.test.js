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
// CI sets V3_QA_REQUIRED so a missing browser setup fails the build instead of silently skipping the journeys.
test("browser journeys are configured when required", { skip: !process.env.V3_QA_REQUIRED }, () => {
  assert.ok(enabled, "V3_QA_REQUIRED is set but V3_QA_PLAYWRIGHT, V3_QA_CHROMIUM or V3_QA_WEBKIT is missing");
});
test("v3 headless Chromium and iPhone WebKit regression journeys", { skip: !enabled, timeout: 240000 }, async t => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const fixture = await startFixture({ controlled: true });
  const out = process.env.V3_QA_OUTPUT;
  if (out) fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [1440, 393, 375]) {
      const mobile = width !== 1440;
      const name = mobile ? `iphone-${width}` : "desktop";
      const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
      // English locale, as on the CI runner, so time and number formatting cannot depend on the host.
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], viewport: { ...devices["iPhone 15"].viewport, width }, acceptDownloads: true, locale: "en-US" } : { viewport: { width: 1440, height: 1000 }, acceptDownloads: true, locale: "en-US" });
      await context.route(/^https?:/, route => {
        if (new URL(route.request().url()).origin !== fixture.base) return route.abort("blockedbyclient");
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [], posts = [];
      const generationCount = () => fixture.calls.filter(call => ["/v1/images/generations", "/v1/images/edits"].includes(call.url)).length;
      const generationsBefore = generationCount();
      // WebKit reports a same-origin fetch cancelled by navigation as an "access control" page error.
      // Same-origin requests cannot fail a real access-control check, so only that case is ignored.
      const cancelledByNavigation = message => message.includes(new URL(fixture.base).host + "/api/") && /due to access control checks\.?$/.test(message);
      page.on("pageerror", error => { if (!cancelledByNavigation(error.message)) errors.push(error.message); });
      page.on("request", request => {
        if (request.url().endsWith("/generation-tasks") && request.method() === "POST") posts.push(request.postDataJSON());
      });
      const shot = async label => { if (out) await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: true }); };
      const hitTarget = async (locator, minimum = 44) => {
        const hits = await locator.evaluate(async button => {
          const opening = button.closest("dialog")?.getAnimations() || [];
          await Promise.all(opening.map(animation => animation.finished));
          const { width, height, left, top } = button.getBoundingClientRect();
          return { left, top, width, height, hits: [[width / 2, height / 2], [2, height / 2], [width - 2, height / 2],
            [width / 2, 2], [width / 2, height - 2]].map(([x, y]) => button.contains(document.elementFromPoint(left + x, top + y))) };
        });
        assert.ok(hits.width >= minimum && hits.height >= minimum && hits.hits.every(Boolean), `target ${locator}: ${JSON.stringify(hits)}`);
      };
      const goto = async url => { await page.goto(fixture.base + url); };
      const cardAction = (action, card = ".version-card.selected") =>
        `${card} [data-action="${action}"]:visible, #compactActions [data-action="${action}"]:visible`;
      // A loaded parent and busy=false also occur BEFORE workspace recovery.
      // Bind completion to the accepted task and its actual history record.
      const ready = () => page.waitForFunction(() => document.querySelector(".version-card.selected img")?.naturalWidth > 0);
      const taskUrl = id => `${fixture.base}/api/v1/generation-tasks${id ? `/${id}` : ""}`;
      const responseFor = (url, method) => page.waitForResponse(response => response.url() === url && response.request().method() === method);
      const beginTask = async (button = "#generateButton", key) => {
        const gate = fixture.holdGeneration();
        const accepted = responseFor(taskUrl(), "POST");
        if (key) await page.locator(button).press(key);
        else await page.locator(button).click();
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
              pending: document.querySelector("[data-pending]")?.dataset.status, toast: document.querySelector("#toast")?.textContent,
              layout: Object.fromEntries([".studio-bar", "#composer", "#reviewPanel", ".version-card.selected", ".version-card.selected .card-actions"]
                .map(selector => [selector, document.querySelector(selector)?.getBoundingClientRect().toJSON()])),
              scale: document.querySelector("#zoomReset")?.textContent })).catch(() => ({}));
            fs.writeFileSync(path.join(out, `${name}-failure.json`), JSON.stringify({ title, message: error.message, state }, null, 2));
          }
          throw error;
        }
      });
      const picker = id => page.locator(`#${id}`).locator("..").locator(".yui-picker__trigger");
      const assertTargets = async selector => {
        const targets = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
          const { width, height } = node.getBoundingClientRect();
          return { width, height, label: node.textContent.trim() || node.id };
        }));
        assert.ok(targets.length);
        for (const { width, height, label } of targets) assert.ok(width >= 44 && height >= 44, `${label}: ${width} × ${height}`);
      };
      try {
        if (!mobile) {
          await step("desktop: featured work reveals on hover and keyboard focus without JavaScript", async () => {
            const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
            try {
              const staticPage = await staticContext.newPage();
              await staticPage.goto(fixture.base);
              const draft = staticPage.locator(".work[data-featured] .work__media").first();
              const photo = draft.locator(".work__photo");
              assert.equal(await photo.count(), 1);
              const waitForClip = async expected => {
                // Page-side polling timers are unavailable here because JavaScript is disabled.
                let clip;
                for (let attempt = 0; attempt < 40; attempt += 1) {
                  clip = await photo.evaluate(node => getComputedStyle(node).clipPath);
                  if (clip.startsWith(expected)) return;
                  await staticPage.waitForTimeout(50);
                }
                assert.fail(`Expected ${expected}, got ${clip}`);
              };
              await draft.hover();
              await waitForClip("inset(0px)");
              assert.ok(await photo.evaluate(node => node.naturalWidth > 0));
              await staticPage.mouse.move(0, 0);
              await waitForClip("inset(100%");
              await staticPage.keyboard.press("Tab");
              await staticPage.locator(".work[data-featured]").focus();
              await waitForClip("inset(0px)");
            } finally {
              await staticContext.close();
            }
          });
        }
        await step(`${name}: homepage phrases, four demo scenes, locale, theme and touch fallback`, async () => {
          await goto("/");
          await page.locator(".work__toggle:visible").first().waitFor();
          await assertTargets(".home-demo-link a, .work__toggle:visible");
          if (mobile) {
            for (const selector of [".home-head [data-locale-set]", ".hero__seeds [data-seed]"]) {
              for (const button of await page.locator(selector).all()) {
                await button.scrollIntoViewIfNeeded(); await hitTarget(button);
              }
            }
          }
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
            const button = page.locator(`[data-demo-step="${i}"]`);
            if (mobile) await hitTarget(button);
            await button.click();
            assert.equal(await button.getAttribute("aria-pressed"), "true");
          }
          const featured = page.locator(".work[data-featured]");
          assert.equal(await featured.locator(".work__media").count(), 2);
          assert.equal(await featured.locator(".work__photo").getAttribute("src"), await featured.locator(".work__reference").getAttribute("src"));
          if (mobile) {
            const draft = featured.locator(".work__media").first();
            await draft.scrollIntoViewIfNeeded();
            await draft.dispatchEvent("pointerdown", { pointerType: "touch" });
            await page.waitForFunction(() => getComputedStyle(document.querySelector(".work[data-featured] .work__photo")).clipPath === "inset(0px)");
            await draft.dispatchEvent("pointerup", { pointerType: "touch" });
            await page.waitForFunction(() => getComputedStyle(document.querySelector(".work[data-featured] .work__photo")).clipPath.startsWith("inset(100%"));
          }
          const toggle = page.locator('.work__toggle[aria-controls="work-table"]');
          await toggle.click();
          assert.equal(await toggle.locator("span").nth(0).isVisible(), false);
          assert.equal(await toggle.locator("span").nth(1).isVisible(), true);
          await page.waitForFunction(() => getComputedStyle(document.querySelector("#work-table .work__photo")).clipPath === "inset(0px)");
          await toggle.press("Enter");
          await page.waitForFunction(() => getComputedStyle(document.querySelector("#work-table .work__photo")).clipPath.startsWith("inset(100%"));
          assert.equal(await toggle.locator("span").nth(0).isVisible(), true);
          await page.locator("#end-title").scrollIntoViewIfNeeded();
          await page.locator('.home-head [data-locale-set="tw"]').click();
          assert.equal(await page.locator('.home-head [data-locale-set="tw"]').getAttribute("aria-pressed"), "true");
          await page.waitForFunction(() => document.querySelector('[data-demo-step="3"]').textContent.includes("導出"));
          assert.match(await page.locator("[data-seed]").nth(1).innerText(), /單椅/);
          // The dock only shows once the hero has scrolled away; the language switch lives in the top bar.
          await page.locator("#end-title").scrollIntoViewIfNeeded(); await page.waitForSelector(".dock.is-shown");
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
          await assertTargets(".login-form-shell button:visible, .login-form-shell input:visible");
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
          await assertTargets(".login-form-shell button:visible, .login-form-shell input:visible");
          await page.locator("#displayName").fill("测试用户");
          if (mobile) { await hitTarget(page.locator("#passwordToggle")); await page.locator("#authModeToggle").scrollIntoViewIfNeeded(); await hitTarget(page.locator("#authModeToggle")); }
          await page.locator("#passwordToggle").click(); assert.equal(await page.locator("#password").getAttribute("type"), "text");
          await page.locator("#passwordToggle").click();
          await page.locator("#authSubmit").click(); await page.waitForURL(url => url.pathname === "/studio" && !url.searchParams.has("prompt"));
          await page.waitForFunction(() => document.querySelector("#userProfileButton").textContent === "测试用户");
          assert.equal(await page.locator("#promptInput").inputValue(), "测试输入");
        });
        await step(`${name}: every settings picker, range, nested Escape and opener focus`, async () => {
          const openPicker = async id => {
            const native = page.locator(`#${id}`);
            const trigger = picker(id);
            const list = native.locator("..").getByRole("listbox", { includeHidden: true });
            assert.equal(await native.getAttribute("aria-hidden"), "true");
            assert.deepEqual(await native.evaluate(select => {
              const css = getComputedStyle(select);
              return [select.tabIndex, css.opacity, css.pointerEvents];
            }), [-1, "0", "none"]);
            await hitTarget(trigger);
            await trigger.press("Enter");
            assert.equal(await trigger.getAttribute("aria-expanded"), "true");
            await list.evaluate(list => Promise.all(list.getAnimations().map(animation => animation.finished)));
            assert.equal(await trigger.evaluate(button => getComputedStyle(button).backgroundColor),
              await list.evaluate(list => getComputedStyle(list).backgroundColor));
            for (const option of await list.getByRole("option").all()) {
              await option.scrollIntoViewIfNeeded();
              await hitTarget(option);
            }
          };
          assert.equal(await page.locator("#styleSelect").inputValue(), "newChinese");
          await openPicker("styleSelect");
          await page.keyboard.press("End"); await page.keyboard.press("Enter");
          assert.equal(await page.locator("#styleSelect").inputValue(), "zen");
          await picker("styleSelect").click(); await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => document.activeElement.id), "settingsButton");
          await picker("styleSelect").click(); await page.keyboard.press("Shift+Tab");
          assert.equal(await page.evaluate(() => document.activeElement.dataset.mode), "agent");
          await page.locator("#settingsButton").click();
          await page.waitForFunction(() => document.querySelector("#settingsTitle").textContent === "生成設定");
          for (const id of ["taskEngineSelect", "qualitySelect", "sizeSelect", "targetScore", "maxAgentRounds"]) {
            await openPicker(id); await page.keyboard.press("End"); await page.keyboard.press("Enter");
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
            await page.locator('.mobile-workspace-actions [data-locale-set="en"]').click();
            await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector("#settingsTitle").textContent === "Generation settings");
            await page.locator('.mobile-workspace-actions [data-locale-set="cn"]').click();
          }
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "settingsButton");
          if (!mobile) {
            await page.locator('.studio-bar__right > .locale-switch [data-locale-set="en"]').click();
            await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector("#generateButton").textContent.startsWith("Generate"));
            await page.locator('.studio-bar__right > .locale-switch [data-locale-set="cn"]').click();
          }
          await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
          await page.locator("#historyNavButton").click(); await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.id === "historyNavButton");
        });
        await step(`${name}: single result, refresh, parentId, memory, agent review and suggestions`, async () => {
          await page.locator("#promptInput").fill("黑胡桃木圈椅，保留靠背弧线");
          const first = await beginTask();
          await page.reload(); await recoveredRunning();
          await completeTask(first, 1);
          assert.equal(posts.length, 1, "reload never creates another task");
          await page.locator(cardAction("compare")).click();
          assert.equal(await page.locator("#compareModal").evaluate(dialog => dialog.open), false);
          assert.equal(await page.locator('.version-card.selected [data-action="select"]').getAttribute("aria-pressed"), "true");
          assert.equal(await page.locator("#reviewToggle").isVisible(), mobile);
          assert.equal(await page.locator("#reviewBody").isVisible(), !mobile);
          assert.equal(await page.locator("#totalScore").innerText(), "—");
          if (mobile) {
            await page.locator("#reviewToggle").click();
            assert.equal(await page.locator("#reviewToggle").getAttribute("aria-expanded"), "true");
            assert.equal(await page.locator("#reviewBody").isVisible(), true);
          }
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
          await page.locator(cardAction("compare")).click();
          assert.equal(await page.locator("#compareChoices button").count(), 1);
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.querySelector("#compareChoices").childElementCount === 0);
          assert.ok(await page.locator("#versionEdges path").count());
          assert.equal(await page.locator("#totalScore").innerText(), "78");
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator("#suggestions button").first().click(); assert.match(await page.locator("#promptInput").inputValue(), /收细椅腿/);
          await shot("agent-stop");
        });
        await step(`${name}: region, comparison modes, keyboard slider, PNG, history and locale roundtrip`, async () => {
          await page.locator('[data-mode="normal"]').click();
          await page.locator(cardAction("region")).click();
          const r = await page.locator(".version-card.selected .card-media").boundingBox();
          assert.equal(await page.locator(".version-card.selected .card-media").evaluate(media => media.offsetHeight), 236);
          await page.locator(".version-card.selected .card-media").evaluate(media => {
            media.addEventListener("pointerdown", event => { media.dataset.testPointer = event.pointerId; }, { once: true });
          });
          await page.mouse.move(r.x + r.width * .7, r.y + r.height * .6); await page.mouse.down();
          await page.locator(".version-card.selected .card-media").evaluate(media => {
            media.dispatchEvent(new PointerEvent("pointercancel", { pointerId: Number(media.dataset.testPointer) }));
          });
          await page.mouse.up();
          assert.equal(await page.locator("#regionModal").evaluate(dialog => dialog.open), false);
          await page.mouse.move(r.x + r.width * .7, r.y + r.height * .6); await page.mouse.down();
          await page.mouse.move(r.x + r.width * .2, r.y + r.height * .2, { steps: 8 }); await page.mouse.up();
          await page.waitForFunction(() => document.querySelector("#regionModal").open);
          await shot("region"); await page.locator("#regionInput").fill("左侧扶手变薄");
          const regionTask = await beginTask('#regionForm button[type="submit"]');
          await completeTask(regionTask, 3); assert.equal(posts.length, 3); assert.ok(posts[2].parentId); assert.match(posts[2].originalPrompt, /区域/);
          const box = posts[2].region;
          assert.ok(box && ["x", "y", "width", "height"].every(key => Number.isFinite(box[key]) && box[key] >= 0 && box[key] <= 1), "edit-one-spot sends the normalized box");
          assert.ok(box.width > 0 && box.height > 0 && box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001);
          assert.deepEqual(regionTask.task.request.region && Object.keys(regionTask.task.request.region).sort(), ["height", "width", "x", "y"]);
          const edit = fixture.calls.filter(call => call.url === "/v1/images/edits").at(-1);
          assert.ok(edit?.body.hasImage, "the parent image is uploaded with the edit");
          assert.match(edit.body.prompt, /Only change furniture parts inside the rectangle/);
          if (mobile) {
            for (const action of ["region", "rerun", "compare", "download"]) await hitTarget(page.locator(cardAction(action)));
            await hitTarget(page.locator("#clearSelection"));
            await hitTarget(page.locator("#reviewToggle"));
          }
          await page.locator(cardAction("compare")).click();
          await page.waitForFunction(() => document.activeElement.closest("#compareChoices"));
          assert.equal(await page.locator("#compareChoices button").count(), 2);
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.matches('[data-action="compare"]'));
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.activeElement.closest("#compareChoices"));
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => !document.querySelector("#compareResult").hidden);
          for (const mode of ["slider", "overlay", "side"]) {
            const modeButton = page.locator(`[data-compare-mode="${mode}"]`);
            if (mobile) await hitTarget(modeButton);
            await modeButton.click();
            assert.equal(await page.locator("#compareStage").getAttribute("data-mode"), mode);
            if (mode === "side") assert.equal(await page.locator("#compareRange").isHidden(), true);
            else {
              for (const value of [0, 50, 100]) {
                await page.locator("#compareRange").evaluate((input, next) => { input.value = next; input.dispatchEvent(new Event("input")); }, value);
                assert.equal(await page.locator("#compareRange").getAttribute("aria-valuetext"), `${value}%`);
                if (mode === "overlay") assert.equal(await page.locator("#compareB").evaluate(img => Number(getComputedStyle(img).opacity)), value / 100);
                else assert.match(await page.locator("#compareB").evaluate(img => getComputedStyle(img).clipPath), new RegExp(`${value}%`));
              }
              await page.locator("#compareRange").focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
              assert.equal(await page.locator("#compareRange").inputValue(), "1");
            }
            await shot(`compare-${mode}`);
          }
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => document.activeElement.matches('[data-action="compare"]'));
          const download = page.waitForEvent("download"); await page.locator("#exportButton").click();
          const file = await download; const bytes = fs.readFileSync(await file.path());
          assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.equal(bytes.readUInt32BE(16), 1600); assert.equal(bytes.readUInt32BE(20), 1400);
          if (out) await file.saveAs(path.join(out, `${name}-fixture-export.png`));
          await page.locator("#historyNavButton").click(); await page.locator("#historyFilterInput").fill("没有匹配的文字");
          assert.equal(await page.locator("#historyGrid article").count(), 0); await page.locator("#historyFilterInput").fill("");
          await page.locator('[data-history-action="open"]').first().click(); await ready();
          await page.locator(cardAction("compare")).click();
          await page.locator("#compareChoices button").first().click();
          assert.equal(await page.locator("#compareStage").getAttribute("data-mode"), "slider");
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !document.querySelector("#compareA").hasAttribute("src") && !document.querySelector("#compareChoices").childElementCount);
          await page.locator("#promptInput").fill("用户的设计描述不要转换");
          if (mobile) await page.locator("#settingsButton").click();
          const locale = code => page.locator(`${mobile ? ".mobile-workspace-actions" : ".studio-bar__right > .locale-switch"} [data-locale-set="${code}"]`);
          await locale("tw").click();
          await page.waitForFunction(mobile => mobile
            ? document.querySelector("#settingsTitle").textContent === "生成設定"
            : document.querySelector('.version-card.selected [data-action="download"]').textContent === "下載", mobile);
          if (mobile) { assert.match(await page.locator("#settingsTitle").innerText(), /設定/); } else { assert.match(await page.locator('.version-card.selected [data-action="download"]').innerText(), /下載/); }
          assert.equal(await page.locator("#promptInput").inputValue(), "用户的设计描述不要转换");
          assert.equal(await page.locator("#userProfileButton").innerText(), "测试用户");
          await locale("en").click();
          await page.waitForFunction(() => document.querySelector('.version-card.selected [data-action="download"]').textContent === "Download");
          assert.equal(await page.locator("#promptInput").inputValue(), "用户的设计描述不要转换");
          await locale("cn").click(); if (mobile) await page.keyboard.press("Escape");
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
          const me = await (await context.request.get(fixture.base + "/api/v1/auth/me")).json();
          const longName = "Long English Furniture Account Name";
          fixture.userStore.updateProfile(me.user.id, { displayName: longName });
          await page.evaluate(() => localStorage.setItem("musheng-locale", "en"));
          await page.route(taskUrl("quota"), route => route.fulfill({ json: { ok: true, quota: {
            generation: { limit: 20, remaining: 0, resetAt: new Date(Date.now() + 60000).toISOString() },
          } } }));
          await page.reload(); await recoveredRunning();
          await page.waitForFunction(name => document.querySelector("#userProfileButton").textContent === name
            && document.querySelector("#quotaHint").dataset.empty === "true", longName);
          const styleValue = await page.locator("#styleSelect").evaluate(select => {
            const value = select.parentElement.querySelector(".yui-picker__value");
            const font = getComputedStyle(value);
            const context = document.createElement("canvas").getContext("2d");
            context.font = font.font;
            const longest = [...select.options].reduce((a, b) => context.measureText(a.textContent).width >= context.measureText(b.textContent).width ? a : b);
            select.value = longest.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return longest.textContent;
          });
          const selectedStyle = picker("styleSelect").locator(".yui-picker__value");
          await page.waitForFunction(label => document.querySelector(".composer-controls .yui-picker__value").textContent === label, styleValue);
          assert.equal(await selectedStyle.evaluate(value => value.clientWidth > 0 && value.scrollWidth <= value.clientWidth), true);
          assert.equal(await page.locator("#generateButton").innerText(), "Stop");
          assert.equal(await page.locator("#generateButton").isEnabled(), true);
          if (mobile) await hitTarget(page.locator("#generateButton"), 40);
          await shot("quota-zero-running-en");
          await page.locator('.studio-bar__right > .locale-switch [data-locale-set="cn"]').evaluate(button => button.click());
          await page.unroute(taskUrl("quota"));
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
        await step(`${name}: quota hint stays quiet until five are left and blocks at zero`, async () => {
          const real = await (await context.request.get(taskUrl("quota"))).json();
          assert.ok(real.quota.generation.remaining > 5);
          assert.equal(await page.locator("#quotaHint").isHidden(), true);
          const resetAt = new Date(Date.now() + 20 * 60000).toISOString();
          const fake = remaining => route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, quota: { generation: { limit: 20, remaining, resetAt }, review: { limit: 20, remaining: 20, resetAt: null } } }) });
          const styleFits = async () => {
            await page.locator("#styleSelect").evaluate(select => {
              select.value = "newChinese";
              select.dispatchEvent(new Event("change", { bubbles: true }));
            });
            const size = await picker("styleSelect").locator(".yui-picker__value").evaluate(value => [value.clientWidth, value.scrollWidth]);
            assert.ok(size[0] > 0 && size[0] >= size[1], `style picker is clipped: ${size}`);
          };
          await page.route(taskUrl("quota"), fake(6));
          await page.reload(); await ready(); await styleFits();
          assert.equal(await page.locator("#quotaHint").isHidden(), true);
          await page.unroute(taskUrl("quota"));
          await page.route(taskUrl("quota"), fake(3));
          await page.reload(); await page.waitForFunction(() => !document.querySelector("#quotaHint").hidden);
          assert.match(await page.locator("#quotaHint").innerText(), /剩 3/);
          await styleFits();
          assert.equal(await page.locator("#generateButton").isDisabled(), false);
          await page.unroute(taskUrl("quota")); await page.route(taskUrl("quota"), fake(0));
          await page.reload(); await page.waitForFunction(() => document.querySelector("#quotaHint").dataset.empty === "true");
          assert.match(await page.locator("#quotaHint").innerText(), /\d{2}:\d{2} 恢复/);
          await styleFits();
          assert.equal(await page.locator("#generateButton").isDisabled(), true);
          await page.unroute(taskUrl("quota")); await page.reload();
          await page.waitForFunction(() => document.querySelector("#quotaHint").hidden && !document.querySelector("#generateButton").disabled);
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
        await step(`${name}: use the second parent image for keyboard region, main edit and rerun`, async () => {
          const me = await (await context.request.get(fixture.base + "/api/v1/auth/me")).json();
          const picture = file => fs.readFileSync(path.join(__dirname, "../public/assets", file));
          const second = picture("ming-chair-side-view.png");
          const images = [picture("hero-meadow.png"), second].map(bytes => ({ url: `data:image/png;base64,${bytes.toString("base64")}` }));
          const { record } = await fixture.historyStore.saveAgent({ originalPrompt: "黑胡桃木圈椅", prompt: "original" }, {
            rounds: images.map((image, i) => ({ image, round: i + 1 })), bestRound: 1,
          }, { ownerId: me.user.id });
          const expectedHash = require("node:crypto").createHash("sha256").update(second).digest("hex");
          await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("musheng-v3-task:")).forEach(key => localStorage.removeItem(key)));
          await page.reload(); await ready();
          const card = `.version-card[data-key="${record.id}:1"]`;
          const firstCard = `.version-card[data-key="${record.id}:0"]`;
          const center = async (selector = card) => {
            await page.locator(`${selector} [data-action="select"]`).evaluate(button => button.click());
            if (mobile) { await page.locator("#settingsButton").click(); await page.locator("#mobileCenterButton").click(); }
            else await page.locator("#zoomReset").click();
            await page.waitForFunction(selector => document.querySelector(`${selector} img`)?.naturalWidth > 0, selector);
          };
          await center(firstCard);
          const firstRegion = page.locator(cardAction("region", firstCard));
          await firstRegion.focus(); await page.keyboard.press("Space");
          await page.waitForFunction(() => document.activeElement.matches(".region-box"));
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => document.activeElement.id), "regionCancel");
          const before = posts.length;
          if (mobile) await page.locator("#regionCancel").tap(); else await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.activeElement.matches('[data-action="region"]'));
          assert.equal(posts.length, before);
          await center();
          const opener = page.locator(cardAction("region", card));
          await opener.focus(); await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.activeElement.matches(".region-box"));
          await page.keyboard.press("ArrowRight");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("Shift+ArrowRight");
          await page.keyboard.press("Shift+ArrowUp");
          await shot("region-keyboard");
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.activeElement.id === "regionInput");
          for (const [code, text] of [["tw", "中間區域"], ["en", "center area"], ["cn", "中间区域"]]) {
            await page.locator(`.studio-bar__right > .locale-switch [data-locale-set="${code}"]`).evaluate(button => button.click());
            await page.waitForFunction(text => document.querySelector("#regionLabel").textContent.includes(text), text);
          }
          await page.keyboard.type(" thinner arms");
          const next = async (button, key) => {
            const work = await beginTask(button, key);
            assert.equal(work.task.request.parentId, record.id);
            assert.equal(work.task.request.parentImageIndex, 1);
            assert.equal(fixture.calls.filter(call => call.url === "/v1/images/edits").at(-1).body.imageHash, expectedHash);
            return work;
          };
          const regional = await next('#regionForm button[type="submit"]', "Enter");
          const expected = { x: .385, y: .385, width: .26, height: .24 };
          for (const key of Object.keys(expected)) assert.ok(Math.abs(regional.task.request.region[key] - expected[key]) <= .001);
          const result = await completeTask(regional, 3);
          await page.reload(); await ready();
          const source = await page.locator(card).evaluate(element => ({
            x: parseFloat(element.style.left) + 360, y: parseFloat(element.style.top) + 168,
          }));
          const branch = page.locator(`.version-card[data-key="${result.result.historyRecord.id}:0"]`);
          const target = await branch.evaluate(element => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top) + 168 }));
          const paths = await page.locator("#versionEdges path").evaluateAll(edges => edges.map(edge => edge.getAttribute("d")));
          assert.ok(paths.some(d => d.startsWith(`M ${source.x} ${source.y}`) && d.endsWith(`${target.x} ${target.y}`)));

          await center(); await page.locator("#promptInput").fill("retain the chair frame");
          await completeTask(await next("#generateButton"), 4);
          await center(); await completeTask(await next(cardAction("rerun", card)), 5);
          await center();
          const beforeFailure = generationCount();
          await page.locator("#constraintsInput").evaluate(input => { input.value = "keep joinery"; });
          await opener.press("Enter");
          await page.keyboard.press("Enter");
          await page.locator("#regionInput").fill("retain the second parent");
          const failed = await next('#regionForm button[type="submit"]', "Enter");
          assert.deepEqual(failed.task.request.region, { x: .375, y: .375, width: .25, height: .25 });
          failed.gate.fail();
          await page.waitForFunction(() => document.querySelector("[data-pending]")?.dataset.status === "failed");
          await page.reload();
          await page.waitForFunction(() => document.querySelector("[data-pending]")?.dataset.status === "failed");
          assert.equal(await page.locator(".task-failure").isVisible(), true);
          assert.equal(await page.locator("#toast").isHidden(), true);
          if (mobile) await hitTarget(page.locator(cardAction("retry", "[data-pending]")));
          await shot("failed");
          await page.locator("#styleSelect").evaluate(select => { select.value = "zen"; });
          await page.locator("#constraintsInput").evaluate(input => { input.value = "different constraint"; });
          const refusal = "已有生成任务正在执行，请查看当前任务";
          await page.route(taskUrl(), route => route.request().method() === "POST"
            ? route.fulfill({ status: 429, json: { message: refusal } })
            : route.continue());
          let retry = page.locator(cardAction("retry", "[data-pending]"));
          await retry.click();
          await page.waitForFunction(text => document.querySelector(".task-retry-error").textContent === text, refusal);
          assert.equal(await retry.isVisible(), true);
          await page.unroute(taskUrl());

          const gate = fixture.holdGeneration();
          let lost = false;
          const retriedPosts = [];
          await page.route(taskUrl(), async route => {
            if (route.request().method() === "POST") {
              retriedPosts.push(route.request().postDataJSON());
              if (!lost) {
                lost = true;
                const accepted = await route.fetch();
                assert.equal(accepted.status(), 202);
                await route.abort("timedout");
                return;
              }
            } else if (lost && retriedPosts.length === 1) {
              await route.fulfill({ json: { ok: true, tasks: [] } });
              return;
            }
            await route.continue();
          });
          await page.locator("#canvasViewport").focus();
          for (let i = 0; i < 12; i++) await page.keyboard.press("-");
          await page.waitForFunction(() => document.querySelector("#zoomReset").textContent === "25%");
          retry = page.locator('#compactActions [data-action="retry"]');
          for (const button of await page.locator("#compactActions button:not([hidden])").all()) await hitTarget(button);
          const recovered = page.waitForResponse(response => response.url() === taskUrl() && response.request().method() === "POST" && response.status() === 202);
          await retry.evaluate(button => { button.click(); button.click(); });
          const { task: retried } = await (await recovered).json();
          await bounded(gate.entered, "indexed retry");
          assert.equal(retriedPosts.length, 2, "a lost response replays the same idempotency key once");
          assert.deepEqual(retriedPosts[0], retriedPosts[1]);
          assert.notEqual(retried.requestId, failed.task.requestId);
          assert.deepEqual(retried.request, failed.task.request);
          assert.equal(generationCount() - beforeFailure, 2, "failure and exactly one retry reached the provider");
          await completeTask({ task: retried, gate }, 6);
          await page.unroute(taskUrl());

          const regionBox = page.locator(".region-box");
          const openRegion = async selector => {
            await center(selector);
            await page.locator(cardAction("region", selector)).press("Enter");
            await regionBox.waitFor();
          };
          const geometry = box => {
            const media = box.parentElement.getBoundingClientRect();
            const image = box.parentElement.querySelector("img");
            const ratio = image.naturalWidth / image.naturalHeight;
            const w = Math.min(media.width, media.height * ratio);
            const h = w / ratio;
            const left = media.x + (media.width - w) / 2;
            const top = media.y + (media.height - h) / 2;
            const rect = box.getBoundingClientRect();
            return { left, top, w, h, mediaWidth: media.width, mediaHeight: media.height,
              x: (rect.x - left) / w, y: (rect.y - top) / h, width: rect.width / w, height: rect.height / h };
          };
          const assertBox = (box, expected, tolerance = .001) => {
            for (const [key, value] of Object.entries(expected)) assert.ok(Math.abs(box[key] - value) < tolerance, `${key}: ${box[key]} vs ${value}`);
          };
          const repeatKey = (key, count, shiftKey = false) => regionBox.evaluate((box, { key, count, shiftKey }) => {
            for (let i = 0; i < count; i++) box.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
          }, { key, count, shiftKey });
          await openRegion(firstCard);
          assertBox(await regionBox.evaluate(geometry), { x: .375, y: .375, width: .25, height: .25 });
          await repeatKey("ArrowLeft", 100); await repeatKey("ArrowUp", 100);
          assertBox(await regionBox.evaluate(geometry), { x: 0, y: 0 });
          await repeatKey("ArrowRight", 100); await repeatKey("ArrowDown", 100);
          assertBox(await regionBox.evaluate(geometry), { x: .75, y: .75 });
          await repeatKey("ArrowLeft", 30, true); await repeatKey("ArrowUp", 30, true);
          assertBox(await regionBox.evaluate(geometry), { width: .025, height: .025 });
          await repeatKey("ArrowRight", 100, true); await repeatKey("ArrowDown", 100, true);
          assertBox(await regionBox.evaluate(geometry), { x: .75, y: .75, width: .25, height: .25 });
          await page.keyboard.press("Escape");

          await page.route(taskUrl(), route => route.request().method() === "POST"
            ? route.fulfill({ status: 400, json: { message: "上一版的图片不可用，无法基于它修改", details: { code: "PARENT_IMAGE_UNAVAILABLE" } } })
            : route.continue());
          const touch = mobile ? null : await context.newCDPSession(page);
          const sameRegion = { x: .2, y: .2, width: .4, height: .4 };
          const sendRegion = async code => {
            await page.locator("#regionModal").waitFor();
            await page.locator(`.studio-bar__right > .locale-switch [data-locale-set="${code}"]`).evaluate(button => button.click());
            await page.locator("#regionInput").fill("thinner arms");
            const response = responseFor(taskUrl(), "POST");
            await page.locator('#regionForm button[type="submit"]').click();
            assert.equal((await response).status(), 400);
            const expected = { cn: "你选的源图不可用，请重新选一张。", tw: "你選的源圖不可用，請重新選一張。", en: "The selected source image is unavailable. Please choose another one." };
            await page.waitForFunction(text => document.querySelector("#toast").textContent === text, expected[code]);
            return posts.at(-1).region;
          };
          const selectionCopy = [
            ["cn", firstCard, "按方向键移动选区，按 Shift+方向键调整大小，按 Enter 确认选区，按 Esc 取消框选。", "当前选区：左 37.5%，上 37.5%，宽 25%，高 25%"],
            ["tw", card, "按方向鍵移動選區，按 Shift+方向鍵調整大小，按 Enter 確認選區，按 Esc 取消框選。", "目前選區：左 37.5%，上 37.5%，寬 25%，高 25%"],
            ["en", firstCard, "Use arrow keys to move the selection, hold Shift with arrow keys to resize it, press Enter to confirm the area, or press Esc to cancel.", "Selection area: left 37.5%, top 37.5%, width 25%, height 25%"],
          ];
          for (const [code, selector, keyboardHelp, bounds] of selectionCopy) {
            await openRegion(selector);
            const unscaled = await regionBox.evaluate(geometry);
            assert.ok(unscaled[selector === firstCard ? "mediaHeight" : "mediaWidth"] > unscaled[selector === firstCard ? "h" : "w"]);
            if (code !== "cn") {
              await page.locator("#canvasViewport").press("-");
            }
            const box = await regionBox.evaluate(geometry);
            if (code !== "cn") assert.ok(box.w < unscaled.w);
            const start = { x: box.left + box.w * .6, y: box.top + box.h * .6 };
            const end = { x: box.left + box.w * .2, y: box.top + box.h * .2 };
            if (touch && code === "cn") {
              await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
              await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
              await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            } else {
              await page.mouse.move(start.x, start.y); await page.mouse.down();
              await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up();
            }
            assertBox(await sendRegion(code), sameRegion, 1.5 / Math.min(box.w, box.h));
            await openRegion(selector);
            const describedBy = (await regionBox.getAttribute("aria-describedby")).split(/\s+/);
            assert.ok(describedBy.includes("regionHelp") && describedBy.includes("regionBounds"));
            const accessibility = await page.locator("#regionControls").ariaSnapshot();
            assert.ok(accessibility.includes(keyboardHelp), accessibility);
            assert.ok(accessibility.includes(bounds), accessibility);
            assert.doesNotMatch(accessibility, /TODO_TEXT:/);
            assert.doesNotMatch(await page.locator("body").innerText(), /TODO_TEXT:/);
            if (out) fs.writeFileSync(path.join(out, `${name}-region-accessibility-${code}.yml`), accessibility + "\n");
            await regionBox.press("Enter");
            assert.deepEqual(await sendRegion(code), { x: .375, y: .375, width: .25, height: .25 });
          }
          await touch?.detach();
          await page.unroute(taskUrl());

          await center(card);
          await page.locator(cardAction("compare", card)).click();
          await page.locator("#compareChoices button").first().click();
          await page.locator('[data-compare-mode="overlay"]').click();
          await page.keyboard.press("Escape");
          const otherWork = (await fixture.historyStore.saveGeneration({ prompt: "Separate table" }, {
            images: [images[0]],
          }, { ownerId: me.user.id })).record;
          await page.locator("#historyNavButton").click();
          await page.locator("#refreshHistoryButton").click();
          await page.locator(`[data-history="${otherWork.id}"] [data-history-action="open"]`).click();
          await page.waitForFunction(key => document.querySelector(".version-card.selected img")?.naturalWidth
            && document.querySelector(".version-card.selected").dataset.key === key, `${otherWork.id}:0`);
          assert.equal(await page.locator(".version-card[data-key]").count(), 1);
          if (mobile) await hitTarget(page.locator(cardAction("compare")));
          await page.locator(cardAction("compare")).click();
          assert.equal(await page.locator("#compareModal").evaluate(dialog => dialog.open), false);
          assert.equal(await page.locator("#compareChoices button").count(), 0);
          assert.equal(await page.locator("#compareA").getAttribute("src"), null);
          await page.locator("#historyNavButton").click();
          await page.locator(`[data-history="${record.id}"] [data-history-action="open"]`).click();
          await ready();
          await page.locator(cardAction("compare")).click();
          await page.locator("#compareChoices button").first().click();
          assert.equal(await page.locator("#compareStage").getAttribute("data-mode"), "slider");
          await page.keyboard.press("Escape");
          assert.deepEqual(errors, []);
        });
        let legacyEdit;
        await step(`${name}: historical work restores the visible style and uses it in an edit request`, async () => {
          const me = await (await context.request.get(fixture.base + "/api/v1/auth/me")).json();
          const image = fs.readFileSync(path.join(__dirname, "../public/assets/hero-meadow.png"));
          const { record } = await fixture.historyStore.saveGeneration({ prompt: "Ming chair", style: "ming" }, {
            images: [{ url: `data:image/png;base64,${image.toString("base64")}` }],
          }, { ownerId: me.user.id });
          await page.evaluate(id => {
            localStorage.removeItem(`musheng-v3-task:${id}`);
            localStorage.setItem("musheng-locale", "cn");
          }, me.user.id);
          await page.reload();
          await page.waitForFunction(key => document.querySelector(".version-card.selected")?.dataset.key === key, `${record.id}:0`);
          const visibleStyle = picker("styleSelect").locator(".yui-picker__value");
          assert.equal(await visibleStyle.innerText(), "明式");

          const historyLoaded = responseFor(`${fixture.base}/api/v1/history`, "GET");
          const tasksLoaded = responseFor(taskUrl(), "GET");
          await goto("/studio?prompt=" + encodeURIComponent("新作品描述"));
          await Promise.all([historyLoaded, tasksLoaded]);
          await page.waitForFunction(() => !document.querySelector("#emptyState").hidden
            && document.querySelector("#promptInput").value === "新作品描述");
          assert.equal(await visibleStyle.innerText(), "新中式");
          await page.locator("#historyNavButton").click();
          await page.locator(`[data-history="${record.id}"] [data-history-action="open"]`).click();
          await ready();
          assert.equal(await visibleStyle.innerText(), "明式");
          await page.locator('[data-mode="normal"]').click();
          await page.locator("#promptInput").fill("收细扶手");
          const edit = await beginTask();
          assert.equal(posts.at(-1).parentId, record.id);
          assert.equal(posts.at(-1).style, "ming");
          legacyEdit = await completeTask(edit, 2);
        });
        await step(`${name}: explicit new work after restoring Ming returns the picker and request to the default`, async () => {
          const restored = responseFor(taskUrl(legacyEdit.id), "GET");
          await page.reload();
          assert.equal((await (await restored).json()).task.request.style, "ming");
          await ready();
          const visibleStyle = picker("styleSelect").locator(".yui-picker__value");
          assert.equal(await visibleStyle.innerText(), "明式");
          if (mobile) {
            await page.locator("#settingsButton").click();
            await page.locator("#mobileNewWorkButton").click();
          } else {
            await page.locator("#newWorkButton").click();
          }
          await page.locator("#emptyState").waitFor();
          assert.equal(await visibleStyle.innerText(), "新中式");
          await page.locator("#promptInput").fill("设计一张茶桌");
          const fresh = await beginTask();
          assert.equal(posts.at(-1).style, "newChinese");
          assert.equal(posts.at(-1).parentId, undefined);
          await completeTask(fresh, 1);
          assert.deepEqual(errors, []);
        });
        await step(`${name}: top-bar language, full status, user text and component library`, async () => {
          await goto("/studio?demo=success"); await ready();
          const chooseLanguage = async code => {
            if (mobile) {
              await hitTarget(page.locator("#mobileLocaleToggle"));
              await page.locator("#mobileLocaleToggle").tap();
              const item = page.locator(`#mobileLocale [data-locale-set="${code}"]`);
              await hitTarget(item); await item.tap();
            } else await page.locator(`.studio-bar__right > .locale-switch [data-locale-set="${code}"]`).click();
            await page.waitForFunction(code => document.documentElement.dataset.locale === code, code);
          };
          const toggleTheme = async () => {
            if (mobile) {
              await page.locator("#settingsButton").tap();
              await page.locator(".mobile-workspace-actions [data-theme-toggle]").tap();
              await page.keyboard.press("Escape");
            } else await page.locator(".studio-bar [data-theme-toggle]").click();
          };
          await page.locator("#settingsButton").click();
          await page.locator("#workTitleSetting").fill("未命名作品");
          await page.keyboard.press("Escape");
          await page.locator("#promptInput").fill("用户的描述，逐字保留");
          const key = await page.locator(".version-card.selected").getAttribute("data-key");
          const suggestion = await page.locator("#suggestions button").first().textContent();
          if ((await page.locator("html").getAttribute("data-theme")) !== "day") await toggleTheme();
          for (const theme of ["day", "night"]) {
            for (const code of ["cn", "tw", "en"]) {
              await chooseLanguage(code);
              assert.equal(await page.locator("#workTitle").inputValue(), "未命名作品");
              assert.equal(await page.locator("#promptInput").inputValue(), "用户的描述，逐字保留");
              assert.equal(await page.locator(".version-card.selected").getAttribute("data-key"), key);
              assert.equal(await page.locator("#suggestions button").first().textContent(), suggestion);
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
              if (mobile) await hitTarget(page.locator("#exportButton"));
              await shot(`studio-${code}-${theme}`);
            }
            if (theme === "day") await toggleTheme();
          }
          for (const [code, lang, label] of [["tw", "zh-TW", "繁"], ["en", "en", "EN"]]) {
            await chooseLanguage(code);
            await page.reload(); await ready();
            assert.equal(await page.locator("html").getAttribute("lang"), lang);
            assert.equal(await page.locator("#workTitle").inputValue(), "未命名作品");
            if (mobile) {
              assert.equal(await page.locator("#mobileLocaleValue").innerText(), label);
              assert.equal(await page.locator('#mobileLocale [aria-pressed="true"]').getAttribute("data-locale-set"), code);
              await shot(`language-reload-${code}`);
            }
          }
          if (mobile) {
            const toggle = page.locator("#mobileConnectionToggle");
            await hitTarget(toggle); await toggle.tap();
            await page.waitForFunction(() => document.querySelector("#mobileConnectionText").textContent === "Connected");
            await page.keyboard.press("Escape");
            await page.evaluate(() => window.dispatchEvent(new Event("offline")));
            await toggle.tap();
            await page.waitForFunction(() => document.querySelector("#mobileConnectionText").textContent.includes("Connection lost"));
            await shot("connection-full");
          }
          await goto("/lab/components.html");
          await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dataset.theme === "night");
          assert.equal(await page.locator(".lib-section").count(), 11);
          const assertSpecimensFit = async () => {
            const overflow = await page.evaluate(allowPromptOverflow => {
              const prompt = document.querySelector("#field .spec > form.hero__prompt");
              const caption = prompt?.previousElementSibling;
              const outside = [...document.querySelectorAll("body, body *")].flatMap(element => {
                // The one existing 375px specimen includes its form and code caption.
                const exempt = allowPromptOverflow && (prompt?.contains(element) || (caption?.matches("code") && caption.contains(element)));
                return [...element.getClientRects()]
                  .filter(rect => rect.left < 0 || (exempt ? Math.round(rect.right) > innerWidth + 8 : rect.right > innerWidth))
                  .map(({ left, right }) => ({ tag: element.tagName, id: element.id, className: element.getAttribute("class"), left, right }));
              });
              return { excess: document.documentElement.scrollWidth - innerWidth, outside };
            }, width === 375);
            assert.ok(overflow.excess <= (width === 375 ? 8 : 0), JSON.stringify(overflow));
            assert.deepEqual(overflow.outside, []);
          };
          await assertSpecimensFit();
          await shot("components-en-night");
          await page.locator('[data-locale-set="cn"]').click();
          await page.locator("[data-theme-toggle]").click();
          await page.waitForFunction(() => document.documentElement.lang === "zh-CN" && document.documentElement.dataset.theme === "day");
          await assertSpecimensFit();
          await shot("components-cn-day");
          assert.deepEqual(errors, []);
        });
        await step(`${name}: interactive Studio demo keeps the chosen source image in history`, async () => {
          await goto("/studio?demo=success");
          await page.evaluate(() => {
            localStorage.removeItem("musheng-v3-task:demo-success:demo-user");
            sessionStorage.setItem("musheng-v3-demo:success", JSON.stringify({ interactive: true, task: null, records: [{
              id: "demo-indexed-source", title: "Demo source", type: "generation", createdAt: new Date().toISOString(),
              images: [{ url: "/assets/hero-meadow.png" }, { url: "/assets/ming-chair-side-view.png" }],
            }] }));
          });
          await page.reload();
          const second = page.locator('[data-key="demo-indexed-source:1"]');
          await second.locator('[data-action="select"]').evaluate(button => button.click());
          await ready();
          assert.equal(await page.locator("#styleSelect").inputValue(), "newChinese");
          await page.locator('[data-mode="normal"]').click();
          await page.locator("#promptInput").fill("Edit the second demo image");
          await page.locator("#generateButton").click();
          await recoveredRunning();
          const storedDemo = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("musheng-v3-demo:success")));
          const { task } = await storedDemo();
          assert.equal(task.request.parentId, "demo-indexed-source");
          assert.equal(task.request.parentImageIndex, 1);
          assert.equal(task.request.style, "newChinese");
          await page.clock.setFixedTime(task.start + 5000);
          const resultId = `${task.id}-result`;
          const resultKey = `${resultId}:0`;
          await page.waitForFunction(key => document.querySelector(".version-card.selected")?.dataset.key === key, resultKey);
          const completed = await storedDemo();
          assert.equal(completed.task.status, "completed");
          assert.equal(completed.task.result.historyRecord.parentImageIndex, 1);
          assert.equal(completed.task.result.historyRecord.style, "newChinese");
          assert.equal(completed.records.find(record => record.id === resultId).parentImageIndex, 1);
          const connectedToSecond = () => page.evaluate(key => {
            const card = id => [...document.querySelectorAll(".version-card")].find(card => card.dataset.key === id);
            const source = card("demo-indexed-source:1").style;
            const result = card(key).style;
            return [...document.querySelectorAll("#versionEdges path")].some(edge => {
              const d = edge.getAttribute("d");
              return d.startsWith(`M ${parseFloat(source.left) + 360} ${parseFloat(source.top) + 168} `)
                && d.endsWith(` ${parseFloat(result.left)} ${parseFloat(result.top) + 168}`);
            });
          }, resultKey);
          assert.equal(await connectedToSecond(), true);
          await page.reload();
          await page.locator(`[data-key="${resultKey}"]`).waitFor({ state: "attached" });
          assert.equal(await connectedToSecond(), true);
          for (const [saved, expected] of [["ming", "ming"], [null, "newChinese"]]) {
            await page.evaluate(style => {
              const key = "musheng-v3-demo:success";
              const data = JSON.parse(sessionStorage.getItem(key));
              if (style === null) delete data.task.request.style;
              else data.task.request.style = style;
              sessionStorage.setItem(key, JSON.stringify(data));
            }, saved);
            await page.reload();
            await page.waitForFunction(({ key, expected }) => document.querySelector(".version-card.selected")?.dataset.key === key
              && document.querySelector("#styleSelect").value === expected, { key: resultKey, expected });
          }
          assert.deepEqual(errors, []);
        });
      } finally { await browser.close(); }
      if (failed) break;
    }
  } finally { await fixture.close(); }
});
