const { ok, fail } = require('../utils/response');
const { checkQuota, consumeQuota } = require('../services/usageService');

const usageController = {
  async check(req, res) {
    try {
      const data = await checkQuota(req.user);
      return ok(res, data);
    } catch (e) {
      return fail(res, 'QUOTA_ERROR', e.message, 500);
    }
  },

  async consume(req, res) {
    try {
      const { requestId } = req.body || {};
      const data = await consumeQuota(req.user, requestId);
      return ok(res, data);
    } catch (e) {
      if (e.code === 'DAILY_LIMIT') {
        return fail(res, 'DAILY_LIMIT', e.message, 403);
      }
      return fail(res, 'CONSUME_FAILED', e.message, 500);
    }
  }
};

module.exports = usageController;
