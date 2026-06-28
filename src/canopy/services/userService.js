const { Op } = require('sequelize');
const { getModels } = require('../models');
const { generateGreenId } = require('../utils/greenId');
const { recordDailyActive } = require('./activityService');

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
  await recordDailyActive(user.id);
  return formatUser(user);
}

async function deleteAccount(user) {
  const { PushToken, RefreshToken, Subscription, UsageDaily, DailyActive, NotificationLog } = getModels();
  const uid = user.id;
  await PushToken.destroy({ where: { userId: uid } });
  await RefreshToken.destroy({ where: { userId: uid } });
  await Subscription.destroy({ where: { userId: uid } });
  await UsageDaily.destroy({ where: { userId: uid } });
  await DailyActive.destroy({ where: { userId: uid } });
  await NotificationLog.destroy({ where: { userId: uid } });
  await user.destroy();
}

async function findUserByIdentifier(identifier) {
  const { User } = getModels();
  return User.findOne({
    where: {
      [Op.or]: [{ id: identifier }, { legacyGreenId: identifier }, { deviceId: identifier }]
    }
  });
}

async function createUserAdmin({ deviceId, platform, appVersion, locale, legacyUserId, isPremium }) {
  const { User } = getModels();
  if (!deviceId || !platform || !appVersion) {
    const err = new Error('deviceId, platform, appVersion are required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!['android', 'ios'].includes(platform)) {
    const err = new Error('platform must be android or ios');
    err.code = 'VALIDATION';
    throw err;
  }
  const existing = await User.findOne({ where: { deviceId, platform } });
  if (existing) {
    const err = new Error('User already exists for this device and platform');
    err.code = 'CONFLICT';
    throw err;
  }
  let legacyGreenId = legacyUserId || generateGreenId();
  if (legacyUserId) {
    const taken = await User.findOne({ where: { legacyGreenId: legacyUserId } });
    if (taken) {
      const err = new Error('legacyUserId already in use');
      err.code = 'CONFLICT';
      throw err;
    }
  } else {
    while (await User.findOne({ where: { legacyGreenId } })) {
      legacyGreenId = generateGreenId();
    }
  }
  const user = await User.create({
    legacyGreenId,
    deviceId,
    platform,
    locale: locale || 'vi',
    appVersion,
    isPremium: Boolean(isPremium),
    lastSeenAt: new Date()
  });
  await recordDailyActive(user.id);
  return formatUser(user);
}

async function deleteUserAdmin(identifier) {
  const user = await findUserByIdentifier(identifier);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const snapshot = formatUser(user);
  await deleteAccount(user);
  return snapshot;
}

const PLAN_DAYS = {
  monthly: 30,
  yearly: 365,
  lifetime: null
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function setUserPremiumAdmin(identifier, { isPremium, premiumPlan, premiumExpiresAt, days }) {
  const user = await findUserByIdentifier(identifier);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (isPremium === false) {
    await user.update({ isPremium: false, premiumPlan: null, premiumExpiresAt: null });
    return formatUser(user);
  }

  const plan = premiumPlan || 'monthly';
  if (!['monthly', 'yearly', 'lifetime'].includes(plan)) {
    const err = new Error('premiumPlan must be monthly, yearly, or lifetime');
    err.code = 'VALIDATION';
    throw err;
  }

  let expiresAt = premiumExpiresAt ? new Date(premiumExpiresAt) : null;
  if (plan === 'lifetime') {
    expiresAt = null;
  } else if (!expiresAt && days) {
    expiresAt = addDays(new Date(), Number(days));
  } else if (!expiresAt) {
    const planDays = PLAN_DAYS[plan];
    expiresAt = planDays ? addDays(new Date(), planDays) : null;
  }

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    const err = new Error('premiumExpiresAt is invalid');
    err.code = 'VALIDATION';
    throw err;
  }

  await user.update({
    isPremium: true,
    premiumPlan: plan,
    premiumExpiresAt: expiresAt
  });

  const { Subscription } = getModels();
  await Subscription.create({
    userId: user.id,
    productId: plan === 'lifetime' ? 'lifetime' : `premium_${plan}`,
    purchaseToken: `admin-grant-${Date.now()}`,
    status: 'active',
    expiresAt,
    rawGoogleResponse: { source: 'admin', plan, grantedAt: new Date().toISOString() }
  });

  return formatUser(user);
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
  const { getDailyActiveStats } = require('./activityService');
  const totalUsers = await User.count();
  const premiumUsers = await User.count({ where: { isPremium: true } });
  const notificationsSent = await NotificationLog.count({ where: { status: 'sent' } });
  const daily = await getDailyActiveStats({ days: 14 });
  return { totalUsers, premiumUsers, notificationsSent, activeToday: daily.today, activeYesterday: daily.yesterday };
}

module.exports = {
  isPremiumActive,
  formatUser,
  getProfile,
  updateHeartbeat,
  deleteAccount,
  findUserByIdentifier,
  createUserAdmin,
  deleteUserAdmin,
  setUserPremiumAdmin,
  upsertPushToken,
  revokePushToken,
  listUsers,
  getStats
};
