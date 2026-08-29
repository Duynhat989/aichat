const { registerOllamaModels } = require('./models');
const keyPool = require('./keyPool');

async function initializeOllama(sequelize) {
  registerOllamaModels(sequelize);
  await sequelize.sync();
  await keyPool.seedDefaultsIfEmpty();
  console.log('pool loaded:', keyPool.getRealtimeSnapshot().totalKeyCount, 'keys');
  return true;
}

module.exports = { initializeOllama, keyPool };
