require('dotenv').config();

async function initializeDatabase() {
  return true;
}

function isDatabaseReady() {
  return false;
}

module.exports = {
  initializeDatabase,
  isDatabaseReady
};
