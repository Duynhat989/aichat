require('dotenv').config();
const { Sequelize } = require('sequelize');
const { registerModels } = require('../models');

let lastDbError = null;

function buildSequelize() {
  const socketPath = process.env.MYSQL_SOCKET_PATH || '';
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const database = process.env.MYSQL_DATABASE || 'aichat';
  const username = process.env.MYSQL_USER || 'aichat';
  const password = process.env.MYSQL_PASSWORD ?? '';

  const options = {
    dialect: 'mysql',
    logging: String(process.env.MYSQL_LOGGING || 'false').toLowerCase() === 'true' ? console.log : false,
    dialectOptions: {
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000)
    },
    define: {
      underscored: true,
      timestamps: true
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  if (socketPath) {
    options.dialectOptions.socketPath = socketPath;
    return new Sequelize(database, username, password, options);
  }

  return new Sequelize(database, username, password, { ...options, host, port });
}

const sequelize = buildSequelize();
registerModels(sequelize);

let ready = false;

async function initializeCanopyDatabase() {
  const retries = Number(process.env.CANOPY_DB_RETRIES || 3);
  const delayMs = Number(process.env.CANOPY_DB_RETRY_MS || 2000);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await sequelize.authenticate();
      await sequelize.sync();
      ready = true;
      lastDbError = null;
      console.log('Canopy MySQL tables ready (canopy_*).');
      return true;
    } catch (error) {
      ready = false;
      lastDbError = error.message;
      console.error(`Canopy MySQL attempt ${attempt}/${retries} failed:`, error.message);
      if (process.env.MYSQL_PASSWORD === '' || process.env.MYSQL_PASSWORD === undefined) {
        console.error('Hint: set MYSQL_PASSWORD in .env for user', process.env.MYSQL_USER || 'aichat');
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return false;
}

function isCanopyDatabaseReady() {
  return ready;
}

function getLastDbError() {
  return lastDbError;
}

module.exports = {
  sequelize,
  initializeCanopyDatabase,
  isCanopyDatabaseReady,
  getLastDbError
};
