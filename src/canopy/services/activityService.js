const { Op } = require('sequelize');
const { getModels } = require('../models');
const { todayKey } = require('../utils/quota');

async function recordDailyActive(userId) {
  const { DailyActive } = getModels();
  const date = todayKey();
  const [row] = await DailyActive.findOrCreate({
    where: { userId, date },
    defaults: { userId, date }
  });
  return row;
}

async function getDailyActiveStats({ days = 14 } = {}) {
  const { DailyActive } = getModels();
  const n = Math.min(Math.max(Number(days) || 14, 1), 90);
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(todayKey(d));
  }
  const startDate = dates[0];
  const rows = await DailyActive.findAll({
    attributes: ['date', [DailyActive.sequelize.fn('COUNT', DailyActive.sequelize.col('id')), 'count']],
    where: { date: { [Op.gte]: startDate } },
    group: ['date'],
    raw: true
  });
  const map = Object.fromEntries(rows.map((r) => [r.date, Number(r.count)]));
  const series = dates.map((date) => ({ date, count: map[date] || 0 }));
  const today = todayKey();
  const yesterday = todayKey(new Date(now.getTime() - 86400000));
  return {
    today: map[today] || 0,
    yesterday: map[yesterday] || 0,
    days: n,
    series
  };
}

module.exports = { recordDailyActive, getDailyActiveStats };
