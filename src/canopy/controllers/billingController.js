const { ok, fail } = require('../utils/response');
const { verifyAndroidPurchase } = require('../services/billingService');

const billingController = {
  async verifyAndroid(req, res) {
    try {
      const { productId, purchaseToken, packageName } = req.body || {};
      if (!productId || !purchaseToken) {
        return fail(res, 'VALIDATION', 'productId and purchaseToken are required');
      }
      const data = await verifyAndroidPurchase(req.user, { productId, purchaseToken, packageName });
      return ok(res, { data });
    } catch (e) {
      return fail(res, e.code || 'BILLING_FAILED', e.message || 'Verification failed', 502);
    }
  }
};

module.exports = billingController;
