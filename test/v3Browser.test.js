const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startFixture } = require("./support/studio-server.fixture");

// Opt in with existing Playwright/browser installations; no dependency install,
// real model calls, desktop windows, user accounts or production configuration.
const enabled = Boolean(process.env.V3_QA_PLAYWRIGHT && process.env.V3_QA_CHROMIUM && process.env.V3_QA_WEBKIT);
test("v3 headless Chromium and iPhone WebKit regression journeys", { skip: !enabled, timeout: 240000 }, async t => {
  const { chromium, webkit, devices } = require(process.env.V3_QA_PLAYWRIGHT);
  const fixture = await startFixture();
  const out = process.env.V3_QA_OUTPUT;
  if (out) fs.mkdirSync(out, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const name = mobile ? "iphone" : "desktop";
      const browser = await (mobile ? webkit : chromium).launch({ headless: true, executablePath: mobile ? process.env.V3_QA_WEBKIT : process.env.V3_QA_CHROMIUM });
      const context = await browser.newContext(mobile ? { ...devices["iPhone 15"], acceptDownloads: true } : { viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [], posts = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        if (request.url().endsWith("/generation-tasks") && request.method() === "POST") posts.push(request.postDataJSON());
      });
      const shot = async label => { if (out) await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: true }); };
      const goto = async url => { await page.goto(fixture.base + url); };
      const idle = () => page.waitForFunction(() => document.querySelector("#generateButton").dataset.busy === "false");
      const ready = () => page.waitForFunction(() => document.querySelector(".version-card.selected img")?.naturalWidth > 0);
      const picker = id => page.locator(`#${id}`).locator("..").locator(".yui-picker__trigger");
      try {
        await t.test(`${name}: homepage phrases, four demo scenes, locale, theme and touch fallback`, async () => {
          await goto("/");
          await page.locator("[data-seed]").first().click();
          assert.equal(await page.locator("#homePrompt").inputValue(), "一张留白的茶桌，胡桃木");
          if (mobile) {
            await page.waitForTimeout(700);
            assert.equal(await page.locator(".hero__art canvas").count(), 0, "touch keeps the still ASCII without pointer animation");
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
          await page.waitForURL("**/studio?prompt=*");
          assert.equal(await page.locator("#promptInput").inputValue(), "一张留白的茶桌，胡桃木");
        });
        const email = `${name}-${Date.now()}@example.invalid`, password = "Fixture-Password-123";
        await t.test(`${name}: real HTTP auth, next redirect, errors, password visibility, night contrast`, async () => {
          await goto("/login.html?next=" + encodeURIComponent("/studio?prompt=测试输入"));
          assert.match(await page.locator("#authTitle").innerText(), /登入/);
          const contrast = await page.evaluate(() => {
            const brightness = Number(getComputedStyle(document.querySelector(".login-visual__art")).filter.match(/brightness\(([\d.]+)\)/)?.[1] || 1);
            const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            const bg = luminance([255, 255, 255].map(c => c * brightness));
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
          await page.locator("#authSubmit").click(); await page.waitForURL("**/studio?prompt=*");
          await page.waitForFunction(() => document.querySelector("#userProfileButton").textContent === "测试用户");
          assert.equal(await page.locator("#promptInput").inputValue(), "测试输入");
        });
        await t.test(`${name}: every settings picker, range, nested Escape and opener focus`, async () => {
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
        await t.test(`${name}: single result, refresh, parentId, memory, agent stop and suggestions`, async () => {
          await page.locator("#promptInput").fill("黑胡桃木圈椅，保留靠背弧线"); await page.locator("#generateButton").click();
          await page.waitForFunction(() => document.querySelector("#generateButton").dataset.busy === "true");
          await page.reload(); await ready(); await idle();
          assert.equal(posts.length, 1, "reload never creates another task");
          assert.equal(await page.locator("#totalScore").innerText(), "—");
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator("#memoryOptions input").first().focus(); await page.keyboard.press("Space");
          assert.equal(await page.locator("#memoryOptions input").first().isChecked(), true);
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator('[data-mode="agent"]').click(); await page.locator("#promptInput").fill("扶手再薄一点"); await page.locator("#generateButton").click();
          await page.waitForFunction(() => document.querySelector("#generateButton").dataset.busy === "true");
          await page.locator("#generateButton").click(); await page.reload(); await idle(); await ready();
          assert.equal(posts.length, 2); assert.ok(posts[1].parentId); assert.match(posts[1].originalPrompt, /必须保留/);
          assert.equal(await page.locator(".version-card[data-key]").count(), 2);
          assert.ok(await page.locator("#versionEdges path").count());
          assert.equal(await page.locator("#totalScore").innerText(), "78");
          if (mobile) await page.locator("#reviewToggle").click();
          await page.locator("#suggestions button").first().click(); assert.match(await page.locator("#promptInput").inputValue(), /收细椅腿/);
          await shot("agent-stop");
        });
        await t.test(`${name}: region, comparison modes, keyboard slider, PNG, history and locale roundtrip`, async () => {
          await page.locator('[data-mode="normal"]').click();
          await page.locator('.version-card.selected [data-action="region"]').click();
          const r = await page.locator(".version-card.selected .card-media").boundingBox();
          await page.mouse.move(r.x + r.width * .2, r.y + r.height * .2); await page.mouse.down();
          await page.mouse.move(r.x + r.width * .7, r.y + r.height * .6, { steps: 8 }); await page.mouse.up();
          await page.waitForFunction(() => document.querySelector("#regionModal").open);
          await shot("region"); await page.locator("#regionInput").fill("左侧扶手变薄"); await page.locator('#regionForm button[type="submit"]').click();
          await idle(); await ready(); assert.equal(posts.length, 3); assert.ok(posts[2].parentId); assert.match(posts[2].originalPrompt, /区域/);
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
          await toggle.click(); await page.waitForTimeout(100);
          if (mobile) { assert.match(await page.locator("#settingsTitle").innerText(), /設定/); } else { assert.match(await page.locator('.version-card.selected [data-action="download"]').innerText(), /下載/); }
          assert.equal(await page.locator("#promptInput").inputValue(), "用户的设计描述不要转换");
          assert.equal(await page.locator("#userProfileButton").innerText(), "测试用户");
          await toggle.click(); if (mobile) await page.keyboard.press("Escape");
          assert.equal(await page.locator('.version-card.selected [data-action="download"]').innerText(), "下载");
          await shot("studio-fixed");
        });
        await t.test(`${name}: new homepage brief wins over terminal task; mobile new work and active recovery`, async () => {
          await goto("/studio?prompt=" + encodeURIComponent("新的茶桌描述"));
          await page.waitForFunction(() => document.querySelector("#emptyState").hidden === false);
          assert.equal(await page.locator("#promptInput").inputValue(), "新的茶桌描述");
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
        await t.test(`${name}: long profile name preserves navigation and admin pickers remain keyboard accessible`, async () => {
          await goto("/studio"); await ready();
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
        await t.test(`${name}: reduced motion stays still and still allows demo scene selection`, async () => {
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
        await t.test(`${name}: logout clears private UI, login and safe next`, async () => {
          await goto("/studio"); await ready();
          await page.locator("#userProfileButton").click(); await page.locator("#profileLogoutButton").click();
          await page.waitForFunction(() => document.querySelector("#userProfileButton").textContent === "登录");
          assert.equal(await page.locator(".version-card[data-key]").count(), 0);
          await goto("/login.html?next=https://example.invalid/elsewhere");
          assert.equal(await page.evaluate(() => window.mushengLogin.nextPath), "/studio");
          await page.locator("#email").fill(email); await page.locator("#password").fill(password); await page.locator("#authSubmit").click();
          await page.waitForURL("**/studio"); await ready();
          assert.deepEqual(errors, []);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        });
      } finally { await browser.close(); }
    }
  } finally { await fixture.close(); }
});
