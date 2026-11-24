const QUOTA_WINDOW_MS = 60 * 60 * 1000;
const QUOTA_LIMITS = Object.freeze({ generation: 20, review: 20 });
const QUOTA_LABELS = Object.freeze({ generation: "生成", review: "评审" });

function createUsage(mode, maxRounds) {
  return { version: 1, reserved: { generation: mode === "agent" ? maxRounds : 1, review: mode === "agent" ? maxRounds : 0 }, calls: [], settled: false };
}

// Pre-ledger task files cannot reveal exact dispatch times. Migrate once using
// saved rounds/phase, explicitly marking the estimate instead of silently resetting.
function migrateUsage(task) {
  const usage = createUsage(task.mode, task.request?.maxRounds || 2);
  const count = task.status === "queued" ? 0 : task.mode === "agent"
    ? Math.max(task.round || 0, task.result?.completedRounds || 0, task.result?.rounds?.length || 0, 1) : 1;
  const reviewed = task.result?.rounds?.filter(round => !round.evaluation?.evaluationPending).length || 0;
  for (let i = 0; i < count; i++) usage.calls.push({ kind: "generation", at: task.createdAt });
  for (let i = 0; i < Math.max(reviewed, task.phase === "reviewing" ? count : 0); i++) usage.calls.push({ kind: "review", at: task.createdAt });
  usage.inferred = true;
  return usage;
}

function quotaEntries(tasks, ownerId, kind, now) {
  const entries = [];
  for (const task of tasks) {
    if (task.ownerId !== ownerId || !task.usage) continue;
    const calls = task.usage.calls.filter(call => call.kind === kind);
    entries.push(...calls.filter(call => Date.parse(call.at) + QUOTA_WINDOW_MS > now).map(call => Date.parse(call.at) + QUOTA_WINDOW_MS));
    // Reservations remain held even when a task runs longer than an hour.
    if (!task.usage.settled) {
      const unused = Math.max(0, task.usage.reserved[kind] - calls.length);
      entries.push(...Array(unused).fill(Infinity));
    }
  }
  return entries.sort((a, b) => a - b);
}

function quotaSnapshot(tasks, ownerId, now) {
  return Object.fromEntries(Object.keys(QUOTA_LIMITS).map(kind => {
    const entries = quotaEntries(tasks, ownerId, kind, now);
    return [kind, { limit: QUOTA_LIMITS[kind], remaining: Math.max(0, QUOTA_LIMITS[kind] - entries.length),
      resetAt: Number.isFinite(entries[0]) ? new Date(entries[0]).toISOString() : null }];
  }));
}

function requireQuota(tasks, ownerId, wanted, now) {
  for (const kind of Object.keys(QUOTA_LIMITS)) {
    const entries = quotaEntries(tasks, ownerId, kind, now);
    const missing = (wanted[kind] || 0) - (QUOTA_LIMITS[kind] - entries.length);
    if (missing <= 0) continue;
    const recovery = entries[missing - 1];
    const wait = Number.isFinite(recovery) ? `约 ${Math.max(1, Math.ceil((recovery - now) / 60000))} 分钟后恢复` : "当前任务结束后恢复";
    const error = new Error(`本小时${QUOTA_LABELS[kind]}次数已用完，${wait}`);
    error.statusCode = 429;
    throw error;
  }
}

const ACCOUNT_QUOTA = Object.freeze({ check: requireQuota, snapshot: quotaSnapshot });

// Guests read the same task ledger, but only a saved image counts: a failed or
// cancelled run without a result gives its slot back. Running tasks hold their
// slot until they settle. `perSession` is per guest; `perDay` is shared by all
// guests for the server's calendar day.
function createGuestQuota({ perSession = 1, perDay = 10 } = {}) {
  const day = at => new Date(at).toDateString();
  const holds = task => Boolean(task.result) || !task.usage?.settled;
  function used(tasks, ownerId, now) {
    const today = day(now);
    return {
      session: tasks.filter(task => task.ownerId === ownerId && holds(task)).length,
      day: tasks.filter(task => holds(task) && (!task.usage?.settled || day(task.finishedAt || task.createdAt) === today)).length,
    };
  }
  function shortage(counts, wanted = 1) {
    if (counts.day + wanted > perDay) return "今日试用额度已用完";
    if (counts.session + wanted > perSession) return `试用可生成 ${perSession} 张，已用完；登录后可继续`;
    return "";
  }
  return {
    check(tasks, ownerId, reserved, now) {
      const message = shortage(used(tasks, ownerId, now), reserved.generation || 0);
      if (message) { const error = new Error(message); error.statusCode = 429; throw error; }
    },
    snapshot(tasks, ownerId, now) {
      const counts = used(tasks, ownerId, now);
      const remaining = Math.max(0, Math.min(perSession - counts.session, perDay - counts.day));
      return {
        generation: { limit: perSession, remaining, resetAt: null, message: remaining ? `试用可生成 ${remaining} 张，登录后可继续` : shortage(counts) },
        review: { limit: 0, remaining: 0, resetAt: null },
      };
    },
  };
}

module.exports = { ACCOUNT_QUOTA, QUOTA_WINDOW_MS, QUOTA_LIMITS, createGuestQuota, createUsage, migrateUsage, quotaSnapshot, requireQuota };
