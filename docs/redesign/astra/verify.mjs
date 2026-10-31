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
const out = join(dir,"evidence","revision-2");
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
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error("Unavailable: "+${JSON.stringify(selector)});e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw new Error("Hidden control: "+${JSON.stringify(selector)});const x=r.left+r.width/2,y=r.top+r.height/2;const top=document.elementFromPoint(x,y);if(!e.contains(top))throw new Error("Covered control: "+${JSON.stringify(selector)});return {x,y};})()`);
    await cdp("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
  }
  async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event("input",{bubbles:true}));})()`);}
  async function shot(name){await wait(280);const result=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(out,name+".png"),Buffer.from(result.data,"base64"));}
  async function check(name,test){await test();checks.push(name);console.log("PASS",name);}
  const settled=()=>until(async()=>{const p=await project();return p.status==="success"&&!p.task?.active;},"generation success",20000);
  const modalVisible=()=>evaluate('document.querySelector("#modal").open');
  async function demo(state){await click("#settings-open");await click("#demo-open");await click(`[data-state="${state}"]`);}
  async function layout() {
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), "horizontal overflow");
    const clipped = await evaluate(`Array.from(document.querySelectorAll("button,summary,label")).filter(e=>{
      const r=e.getBoundingClientRect();return !e.classList.contains("sr-only")&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&e.scrollWidth>e.clientWidth+2;
    }).map(e=>e.id||e.textContent.trim())`);
    assert.deepEqual(clipped, [], "clipped control labels");
    const covered = await evaluate(`Array.from(document.querySelectorAll("#generate,#apply-local,#compare-open,#settings-done,.canvas-tools button")).filter(e=>{
      const r=e.getBoundingClientRect(), modal=document.querySelector("dialog[open]");
      if((modal&&!modal.contains(e))||!r.width||!r.height||r.top<0||r.bottom>innerHeight)return false;
      return [r.top+4,r.bottom-4].some(y=>!e.contains(document.elementFromPoint(r.left+r.width/2,y)));
    }).map(e=>e.id)`);
    assert.deepEqual(covered, [], "covered control edges");
  }
  async function topShot(name) { await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await shot(name); await layout(); }
  for (const [width,height,label] of [[1440,900,"desktop"],[390,844,"mobile"]]) {
    await viewport(width,height);await navigate("index.html");
    await check(`${label}: homepage ASCII, Dither and grain interaction`,async()=>{
      const before=await evaluate('document.querySelector("#hero-canvas").toDataURL()');
      await click('[data-mode="ascii"]');const ascii=await evaluate('document.querySelector("#hero-canvas").toDataURL()');assert.notEqual(before,ascii);
      await fill("#grain","9");assert.notEqual(ascii,await evaluate('document.querySelector("#hero-canvas").toDataURL()'));
      await click('[data-mode="dither"]');await fill("#grain","5");await topShot(`${label}-01-home`);
    });
    await check(`${label}: canvas-first empty state and on-demand settings`,async()=>{
      await fill("#home-prompt","一把轻盈的新中式白蜡木圈椅");await click('#quick-start button');
      await until(()=>evaluate('!!document.querySelector("#generate")'),"studio");
      assert.equal(await evaluate('document.querySelector("#prompt").value'),"一把轻盈的新中式白蜡木圈椅");
      assert(await evaluate('document.querySelector("#export-open").hidden'));
      assert(await evaluate('document.querySelector("#review-pane").hidden && document.querySelector("#version-pane").hidden'));
      assert(await evaluate('document.querySelector("#canvas-stage").getBoundingClientRect().width >= innerWidth*.95'));
      await topShot(`${label}-02-empty`);
      await click("#settings-open");assert(await evaluate('document.querySelector("#settings-modal").open'));
      await click(".parameters summary");await fill("#ratio","4:3-1080");await shot(`${label}-03-settings`);await layout();
      if(width===390){await evaluate('document.querySelector("#demo-open").scrollIntoView({block:"end",behavior:"instant"})');await shot("mobile-03b-settings-bottom");await layout();}
      await click("#settings-done");assert.equal((await project()).ratio,"4:3-1080");
    });
    await check(`${label}: visible ASCII → Dither → partial → review stages`,async()=>{
      await click("#generate");assert.equal(await evaluate('document.querySelector("#work-canvas").dataset.treatment'),"ascii");
      await topShot(`${label}-04-generating-ascii`);
      await until(async()=> (await project()).task.phase===1,"dither draft");
      assert.equal(await evaluate('document.querySelector("#work-canvas").dataset.treatment'),"dither");await topShot(`${label}-05-generating-dither`);
      await until(async()=> (await project()).status==="partial","partial");assert.equal((await project()).versions[0].score,null);
      await until(async()=> (await project()).task.phase===3,"visible review stage");
      assert.match(await evaluate('document.querySelector("#progress-label").textContent'),/评审/);
      await settled();const p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].scores.length,6);
      assert.equal(await evaluate('document.querySelector("#work-canvas").dataset.treatment'),"solid");
      assert(!await evaluate('document.querySelector("#review-pane").hidden'));
      await topShot(`${label}-06-result`);
      if(width===390){await evaluate('document.querySelector("#apply-edit").scrollIntoView({block:"center",behavior:"instant"})');await shot("mobile-07-review-actions");await layout();}
    });
    await check(`${label}: drag a selection, edit, retain V1, compare V1 / V2`,async()=>{
      const before=(await project()).versions[0];
      await click("#select-tool");
      const box=await evaluate('(()=>{const r=document.querySelector("#canvas-stage").getBoundingClientRect();return {x:r.left+r.width*.3,y:r.top+r.height*.25,dx:r.width*.35,dy:r.height*.3}})()');
      await cdp("Input.dispatchMouseEvent",{type:"mousePressed",x:box.x,y:box.y,button:"left",clickCount:1});
      await cdp("Input.dispatchMouseEvent",{type:"mouseMoved",x:box.x+box.dx,y:box.y+box.dy,button:"left",buttons:1});
      await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",x:box.x+box.dx,y:box.y+box.dy,button:"left",clickCount:1});
      await fill("#local-edit","扶手更薄一点，保留白蜡木");await topShot(`${label}-08-selection`);
      await click("#apply-local");await settled();const p=await project();assert.equal(p.versions.length,2);assert.deepEqual(p.versions[0],before);assert.equal(p.versions[1].parent,1);assert(p.versions[1].region);assert(p.versions[1].design.thin);
      await click('.workspace-tabs [data-tab="version"]');await shot(`${label}-09-versions`);await layout();
      await click("#compare-open");assert(await modalVisible());assert.match(await evaluate('document.querySelector("#compare-delta").textContent'),/综合 \+6 分/);await shot(`${label}-10-compare`);await layout();
      if(width===390){await evaluate('document.querySelector("#choose-right").scrollIntoView({block:"end",behavior:"instant"})');await shot("mobile-11-compare-actions");await layout();}
      await click("#choose-right");assert.equal((await project()).selected,p.versions[1].id);
    });
    await check(`${label}: free modification, version recovery and PNG export`,async()=>{
      await fill("#edit-prompt","把座面加宽");await click("#apply-edit");await settled();assert.equal((await project()).versions.length,3);
      await click(".version-options summary");await click("#restore-description");assert.match(await evaluate('document.querySelector("#prompt").value'),/白蜡木/);
      await click("#history-open");await click("[data-restore]");assert.equal((await project()).versions.length,3);
      await click("#export-open");await click("#download-sheet");await until(async()=>{const {readdir}=await import("node:fs/promises");return (await readdir(out)).some(n=>n.endsWith("作品页.png"));},"export file");await click("#modal-close");
    });
  }
  await viewport(1440,900);
  await check("stopped / failed / disconnected task recovery retains the candidate",async()=>{
    await demo("stopped");let p=await project();assert.equal(p.status,"stopped");const id=p.versions[0].id;await click("#notice button");await settled();assert.equal((await project()).versions[0].id,id);
    await demo("failed");assert.equal((await project()).status,"failed");await click("#notice button");await settled();
    await demo("disconnected");p=await project();const candidate=p.versions[0].id;await click("#notice button");await settled();assert.equal((await project()).versions[0].id,candidate);
  });
  await check("real refresh resumes an unfinished task without duplicate versions",async()=>{
    await demo("partial");const id=(await project()).versions[0].id;await cdp("Page.reload");await until(()=>evaluate('document.readyState==="complete" && !!document.querySelector("#generate")'),"reload");await settled();const p=await project();assert.equal(p.versions.length,1);assert.equal(p.versions[0].id,id);
  });
  await check("settings save and automatic iteration stops at the target",async()=>{
    await click("#new-project");await fill("#prompt","一张白蜡木茶桌");await click("#settings-open");if(!await evaluate('document.querySelector(".parameters").open'))await click(".parameters summary");await click("#auto-iterate");await click("#settings-done");await click("#generate");await settled();const p=await project();assert.equal(p.versions.length,2);assert.equal(p.versions[1].design.type,"table");assert(p.versions[1].score>=85);
  });
  await check("390px shorter viewport and reduced motion keep bottom actions reachable",async()=>{
    await cdp("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    await viewport(390,640);await click("#new-project");await fill("#prompt","一把圈椅");await topShot("mobile-short-empty");await click("#generate");await settled();await click("#select-tool");await fill("#local-edit","扶手变薄");await click("#apply-local");await settled();await layout();
    assert(await evaluate('getComputedStyle(document.querySelector("#review-pane")).animationName === "none"'));
  });
  await check("storage failures stay visible and leave export available",async()=>{
    await click('.workspace-tabs [data-tab="brief"]');await evaluate('Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")};');await fill("#prompt","存储不可用时保留需求");assert.match(await evaluate('document.querySelector("#notice").textContent'),/无法保存/);await click("#export-open");assert(await modalVisible());await click("#modal-close");
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push("No uncaught browser errors or external page requests");
  await writeFile(join(out,"verification.json"),JSON.stringify({passed:checks.length,checks,errors,external,viewports:["1440x900","390x844","390x640"],date:new Date().toISOString()},null,2));
  console.log(`All ${checks.length} verification groups passed.`);
} finally {
  if(ws?.readyState===WebSocket.OPEN)ws.close();chrome.kill();await new Promise(r=>setTimeout(r,700));server.close();await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
