const registerHits = new Map();

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function registerRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = Number(process.env.CANOPY_REGISTER_LIMIT_PER_HOUR || 10);
  let bucket = registerHits.get(ip);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    registerHits.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT', message: 'Too many registration attempts' }
    });
  }
  next();
}

module.exports = { registerRateLimit };
