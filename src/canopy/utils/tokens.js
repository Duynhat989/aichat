const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.CANOPY_JWT_SECRET || process.env.JWT_SECRET || 'canopy-dev-secret-change-me';
const ACCESS_TTL = process.env.CANOPY_ACCESS_TTL || '30d';
const REFRESH_DAYS = Number(process.env.CANOPY_REFRESH_DAYS || 90);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(48).toString('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, legacyGreenId: user.legacyGreenId },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

module.exports = {
  hashToken,
  randomToken,
  signAccessToken,
  verifyAccessToken,
  refreshExpiresAt,
  ACCESS_TTL,
  REFRESH_DAYS
};
