const { fail } = require('../utils/response');
const { verifyAccessToken } = require('../utils/tokens');
const { getModels } = require('../models');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return fail(res, 'UNAUTHORIZED', 'Missing access token', 401);
  }
  try {
    const payload = verifyAccessToken(token);
    const { User } = getModels();
    const user = await User.findByPk(payload.sub);
    if (!user) {
      return fail(res, 'UNAUTHORIZED', 'User not found', 401);
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return fail(res, 'TOKEN_EXPIRED', 'Access token expired', 401);
    }
    return fail(res, 'UNAUTHORIZED', 'Invalid access token', 401);
  }
}

module.exports = { authMiddleware };
