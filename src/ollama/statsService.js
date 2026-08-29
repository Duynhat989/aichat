const { Op } = require('sequelize');
const { getOllamaModels } = require('./models');
const { isCanopyDatabaseReady } = require('../canopy/config/database');

const ramDaily = new Map();
const ramEndpoint = new Map();

let flushStarted = false;
let flushing = false;

function todayStr() {
  const tz = process.env.CANOPY_TIMEZONE || 'Asia/Ho_Chi_Minh';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function emptyBucket() {
  return { totalRequests: 0, successCount: 0, errorCount: 0, totalDurationMs: 0 };
}

function bumpStats({ endpoint = 'aichat', ok = true, durationMs = 0 } = {}) {
  const date = todayStr();
  const ep = String(endpoint || 'aichat');
  const dur = Math.max(0, Number(durationMs) || 0);

  if (!ramDaily.has(date)) ramDaily.set(date, emptyBucket());
  const daily = ramDaily.get(date);
  daily.totalRequests += 1;
  daily.successCount += ok ? 1 : 0;
  daily.errorCount += ok ? 0 : 1;
  daily.totalDurationMs += dur;

  const key = `${date}::${ep}`;
  if (!ramEndpoint.has(key)) ramEndpoint.set(key, { date, endpoint: ep, ...emptyBucket() });
  const row = ramEndpoint.get(key);
  row.totalRequests += 1;
  row.successCount += ok ? 1 : 0;
  row.errorCount += ok ? 0 : 1;
  row.totalDurationMs += dur;
}

function snapshotRam() {
  return {
    daily: [...ramDaily.entries()].map(([date, v]) => ({ date, ...v })),
    endpoint: [...ramEndpoint.values()].map((v) => ({ ...v }))
  };
}

async function flushStatsToDb() {
  if (flushing || !isCanopyDatabaseReady()) return;
  if (ramDaily.size === 0 && ramEndpoint.size === 0) return;

  flushing = true;
  const dailySnap = new Map(ramDaily);
  const endpointSnap = new Map(ramEndpoint);
  ramDaily.clear();
  ramEndpoint.clear();

  try {
    const { OllamaStatsDaily, OllamaStatsEndpoint } = getOllamaModels();

    for (const [date, delta] of dailySnap) {
      if (!delta.totalRequests && !delta.successCount && !delta.errorCount && !delta.totalDurationMs) {
        continue;
      }
      const [row] = await OllamaStatsDaily.findOrCreate({
        where: { date },
        defaults: { date, totalRequests: 0, successCount: 0, errorCount: 0, totalDurationMs: 0 }
      });
      await row.increment({
        totalRequests: delta.totalRequests,
        successCount: delta.successCount,
        errorCount: delta.errorCount,
        totalDurationMs: delta.totalDurationMs
      });
    }

    for (const [, delta] of endpointSnap) {
      if (!delta.totalRequests && !delta.successCount && !delta.errorCount && !delta.totalDurationMs) {
        continue;
      }
      const [row] = await OllamaStatsEndpoint.findOrCreate({
        where: { date: delta.date, endpoint: delta.endpoint },
        defaults: {
          date: delta.date,
          endpoint: delta.endpoint,
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          totalDurationMs: 0
        }
      });
      await row.increment({
        totalRequests: delta.totalRequests,
        successCount: delta.successCount,
        errorCount: delta.errorCount,
        totalDurationMs: delta.totalDurationMs
      });
    }
  } catch (err) {
    console.error('Traffic flush error:', err.message);
    for (const [date, delta] of dailySnap) {
      if (!ramDaily.has(date)) ramDaily.set(date, emptyBucket());
      const cur = ramDaily.get(date);
      cur.totalRequests += delta.totalRequests;
      cur.successCount += delta.successCount;
      cur.errorCount += delta.errorCount;
      cur.totalDurationMs += delta.totalDurationMs;
    }
    for (const [key, delta] of endpointSnap) {
      if (!ramEndpoint.has(key)) {
        ramEndpoint.set(key, { date: delta.date, endpoint: delta.endpoint, ...emptyBucket() });
      }
      const cur = ramEndpoint.get(key);
      cur.totalRequests += delta.totalRequests;
      cur.successCount += delta.successCount;
      cur.errorCount += delta.errorCount;
      cur.totalDurationMs += delta.totalDurationMs;
    }
  } finally {
    flushing = false;
  }
}

function startFlushWorker() {
  if (flushStarted) return;
  flushStarted = true;
  setInterval(() => {
    flushStatsToDb().catch((e) => console.error('Traffic flush worker:', e.message));
  }, 10 * 1000);
}

startFlushWorker();

async function startHistory(payload) {
  const { OllamaRequestHistory } = getOllamaModels();
  const row = await OllamaRequestHistory.create({
    taskId: payload.taskId || null,
    keyId: payload.keyId || null,
    keyLabel: payload.keyLabel || null,
    endpoint: payload.endpoint || 'aichat',
    modelId: payload.modelId || null,
    upstreamModel: payload.upstreamModel || null,
    status: 'running',
    startedAt: new Date()
  });
  return row;
}

async function finishHistory(historyId, result = {}) {
  if (!historyId) return;
  const { OllamaRequestHistory } = getOllamaModels();
  const row = await OllamaRequestHistory.findByPk(historyId);
  if (!row) return;

  const endedAt = new Date();
  const durationMs = Math.max(0, endedAt.getTime() - new Date(row.startedAt).getTime());
  const ok = result.ok !== false;
  const status = ok ? 'completed' : 'error';

  await row.update({
    status,
    errorMessage: ok ? null : result.error || 'error',
    durationMs,
    endedAt,
    taskId: result.taskId || row.taskId
  });

  bumpStats({
    endpoint: row.endpoint || 'aichat',
    ok,
    durationMs
  });
}

function mergeDaily(dbRows, days) {
  const map = new Map();
  for (const r of dbRows) {
    const j = typeof r.toJSON === 'function' ? r.toJSON() : r;
    map.set(j.date, {
      date: j.date,
      totalRequests: Number(j.totalRequests) || 0,
      successCount: Number(j.successCount) || 0,
      errorCount: Number(j.errorCount) || 0,
      totalDurationMs: Number(j.totalDurationMs) || 0
    });
  }
  for (const [date, delta] of ramDaily) {
    if (!map.has(date)) {
      map.set(date, { date, ...emptyBucket() });
    }
    const cur = map.get(date);
    cur.totalRequests += delta.totalRequests;
    cur.successCount += delta.successCount;
    cur.errorCount += delta.errorCount;
    cur.totalDurationMs += delta.totalDurationMs;
  }
  return [...map.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, days);
}

function mergeEndpoint(dbRows) {
  const map = new Map();
  for (const r of dbRows) {
    const j = typeof r.toJSON === 'function' ? r.toJSON() : r;
    const key = `${j.date}::${j.endpoint}`;
    map.set(key, {
      date: j.date,
      endpoint: j.endpoint,
      totalRequests: Number(j.totalRequests) || 0,
      successCount: Number(j.successCount) || 0,
      errorCount: Number(j.errorCount) || 0,
      totalDurationMs: Number(j.totalDurationMs) || 0
    });
  }
  for (const [key, delta] of ramEndpoint) {
    if (!map.has(key)) {
      map.set(key, {
        date: delta.date,
        endpoint: delta.endpoint,
        ...emptyBucket()
      });
    }
    const cur = map.get(key);
    cur.totalRequests += delta.totalRequests;
    cur.successCount += delta.successCount;
    cur.errorCount += delta.errorCount;
    cur.totalDurationMs += delta.totalDurationMs;
  }
  return [...map.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.endpoint.localeCompare(b.endpoint);
  });
}

async function listHistory({ limit = 50, offset = 0, endpoint, status, keyId } = {}) {
  const { OllamaRequestHistory } = getOllamaModels();
  const where = {};
  if (endpoint) where.endpoint = endpoint;
  if (status) where.status = status;
  if (keyId) where.keyId = keyId;

  const { rows, count } = await OllamaRequestHistory.findAndCountAll({
    where,
    order: [['startedAt', 'DESC']],
    limit: Math.min(200, Math.max(1, Number(limit) || 50)),
    offset: Math.max(0, Number(offset) || 0)
  });
  return { total: count, items: rows };
}

async function listDailyStats({ days = 30 } = {}) {
  const { OllamaStatsDaily } = getOllamaModels();
  const n = Math.min(365, Math.max(1, Number(days) || 30));
  const rows = await OllamaStatsDaily.findAll({
    order: [['date', 'DESC']],
    limit: n
  });
  return mergeDaily(rows, n);
}

async function listEndpointStats({ date, days = 30 } = {}) {
  const { OllamaStatsEndpoint } = getOllamaModels();
  let rows;
  if (date) {
    rows = await OllamaStatsEndpoint.findAll({
      where: { date },
      order: [['endpoint', 'ASC']]
    });
  } else {
    const n = Math.min(365, Math.max(1, Number(days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - n);
    const sinceStr = since.toISOString().slice(0, 10);
    rows = await OllamaStatsEndpoint.findAll({
      where: { date: { [Op.gte]: sinceStr } },
      order: [
        ['date', 'DESC'],
        ['endpoint', 'ASC']
      ]
    });
  }
  const merged = mergeEndpoint(rows);
  if (date) return merged.filter((r) => r.date === date);
  return merged;
}

async function getSettings() {
  const { OllamaSetting } = getOllamaModels();
  const rows = await OllamaSetting.findAll({ order: [['key', 'ASC']] });
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return { map, rows };
}

async function upsertSetting(key, value, note) {
  const { OllamaSetting } = getOllamaModels();
  const [row] = await OllamaSetting.upsert({
    key,
    value: String(value),
    note: note || null
  });
  return row;
}

async function upsertSettings(obj) {
  const results = [];
  for (const [key, value] of Object.entries(obj || {})) {
    results.push(await upsertSetting(key, value));
  }
  return results;
}

module.exports = {
  todayStr,
  bumpStats,
  snapshotRam,
  flushStatsToDb,
  startHistory,
  finishHistory,
  listHistory,
  listDailyStats,
  listEndpointStats,
  getSettings,
  upsertSetting,
  upsertSettings
};
