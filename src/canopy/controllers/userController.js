const { ok, fail } = require('../utils/response');
const {
  formatUser,
  updateHeartbeat,
  deleteAccount,
  upsertPushToken,
  revokePushToken
} = require('../services/userService');
const { getSubscription } = require('../services/billingService');

const userController = {
  async me(req, res) {
    return ok(res, { data: formatUser(req.user) });
  },

  async patchMe(req, res) {
    try {
      const { appVersion, locale } = req.body || {};
      const data = await updateHeartbeat(req.user, { appVersion, locale });
      return ok(res, { data });
    } catch (e) {
      return fail(res, 'UPDATE_FAILED', e.message, 500);
    }
  },

  async deleteMe(req, res) {
    try {
      await deleteAccount(req.user);
      return ok(res, { message: 'Account deleted' });
    } catch (e) {
      return fail(res, 'DELETE_FAILED', e.message, 500);
    }
  },

  async putPushToken(req, res) {
    const { token, provider, enabled } = req.body || {};
    if (!token) return fail(res, 'VALIDATION', 'token is required');
    await upsertPushToken(req.user.id, { token, provider, enabled });
    return ok(res, { message: 'Push token registered' });
  },

  async deletePushToken(req, res) {
    const { token } = req.body || {};
    if (!token) return fail(res, 'VALIDATION', 'token is required');
    await revokePushToken(req.user.id, token);
    return ok(res, { message: 'Push token revoked' });
  },

  async subscription(req, res) {
    const data = await getSubscription(req.user);
    return ok(res, { data });
  }
};

module.exports = userController;
