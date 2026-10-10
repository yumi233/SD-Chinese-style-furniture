const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../public/js/modules/auth-coordinator.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test("late anonymous session response cannot overwrite a successful login", async () => {
  const { AuthCoordinator } = await modulePromise;
  const gate = new AuthCoordinator();
  const lookup = deferred();
  const oldRead = gate.read(() => lookup.promise);
  const login = await gate.write(async () => ({ user: { id: "new-session" } }));
  lookup.resolve({ user: null });
  assert.equal(login.user.id, "new-session");
  assert.equal(await oldRead, null);
});

test("overlapping account submissions only execute once and release busy state", async () => {
  const { AuthCoordinator } = await modulePromise;
  const pending = [];
  const gate = new AuthCoordinator(value => pending.push(value));
  const response = deferred();
  let writes = 0;
  const first = gate.write(() => { writes++; return response.promise; });
  assert.equal(await gate.write(() => { writes++; }), null);
  assert.equal(await gate.read(() => { throw new Error("should not fetch while logging in"); }), null);
  response.resolve({ ok: true });
  await first;
  assert.equal(writes, 1);
  assert.deepEqual(pending, [true, false]);
});

test("late failed lookup is ignored, while current failures remain visible", async () => {
  const { AuthCoordinator } = await modulePromise;
  const gate = new AuthCoordinator();
  const old = deferred();
  const read = gate.read(() => old.promise);
  await gate.write(async () => ({ ok: true }));
  old.reject(new Error("old connection failed"));
  assert.equal(await read, null);
  await assert.rejects(gate.read(async () => { throw new Error("current connection failed"); }), /current connection failed/);
});

test("account write failures restore controls and permit a later retry", async () => {
  const { AuthCoordinator } = await modulePromise;
  const gate = new AuthCoordinator();
  await assert.rejects(gate.write(async () => { throw new Error("wrong password"); }), /wrong password/);
  assert.equal(gate.pending, false);
  assert.deepEqual(await gate.write(async () => ({ ok: true })), { ok: true });
});
