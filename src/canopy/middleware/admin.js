const { fail } = require('../utils/response');

function adminMiddleware(req, res, next) {
  const key = req.headers['x-admin-api-key'] || req.headers['x-api-key'] || '';
  const expected = process.env.CANOPY_ADMIN_API_KEY || '';
  if (!expected || key !== expected) {
    return fail(res, 'FORBIDDEN', 'Invalid admin API key', 403);
  }
  next();
}

module.exports = { adminMiddleware };
