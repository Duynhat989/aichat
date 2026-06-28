const { getModels } = require('../models');

function isPremiumActive(user) {
  if (!user.isPremium) return false;
  if (!user.premiumExpiresAt) return true;
  return new Date(user.premiumExpiresAt) > new Date();
}

function formatUser(user) {
  return {
    id: user.id,
    userId: user.legacyGreenId || user.id,
    legacyGreenId: user.legacyGreenId,
    deviceId: user.deviceId,
    platform: user.platform,
    locale: user.locale,
    appVersion: user.appVersion,
    isPremium: isPremiumActive(user),
    premiumPlan: user.premiumPlan,
    premiumExpiresAt: user.premiumExpiresAt,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt
  };
}

async function getProfile(userId) {
  const { User } = getModels();
  const user = await User.findByPk(userId);
  if (!user) return null;
  return formatUser(user);
}

async function updateHeartbeat(user, { appVersion, locale }) {
  await user.update({
    appVersion: appVersion || user.appVersion,
    locale: locale || user.locale,
    lastSeenAt: new Date()
  });
  return formatUser(user);
}

async function deleteAccount(user) {
  const { PushToken, RefreshToken, Subscription, UsageDaily, NotificationLog } = getModels();
  const uid = user.id;
  await PushToken.destroy({ where: { userId: uid } });
  await RefreshToken.destroy({ where: { userId: uid } });
  await Subscription.destroy({ where: { userId: uid } });
  await UsageDaily.destroy({ where: { userId: uid } });
  await NotificationLog.destroy({ where: { userId: uid } });
  await user.destroy();
}

async function upsertPushToken(userId, { token, provider, enabled }) {
  const { PushToken } = getModels();
  const existing = await PushToken.findOne({ where: { userId, token } });
  if (existing) {
    await existing.update({ enabled: enabled !== false, revokedAt: null, provider: provider || 'fcm' });
    return existing;
  }
  return PushToken.create({
    userId,
    token,
    provider: provider || 'fcm',
    enabled: enabled !== false
  });
}

async function revokePushToken(userId, token) {
  const { PushToken } = getModels();
  const row = await PushToken.findOne({ where: { userId, token } });
  if (!row) return false;
  await row.update({ enabled: false, revokedAt: new Date() });
  return true;
}

async function listUsers({ page = 1, limit = 20, search = '' }) {
  const { User } = getModels();
  const where = {};
  if (search) {
    where[Op.or] = [
      { legacyGreenId: { [Op.like]: `%${search}%` } },
      { deviceId: { [Op.like]: `%${search}%` } }
    ];
  }
  const offset = (page - 1) * limit;
  const { count, rows } = await User.findAndCountAll({
    where,
    order: [['lastSeenAt', 'DESC']],
    limit,
    offset
  });
  return { total: count, users: rows.map(formatUser) };
}

async function getStats() {
  const { User, NotificationLog } = getModels();
  const totalUsers = await User.count();
  const premiumUsers = await User.count({ where: { isPremium: true } });
  const notificationsSent = await NotificationLog.count({ where: { status: 'sent' } });
  return { totalUsers, premiumUsers, notificationsSent };
}

module.exports = {
  isPremiumActive,
  formatUser,
  getProfile,
  updateHeartbeat,
  deleteAccount,
  upsertPushToken,
  revokePushToken,
  listUsers,
  getStats
};
