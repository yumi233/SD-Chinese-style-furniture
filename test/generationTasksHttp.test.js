const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createApp}=require('../src/http/app');const {HistoryStore}=require('../src/historyStore');const {UserStore}=require('../src/userStore');
test('HTTP task endpoints enforce sessions, ownership, Origin and ordinary-user CLI access',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'furniture-task-http-'));
 const userStore=new UserStore({filePath:path.join(root,'users.json')});
 const historyStore=new HistoryStore({rootDir:path.join(root,'history')});
 const gateway={listEngines:()=>({defaultEngine:'codexCli',modes:['automatic1111','codexCli'],agentEngines:['codexCli']}),generate:async request=>({request,images:[{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}]})};
 const app=createApp({rootDir:root,publicDir:path.join(root,'public'),userStore,historyStore,gateway});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const call=(url,method='GET',body,cookie,origin)=>fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('/generation-tasks')).status,401);
 assert.equal((await call('/generation-tasks','POST',{prompt:'chair',requestId:'task_request_123456'})).status,401);
 async function register(email){const res=await call('/auth/register','POST',{email,password:'fixture-safe-password',displayName:'Fixture'});assert.equal(res.status,201);return res.headers.get('set-cookie').split(';')[0];}
 const alice=await register('task-alice@example.invalid'),bob=await register('task-bob@example.invalid');
 assert.equal((await call('/config','GET',undefined,alice)).status,403);
 assert.equal((await call('/generation-tasks','POST',{prompt:'chair',requestId:'task_request_123456'},alice,'http://evil.test')).status,403);
 const created=await call('/generation-tasks','POST',{prompt:'现代中式圈椅',requestId:'task_request_123456'},alice);assert.equal(created.status,202);
 const {task}=await created.json();
 assert.equal((await call('/generation-tasks/'+task.id,'GET',undefined,bob)).status,404);
 assert.equal((await call('/generation-tasks/'+task.id+'/stop','POST',{},bob)).status,404);
 assert.deepEqual((await(await call('/generation-tasks','GET',undefined,bob)).json()).tasks,[]);
 const own=await call('/generation-tasks/'+task.id,'GET',undefined,alice);assert.equal(own.status,200);assert.equal(own.headers.get('cache-control'),'private, no-store');
 const duplicate=await(await call('/generation-tasks','POST',{prompt:'现代中式圈椅',requestId:'task_request_123456'},alice)).json();assert.equal(duplicate.task.id,task.id);
});
