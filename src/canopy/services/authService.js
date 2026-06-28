const { Op } = require('sequelize');
const { getModels } = require('../models');
const { generateGreenId } = require('../utils/greenId');
const { hashToken, randomToken, signAccessToken, refreshExpiresAt } = require('../utils/tokens');
const { recordDailyActive } = require('./activityService');

async function registerDevice({ deviceId, platform, appVersion, locale, legacyUserId }) {
  const { User, RefreshToken } = getModels();
  let user = await User.findOne({ where: { deviceId, platform } });
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    let legacyGreenId = legacyUserId || generateGreenId();
    if (legacyUserId) {
      const exists = await User.findOne({ where: { legacyGreenId: legacyUserId } });
      if (exists) legacyGreenId = legacyUserId;
    } else {
      while (await User.findOne({ where: { legacyGreenId } })) {
        legacyGreenId = generateGreenId();
      }
    }
    user = await User.create({
      legacyGreenId,
      deviceId,
      platform,
      locale: locale || 'vi',
      appVersion,
      lastSeenAt: new Date()
    });
  } else {
    await user.update({
      appVersion: appVersion || user.appVersion,
      locale: locale || user.locale,
      lastSeenAt: new Date()
    });
  }

  await recordDailyActive(user.id);

  const refreshToken = randomToken();
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt()
  });

  const accessToken = signAccessToken(user);
  return {
    userId: user.legacyGreenId || user.id,
    internalUserId: user.id,
    accessToken,
    refreshToken,
    isNewUser
  };
}

async function refreshAccessToken(refreshToken) {
  const { User, RefreshToken } = getModels();
  const tokenHash = hashToken(refreshToken);
  const row = await RefreshToken.findOne({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() }
    }
  });
  if (!row) {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH';
    throw err;
  }
  const user = await User.findByPk(row.userId);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'INVALID_REFRESH';
    throw err;
  }
  return {
    accessToken: signAccessToken(user),
    userId: user.legacyGreenId || user.id
  };
}

module.exports = { registerDevice, refreshAccessToken };
