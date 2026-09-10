const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const STORES_DIR = path.join(process.cwd(), 'stores');
const FILE_TTL_MS = Number(process.env.FILE_STORE_TTL_MS || 10 * 60 * 1000);

function ensureStoresDir() {
  if (!fs.existsSync(STORES_DIR)) {
    fs.mkdirSync(STORES_DIR, { recursive: true });
  }
  return STORES_DIR;
}

function fileDir(fileId) {
  const safe = String(fileId || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe !== fileId) {
    const err = new Error('Invalid fileId');
    err.statusCode = 400;
    throw err;
  }
  return path.join(STORES_DIR, safe);
}

function metaPath(fileId) {
  return path.join(fileDir(fileId), 'meta.json');
}

async function saveUpload({ fileId, type, originalname, mimetype, ext, buffer }) {
  ensureStoresDir();
  const dir = fileDir(fileId);
  await fsp.mkdir(dir, { recursive: true });

  const safeExt = (ext || path.extname(originalname || '') || '').toLowerCase();
  const storedName = `original${safeExt || ''}`;
  const storedPath = path.join(dir, storedName);

  await fsp.writeFile(storedPath, buffer);

  const meta = {
    fileId,
    type,
    name: originalname || storedName,
    mimeType: mimetype || '',
    ext: safeExt,
    storedName,
    size: buffer.length,
    createdAt: new Date().toISOString()
  };
  await fsp.writeFile(metaPath(fileId), JSON.stringify(meta, null, 2), 'utf8');

  scheduleExpire(fileId);
  return meta;
}

async function loadMeta(fileId) {
  const p = metaPath(fileId);
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadBuffer(fileId) {
  const meta = await loadMeta(fileId);
  if (!meta) return null;
  const storedPath = path.join(fileDir(fileId), meta.storedName);
  try {
    const buffer = await fsp.readFile(storedPath);
    return { meta, buffer };
  } catch {
    return null;
  }
}

async function removeFile(fileId) {
  const dir = fileDir(fileId);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

const expireTimers = new Map();

function scheduleExpire(fileId, ttlMs = FILE_TTL_MS) {
  if (expireTimers.has(fileId)) {
    clearTimeout(expireTimers.get(fileId));
  }
  const t = setTimeout(() => {
    expireTimers.delete(fileId);
    removeFile(fileId).catch(() => {});
  }, ttlMs);
  if (typeof t.unref === 'function') t.unref();
  expireTimers.set(fileId, t);
}

ensureStoresDir();

module.exports = {
  STORES_DIR,
  FILE_TTL_MS,
  ensureStoresDir,
  saveUpload,
  loadMeta,
  loadBuffer,
  removeFile,
  scheduleExpire
};
