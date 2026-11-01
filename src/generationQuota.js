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

module.exports = { QUOTA_WINDOW_MS, QUOTA_LIMITS, createUsage, migrateUsage, quotaSnapshot, requireQuota };
