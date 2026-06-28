const { ok, fail } = require('../utils/response');
const { getModels } = require('../models');
const { getStats, listUsers } = require('../services/userService');
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
    const { User } = getModels();
    const q = String(req.query.q || '');
    if (!q) return fail(res, 'VALIDATION', 'q is required');
    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [{ id: q }, { legacyGreenId: q }, { deviceId: q }]
      }
    });
    if (!user) return fail(res, 'NOT_FOUND', 'User not found', 404);
    const { formatUser } = require('../services/userService');
    return ok(res, { data: formatUser(user) });
  }
};

module.exports = adminController;
