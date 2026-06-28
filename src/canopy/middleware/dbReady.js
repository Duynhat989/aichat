const { isCanopyDatabaseReady, getLastDbError } = require('../config/database');
const { fail } = require('../utils/response');

function dbReady(req, res, next) {
  if (!isCanopyDatabaseReady()) {
    const detail = getLastDbError();
    const message = detail
      ? `Canopy database is not ready: ${detail}`
      : 'Canopy database is not ready. Check MySQL connection.';
    return fail(res, 'DB_UNAVAILABLE', message, 503);
  }
  next();
}

module.exports = { dbReady };
