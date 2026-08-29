const { DataTypes } = require('sequelize');

let OllamaKey;
let OllamaModel;
let OllamaSetting;
let OllamaRequestHistory;
let OllamaStatsDaily;
let OllamaStatsEndpoint;
let registered = false;

function registerOllamaModels(sequelize) {
  if (registered) return;

  OllamaKey = sequelize.define(
    'OllamaKey',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      label: { type: DataTypes.STRING(128), allowNull: false, defaultValue: 'default' },
      apiKey: { type: DataTypes.TEXT, allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      maxConcurrent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      note: { type: DataTypes.STRING(512), allowNull: true },
      totalRequests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      successCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true }
    },
    { tableName: 'ollama_keys', underscored: true }
  );

  OllamaModel = sequelize.define(
    'OllamaModel',
    {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      name: { type: DataTypes.STRING(128), allowNull: false },
      upstreamModel: { type: DataTypes.STRING(128), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      note: { type: DataTypes.STRING(512), allowNull: true }
    },
    { tableName: 'ollama_models', underscored: true }
  );

  OllamaSetting = sequelize.define(
    'OllamaSetting',
    {
      key: { type: DataTypes.STRING(64), primaryKey: true },
      value: { type: DataTypes.TEXT, allowNull: false },
      note: { type: DataTypes.STRING(256), allowNull: true }
    },
    { tableName: 'ollama_settings', underscored: true, updatedAt: true, createdAt: true }
  );

  OllamaRequestHistory = sequelize.define(
    'OllamaRequestHistory',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      taskId: { type: DataTypes.STRING(80), allowNull: true },
      keyId: { type: DataTypes.UUID, allowNull: true },
      keyLabel: { type: DataTypes.STRING(128), allowNull: true },
      endpoint: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'aichat' },
      modelId: { type: DataTypes.STRING(64), allowNull: true },
      upstreamModel: { type: DataTypes.STRING(128), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'running' },
      errorMessage: { type: DataTypes.TEXT, allowNull: true },
      durationMs: { type: DataTypes.INTEGER, allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      endedAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: 'ollama_request_history',
      underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ['started_at'] },
        { fields: ['endpoint'] },
        { fields: ['key_id'] },
        { fields: ['status'] }
      ]
    }
  );

  OllamaStatsDaily = sequelize.define(
    'OllamaStatsDaily',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      date: { type: DataTypes.STRING(10), allowNull: false },
      totalRequests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      successCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalDurationMs: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
    },
    {
      tableName: 'ollama_stats_daily',
      underscored: true,
      indexes: [{ unique: true, fields: ['date'] }]
    }
  );

  OllamaStatsEndpoint = sequelize.define(
    'OllamaStatsEndpoint',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      date: { type: DataTypes.STRING(10), allowNull: false },
      endpoint: { type: DataTypes.STRING(64), allowNull: false },
      totalRequests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      successCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalDurationMs: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
    },
    {
      tableName: 'ollama_stats_endpoint',
      underscored: true,
      indexes: [{ unique: true, fields: ['date', 'endpoint'] }]
    }
  );

  registered = true;
}

function getOllamaModels() {
  if (!registered) {
    const err = new Error('Ollama models not initialized');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  return {
    OllamaKey,
    OllamaModel,
    OllamaSetting,
    OllamaRequestHistory,
    OllamaStatsDaily,
    OllamaStatsEndpoint
  };
}

module.exports = { registerOllamaModels, getOllamaModels };
