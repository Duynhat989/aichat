const { DataTypes } = require('sequelize');

let User;
let PushToken;
let RefreshToken;
let Subscription;
let UsageDaily;
let NotificationLog;

function registerModels(sequelize) {
  User = sequelize.define(
    'CanopyUser',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      legacyGreenId: { type: DataTypes.STRING(32), unique: true, allowNull: true },
      deviceId: { type: DataTypes.STRING(128), allowNull: false },
      platform: { type: DataTypes.STRING(16), allowNull: false },
      locale: { type: DataTypes.STRING(8), allowNull: true },
      appVersion: { type: DataTypes.STRING(32), allowNull: true },
      isPremium: { type: DataTypes.BOOLEAN, defaultValue: false },
      premiumPlan: { type: DataTypes.STRING(32), allowNull: true },
      premiumExpiresAt: { type: DataTypes.DATE, allowNull: true },
      lastSeenAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'canopy_users', underscored: true }
  );

  PushToken = sequelize.define(
    'CanopyPushToken',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: false },
      token: { type: DataTypes.TEXT, allowNull: false },
      provider: { type: DataTypes.STRING(16), defaultValue: 'fcm' },
      enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'canopy_push_tokens', underscored: true }
  );

  RefreshToken = sequelize.define(
    'CanopyRefreshToken',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'canopy_refresh_tokens', underscored: true }
  );

  Subscription = sequelize.define(
    'CanopySubscription',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: false },
      productId: { type: DataTypes.STRING(64), allowNull: false },
      purchaseToken: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(32), defaultValue: 'active' },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
      rawGoogleResponse: { type: DataTypes.JSON, allowNull: true }
    },
    { tableName: 'canopy_subscriptions', underscored: true }
  );

  UsageDaily = sequelize.define(
    'CanopyUsageDaily',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: false },
      date: { type: DataTypes.STRING(10), allowNull: false },
      count: { type: DataTypes.INTEGER, defaultValue: 0 },
      requestIds: { type: DataTypes.JSON, defaultValue: [] }
    },
    { tableName: 'canopy_usage_daily', underscored: true, indexes: [{ unique: true, fields: ['user_id', 'date'] }] }
  );

  NotificationLog = sequelize.define(
    'CanopyNotificationLog',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(256), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      data: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false },
      fcmMessageId: { type: DataTypes.STRING(128), allowNull: true },
      fcmResponse: { type: DataTypes.JSON, allowNull: true },
      sentAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { tableName: 'canopy_notification_logs', underscored: true }
  );

  User.hasMany(PushToken, { foreignKey: 'userId', as: 'pushTokens' });
  User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
  User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
  User.hasMany(UsageDaily, { foreignKey: 'userId', as: 'usageDaily' });
}

function getModels() {
  if (!User) {
    const err = new Error('Canopy models not initialized');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  return { User, PushToken, RefreshToken, Subscription, UsageDaily, NotificationLog };
}

module.exports = { registerModels, getModels };
