const { getOllamaModels } = require('./models');

const DEFAULT_MAX_CONCURRENT = 10;

const ramKeys = new Map();
const waitQueue = [];

let loaded = false;
let rrCursor = 0;

function maskKey(apiKey) {
  const s = String(apiKey || '');
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function toPublicKey(entry) {
  return {
    id: entry.id,
    label: entry.label,
    apiKeyMasked: maskKey(entry.apiKey),
    enabled: entry.enabled,
    maxConcurrent: entry.maxConcurrent,
    running: entry.running,
    queued: waitQueue.filter((w) => w.meta?.preferredKeyId === entry.id).length,
    note: entry.note,
    totalRequests: entry.totalRequests,
    successCount: entry.successCount,
    errorCount: entry.errorCount,
    lastUsedAt: entry.lastUsedAt,
    lastError: entry.lastError
  };
}

function pickAvailableKey(preferredKeyId) {
  const enabled = [...ramKeys.values()].filter((k) => k.enabled);
  if (!enabled.length) return null;

  if (preferredKeyId) {
    const preferred = ramKeys.get(preferredKeyId);
    if (preferred?.enabled && preferred.running < preferred.maxConcurrent) {
      return preferred;
    }
  }

  const free = enabled.filter((k) => k.running < k.maxConcurrent);
  if (!free.length) return null;

  free.sort((a, b) => {
    const da = a.running / a.maxConcurrent;
    const db = b.running / b.maxConcurrent;
    if (da !== db) return da - db;
    return 0;
  });

  const minLoad = free[0].running / free[0].maxConcurrent;
  const ties = free.filter((k) => k.running / k.maxConcurrent === minLoad);
  rrCursor = (rrCursor + 1) % ties.length;
  return ties[rrCursor];
}

function drainQueue() {
  while (waitQueue.length > 0) {
    const key = pickAvailableKey(waitQueue[0].meta?.preferredKeyId);
    if (!key) break;
    const waiter = waitQueue.shift();
    const lease = takeLease(key, waiter.meta);
    waiter.resolve(lease);
  }
}

function takeLease(key, meta = {}) {
  key.running += 1;
  key.totalRequests += 1;
  key.lastUsedAt = new Date().toISOString();
  const leaseId = `${key.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    leaseId,
    id: key.id,
    label: key.label,
    apiKey: key.apiKey,
    maxConcurrent: key.maxConcurrent,
    endpoint: meta.endpoint || 'aichat',
    startedAt: Date.now()
  };
}

async function loadFromDb() {
  const { OllamaKey } = getOllamaModels();
  const rows = await OllamaKey.findAll({ order: [['createdAt', 'ASC']] });

  const next = new Map();
  for (const row of rows) {
    const prev = ramKeys.get(row.id);
    next.set(row.id, {
      id: row.id,
      label: row.label,
      apiKey: row.apiKey,
      enabled: !!row.enabled,
      maxConcurrent: Math.max(1, Number(row.maxConcurrent) || DEFAULT_MAX_CONCURRENT),
      note: row.note || null,
      running: prev?.running || 0,
      totalRequests: Number(row.totalRequests) || 0,
      successCount: Number(row.successCount) || 0,
      errorCount: Number(row.errorCount) || 0,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
      lastError: row.lastError || null
    });
  }
  ramKeys.clear();
  for (const [id, entry] of next) ramKeys.set(id, entry);
  loaded = true;
  drainQueue();
  return getRealtimeSnapshot();
}

async function seedDefaultsIfEmpty() {
  const { OllamaKey, OllamaModel, OllamaSetting } = getOllamaModels();

  const modelCount = await OllamaModel.count();
  if (modelCount === 0) {
    const upstream = 'gemma3:27b';
    await OllamaModel.bulkCreate([
      { id: 'onewise_v1', name: 'OneWise V1', upstreamModel: upstream, enabled: true, sortOrder: 1 },
      { id: 'onewise_v2', name: 'OneWise V2', upstreamModel: upstream, enabled: true, sortOrder: 2 }
    ]);
  }

  const defaults = {
    ollama_base_url: 'https://ollama.com',
    ollama_timeout_ms: '120000',
    default_max_concurrent: String(DEFAULT_MAX_CONCURRENT),
    history_retention_days: '30'
  };
  for (const [key, value] of Object.entries(defaults)) {
    const exists = await OllamaSetting.findByPk(key);
    if (!exists) {
      await OllamaSetting.create({ key, value });
    }
  }

  await loadFromDb();
}

function acquire(opts = {}) {
  const waitMs = Number(opts.waitMs ?? 0);
  const meta = { endpoint: opts.endpoint || 'aichat', preferredKeyId: opts.preferredKeyId };

  return new Promise((resolve, reject) => {
    if (!loaded) {
      return reject(Object.assign(new Error('Key pool not loaded'), { statusCode: 503 }));
    }

    const immediate = pickAvailableKey(meta.preferredKeyId);
    if (immediate) {
      return resolve(takeLease(immediate, meta));
    }

    const enabled = [...ramKeys.values()].filter((k) => k.enabled);
    if (!enabled.length) {
      return reject(Object.assign(new Error('No enabled'), { statusCode: 503 }));
    }

    let timer = null;
    const waiter = {
      meta,
      resolve: (lease) => {
        if (timer) clearTimeout(timer);
        resolve(lease);
      },
      reject: (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    };
    waitQueue.push(waiter);

    if (waitMs > 0) {
      timer = setTimeout(() => {
        const idx = waitQueue.indexOf(waiter);
        if (idx >= 0) waitQueue.splice(idx, 1);
        reject(Object.assign(new Error('All are busy'), { statusCode: 503 }));
      }, waitMs);
    }
  });
}

async function release(lease, result = {}) {
  if (!lease?.id) return;
  const key = ramKeys.get(lease.id);
  if (key) {
    key.running = Math.max(0, key.running - 1);
    if (result.ok === false) {
      key.errorCount += 1;
      key.lastError = result.error || 'unknown error';
    } else {
      key.successCount += 1;
      key.lastError = null;
    }
  }

  try {
    const { OllamaKey } = getOllamaModels();
    if (key) {
      await OllamaKey.update(
        {
          totalRequests: key.totalRequests,
          successCount: key.successCount,
          errorCount: key.errorCount,
          lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : new Date(),
          lastError: key.lastError
        },
        { where: { id: key.id } }
      );
    }
  } catch (e) {
    console.error('keyPool release persist error:', e.message);
  }

  drainQueue();
}

function getRealtimeSnapshot() {
  const keys = [...ramKeys.values()].map(toPublicKey);
  const enabledKeys = keys.filter((k) => k.enabled);
  const totalRunning = keys.reduce((s, k) => s + k.running, 0);
  const totalCapacity = enabledKeys.reduce((s, k) => s + k.maxConcurrent, 0);
  return {
    loaded,
    enabledKeyCount: enabledKeys.length,
    totalKeyCount: keys.length,
    totalRunning,
    totalCapacity,
    queueLength: waitQueue.length,
    keys
  };
}

function getRamKey(id) {
  return ramKeys.get(id) || null;
}

function isLoaded() {
  return loaded;
}

module.exports = {
  DEFAULT_MAX_CONCURRENT,
  loadFromDb,
  seedDefaultsIfEmpty,
  acquire,
  release,
  getRealtimeSnapshot,
  getRamKey,
  isLoaded,
  maskKey
};
