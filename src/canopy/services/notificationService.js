const { Op } = require('sequelize');
const { getModels } = require('../models');
const { sendFcm } = require('./fcmService');

async function resolveUserId(userId) {
  const { User } = getModels();
  const byPk = await User.findByPk(userId);
  if (byPk) return byPk.id;
  const byLegacy = await User.findOne({ where: { legacyGreenId: userId } });
  return byLegacy?.id || userId;
}

async function sendToUser(userId, { title, body, data }) {
  const { PushToken, NotificationLog } = getModels();
  const resolvedId = await resolveUserId(userId);
  const tokens = await PushToken.findAll({
    where: { userId: resolvedId, enabled: true, revokedAt: null }
  });
  if (!tokens.length) {
    await NotificationLog.create({
      userId: resolvedId,
      title,
      body,
      data,
      status: 'no_token',
      sentAt: new Date()
    });
    return { sent: 0, failed: 0, noToken: true };
  }
  let sent = 0;
  let failed = 0;
  for (const row of tokens) {
    const result = await sendFcm({ token: row.token, title, body, data });
    await NotificationLog.create({
      userId: resolvedId,
      title,
      body,
      data,
      status: result.status,
      fcmMessageId: result.fcmMessageId || null,
      fcmResponse: result.fcmResponse || null,
      sentAt: new Date()
    });
    if (result.status === 'sent') sent += 1;
    else failed += 1;
    if (result.invalidToken) {
      await row.update({ revokedAt: new Date(), enabled: false });
    }
  }
  return { sent, failed };
}

async function broadcast({ title, body, data, locale, isPremium }) {
  const { User } = getModels();
  const where = {};
  if (locale) where.locale = locale;
  if (typeof isPremium === 'boolean') where.isPremium = isPremium;
  const users = await User.findAll({ where, attributes: ['id'] });
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    const r = await sendToUser(u.id, { title, body, data });
    sent += r.sent || 0;
    failed += r.failed || 0;
  }
  return { users: users.length, sent, failed };
}

async function listNotificationLogs({ page = 1, limit = 30 }) {
  const { NotificationLog } = getModels();
  const offset = (page - 1) * limit;
  const { count, rows } = await NotificationLog.findAndCountAll({
    order: [['sentAt', 'DESC']],
    limit,
    offset
  });
  return { total: count, logs: rows };
}

module.exports = { sendToUser, broadcast, listNotificationLogs };
