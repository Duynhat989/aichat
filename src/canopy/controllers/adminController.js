const { ok, fail } = require('../utils/response');
const { getStats, listUsers, createUserAdmin, deleteUserAdmin, setUserPremiumAdmin, formatUser } = require('../services/userService');
const { getDailyActiveStats } = require('../services/activityService');
const { sendToUser, broadcast, listNotificationLogs } = require('../services/notificationService');

const adminController = {
  async stats(req, res) {
    const data = await getStats();
    return ok(res, { data });
  },

  async users(req, res) {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const search = String(req.query.search || '');
    const data = await listUsers({ page, limit, search });
    return ok(res, { data });
  },

  async createUser(req, res) {
    try {
      const { deviceId, platform, appVersion, locale, legacyUserId, isPremium } = req.body || {};
      const data = await createUserAdmin({ deviceId, platform, appVersion, locale, legacyUserId, isPremium });
      return ok(res, { data }, 201);
    } catch (e) {
      const status = e.code === 'CONFLICT' ? 409 : e.code === 'VALIDATION' ? 400 : 500;
      return fail(res, e.code || 'CREATE_FAILED', e.message, status);
    }
  },

  async deleteUser(req, res) {
    try {
      const userId = String(req.params.userId || '');
      if (!userId) return fail(res, 'VALIDATION', 'userId is required');
      const data = await deleteUserAdmin(userId);
      return ok(res, { data, message: 'User deleted' });
    } catch (e) {
      const status = e.code === 'NOT_FOUND' ? 404 : 500;
      return fail(res, e.code || 'DELETE_FAILED', e.message, status);
    }
  },

  async setPremium(req, res) {
    try {
      const userId = String(req.params.userId || '');
      if (!userId) return fail(res, 'VALIDATION', 'userId is required');
      const { isPremium, premiumPlan, premiumExpiresAt, days } = req.body || {};
      if (typeof isPremium !== 'boolean') {
        return fail(res, 'VALIDATION', 'isPremium (boolean) is required');
      }
      const data = await setUserPremiumAdmin(userId, { isPremium, premiumPlan, premiumExpiresAt, days });
      return ok(res, { data, message: isPremium ? 'Premium granted' : 'Premium revoked' });
    } catch (e) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'VALIDATION' ? 400 : 500;
      return fail(res, e.code || 'PREMIUM_FAILED', e.message, status);
    }
  },

  async dailyActive(req, res) {
    const days = Number(req.query.days || 14);
    const data = await getDailyActiveStats({ days });
    return ok(res, { data });
  },

  async send(req, res) {
    const { userId, title, body, data } = req.body || {};
    if (!userId || !title || !body) {
      return fail(res, 'VALIDATION', 'userId, title, body are required');
    }
    const result = await sendToUser(userId, { title, body, data: data || {} });
    return ok(res, { data: result });
  },

  async broadcast(req, res) {
    const { title, body, data, locale, isPremium } = req.body || {};
    if (!title || !body) {
      return fail(res, 'VALIDATION', 'title and body are required');
    }
    const filter = {};
    if (locale) filter.locale = locale;
    if (typeof isPremium === 'boolean') filter.isPremium = isPremium;
    const result = await broadcast({ title, body, data: data || {}, ...filter });
    return ok(res, { data: result });
  },

  async logs(req, res) {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const data = await listNotificationLogs({ page, limit });
    return ok(res, { data });
  },

  async findUser(req, res) {
    const q = String(req.query.q || '');
    if (!q) return fail(res, 'VALIDATION', 'q is required');
    const { findUserByIdentifier } = require('../services/userService');
    const user = await findUserByIdentifier(q);
    if (!user) return fail(res, 'NOT_FOUND', 'User not found', 404);
    return ok(res, { data: formatUser(user) });
  }
};

module.exports = adminController;
