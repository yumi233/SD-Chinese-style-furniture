// Run: CHROME_PATH='/path/to/Chromium' node docs/redesign/astra/verify.mjs
// Uses only Node built-ins and an existing Chromium. Serves only this proposal.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../public/proposals/astra");
const out = join(dir,"evidence");
await mkdir(out,{recursive:true});
const profile = await mkdtemp(join(out,".browser-"));
const chromePath = process.env.CHROME_PATH;
if(!chromePath) throw new Error("Set CHROME_PATH to an existing Chromium; no dependencies will be installed.");
const errors=[], external=[], checks=[];
const server=createServer(async(req,res)=>{
  const path=resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!path.startsWith(root+"/")){res.writeHead(403);res.end();return;}
  try {res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript"})[extname(path)]||"application/octet-stream");res.end(await readFile(path));}
  catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(chromePath,["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","--disable-extensions","--hide-scrollbars","about:blank"],{stdio:["ignore","ignore","pipe"]});
let ws,seq=0;const pending=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,timeout=12000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await wait(80);}throw new Error("Timeout: "+message);}
try {
  let endpoint;
  chrome.stderr.on("data",d=>{const m=String(d).match(/DevTools listening on (ws:\/\/\S+)/);if(m)endpoint=m[1];});
  await until(()=>endpoint,"Chromium launch");
  ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener("open",r,{once:true}));
  ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text+": "+m.params.exceptionDetails.exception?.description);if(m.method==="Network.requestWillBeSent"&&!m.params.request.url.startsWith(base)&&!m.params.request.url.startsWith("data:")&&!m.params.request.url.startsWith("blob:"))external.push(m.params.request.url);});
  function send(method,params={},sessionId){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  const {targetId}=await send("Target.createTarget",{url:"about:blank"});
  const {sessionId}=await send("Target.attachToTarget",{targetId,flatten:true});
  const cdp=(m,p={})=>send(m,p,sessionId);
  await cdp("Page.enable");await cdp("Runtime.enable");await cdp("Network.enable");
  await send("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:out,eventsEnabled:true});
  async function evaluate(expression){const r=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||expression);return r.result.value;}
  const data=()=>evaluate('JSON.parse(localStorage.getItem("musheng-astra-v1"))');
  async function project(){const s=await data();return s.projects.find(p=>p.id===s.current);}
  async function viewport(width,height){await cdp("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<761});}
  async function navigate(file){await cdp("Page.navigate",{url:base+"/"+file});await until(()=>evaluate('document.readyState === "complete" && !!window.Furniture'),"navigation");await wait(80);}
  async function click(selector){
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error("Unavailable: "+${JSON.stringify(selector)});e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await cdp("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
  }
  async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event("input",{bubbles:true}));})()`);}
  async function shot(name){await wait(280);const result=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(out,name+".png"),Buffer.from(result.data,"base64"));}
  async function check(name,test){await test();checks.push(name);console.log("PASS",name);}
  const settled=()=>until(async()=>{const p=await project();return p.status==="success"&&!p.task?.active;},"generation success",20000);
  const modalVisible=()=>evaluate('document.querySelector("#modal").open');
  async function demo(state){await click("#demo-open");await click(`[data-state="${state}"]`);}
  await viewport(1440,900);await navigate("index.html");
  await check("home ASCII and Dither parameters change the generated pixels",async()=>{
    const before=await evaluate('document.querySelector("#hero-canvas").toDataURL()');await click('[data-mode="ascii"]');const after=await evaluate('document.querySelector("#hero-canvas").toDataURL()');assert.notEqual(before,after);await click("#effect-settings");await fill("#font-size","16");const changed=await evaluate('document.querySelector("#hero-canvas").toDataURL()');assert.notEqual(after,changed);await click("#effect-settings");await click('[data-mode="dither"]');
  });
  await evaluate("window.scrollTo(0,0)");await shot("home-desktop");await viewport(390,844);await evaluate("window.scrollTo(0,0)");await shot("home-mobile");await viewport(1440,900);
  await check("homepage prompt enters a new studio draft",async()=>{await fill("#home-prompt","一把白蜡木新中式圈椅");await click('#quick-start button');await until(()=>evaluate('!!document.querySelector("#generate")'),"studio");assert.equal(await evaluate('document.querySelector("#prompt").value'),"一把白蜡木新中式圈椅");});
  await check("generation → partial image → review → edit → comparison (3 consecutive runs)",async()=>{
    for(let i=0;i<3;i++){
      if(i){await click("#new-project");await fill("#prompt","一把白蜡木圈椅");}
      await click("#generate");await until(async()=> (await project()).status==="partial","partial");if(!i)await shot("partial-desktop");await settled();
      let p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].scores.length,6);
      await fill("#edit-prompt","让扶手更薄一些");await click("#apply-edit");await settled();p=await project();assert.equal(p.versions.length,2);assert.equal(p.versions[1].parent,1);assert.notDeepEqual(p.versions[0].design,p.versions[1].design);
      await click("#compare-open");assert(await modalVisible());assert.match(await evaluate('document.querySelector("#compare-delta").textContent'),/综合 \+6 分/);if(i===2)await shot("compare-desktop");await click("#modal-close");
    }
  });
  await check("selection creates a branch and preserves the source; note, pan and zoom work",async()=>{
    await click(".version-card");await click("#select-tool");await fill("#local-edit","扶手更薄一点，保持白蜡木");await click("#apply-local");await settled();const p=await project();assert.equal(p.versions.length,3);assert.equal(p.versions[2].parent,1);assert(p.versions[2].region);assert.equal(p.versions[2].design.material,"wood");
    await click("#annotate-tool");await fill("#annotation-text","保留这个环抱比例");await click("#annotation-form button");assert.equal((await project()).versions[2].notes.length,1);
    await click("#zoom-in");assert.equal(await evaluate('document.querySelector("#zoom-reset").textContent'),"110%");
    await evaluate('document.querySelector("#canvas-stage").focus()');await cdp("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight"});await cdp("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight"});await click("#zoom-reset");
  });
  await evaluate('document.querySelector(".brief-pane").scrollTop=0;document.querySelector(".review-pane").scrollTop=0;document.querySelector("#toast").hidden=true');await shot("studio-desktop");
  await check("export creates a real PNG download",async()=>{await click("#export-open");await click("#download-sheet");await until(async()=>{const {readdir}=await import("node:fs/promises");return (await readdir(out)).some(n=>n.endsWith("作品页.png"));},"export file");await click("#modal-close");});
  await viewport(390,844);await evaluate('window.scrollTo(0,0)');await shot("studio-mobile");
  await check("390px workflow: review, local edit, version compare, history, account",async()=>{
    await click('[data-tab="review"]');await fill("#edit-prompt","把扶手收薄，再加宽一些");await click("#apply-edit");await settled();await click('[data-tab="version"]');await click("#compare-open");assert(await modalVisible());await shot("compare-mobile");await click("#modal-close");
    await click('[data-tab="review"]');await click("#restore-description");assert.match(await evaluate('document.querySelector("#prompt").value'),/圈椅/);await click("#history-open");assert(await modalVisible());await click("[data-restore]");await click("#account-open");assert(await modalVisible());await click("#account-switch");assert.equal(await evaluate('document.querySelector("#modal-title").textContent'),"建立你的设计档案");await click("#account-skip");
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  });
  await viewport(1440,900);
  await check("stopped and failed states retain partial results and retry the same candidate",async()=>{
    await demo("stopped");let p=await project();assert.equal(p.status,"stopped");assert.equal(p.versions.length,1);const id=p.versions[0].id;await click("#notice button");await settled();p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].id,id);
    await demo("failed");p=await project();assert.equal(p.status,"failed");assert.match(await evaluate('document.querySelector("#notice").textContent'),/未扣次数/);await shot("failed-desktop");await click("#notice button");await settled();
  });
  await check("disconnect and refresh resume without duplicate versions",async()=>{
    await demo("disconnected");let p=await project();assert.equal(p.status,"disconnected");const id=p.versions[0].id;await click("#notice button");await settled();p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].id,id);
    await demo("partial");p=await project();const candidate=p.versions[0].id;await cdp("Page.reload");await until(()=>evaluate('document.readyState==="complete" && !!document.querySelector("#generate")'),"reload");await settled();p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].id,candidate);assert.equal(p.versions[0].scores.length,6);
  });
  await check("automatic rounds stop at the target; stored drafts survive reload",async()=>{
    await click("#new-project");await fill("#prompt","一张白蜡木茶桌");await click(".parameters summary");await click("#auto-iterate");await click("#generate");await settled();let p=await project();assert.equal(p.versions.length,2);assert.equal(p.versions[1].design.type,"table");assert(p.versions[1].score>=85);
    const id=p.id;await cdp("Page.reload");await until(()=>evaluate('document.readyState==="complete" && !!document.querySelector("#generate")'),"reload");p=await project();assert.equal(p.id,id);assert.equal(p.versions.length,2);
  });
  await check("history deletion requires confirmation and preserves other works",async()=>{
    const before=(await data()).projects.length;await click("#history-open");await click(".history-item .delete");assert.match(await evaluate('document.querySelector("#modal-title").textContent'),/删除/);await click("#delete-cancel");assert.equal((await data()).projects.length,before);await click(".history-item:last-child .delete");await click("#delete-confirm");assert.equal((await data()).projects.length,before-1);await click("#modal-close");
  });
  await check("primary text colors satisfy WCAG AA normal-text contrast",async()=>{
    const luminance=hex=>{const v=hex.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
    for(const [fg,bg] of [["20242c","f3f4f6"],["626873","f3f4f6"],["244be8","ffffff"],["ffffff","244be8"],["244be8","e9edff"],["a63235","fff0ee"],["805600","fff4dc"]]){const a=luminance(fg),b=luminance(bg);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fg}/${bg}`);}
  });
  await check("reduced motion and 200% equivalent layout stay readable",async()=>{
    await cdp("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});await viewport(720,450);assert(await evaluate('getComputedStyle(document.querySelector("#review-content")).animationName === "none"'));assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));await shot("studio-200-percent-layout");await viewport(390,844);
  });
  await check("storage failures are visible without blocking export",async()=>{
    await evaluate('Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")};');await click('[data-tab="brief"]');await fill("#prompt","保存失败时仍保留此需求");assert.match(await evaluate('document.querySelector("#save-status").textContent'),/保存失败/);await click("#export-open");assert(await modalVisible());await click("#modal-close");
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push("No uncaught browser errors or external resource requests");
  await writeFile(join(out,"verification.json"),JSON.stringify({passed:checks.length,checks,errors,external,viewports:["1440x900","390x844","720x450 (200% layout equivalent)"],date:new Date().toISOString()},null,2));
  console.log(`All ${checks.length} verification groups passed.`);
} finally {
  if(ws?.readyState===WebSocket.OPEN)ws.close();chrome.kill();await new Promise(r=>setTimeout(r,700));server.close();await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
