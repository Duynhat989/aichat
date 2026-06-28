const { getModels } = require('../models');
const { FREE_LIMIT, todayKey, nextResetAt } = require('../utils/quota');
const { isPremiumActive } = require('./userService');

async function getDailyUsage(userId) {
  const { UsageDaily } = getModels();
  const date = todayKey();
  let row = await UsageDaily.findOne({ where: { userId, date } });
  if (!row) {
    row = await UsageDaily.create({ userId, date, count: 0, requestIds: [] });
  }
  return row;
}

async function checkQuota(user) {
  if (isPremiumActive(user)) {
    return { allowed: true, remaining: -1, resetsAt: nextResetAt() };
  }
  const row = await getDailyUsage(user.id);
  const remaining = Math.max(0, FREE_LIMIT - row.count);
  return {
    allowed: remaining > 0,
    remaining,
    resetsAt: nextResetAt()
  };
}

async function consumeQuota(user, requestId) {
  if (isPremiumActive(user)) {
    return { consumed: true, remaining: -1 };
  }
  const row = await getDailyUsage(user.id);
  const ids = Array.isArray(row.requestIds) ? row.requestIds : [];
  if (requestId && ids.includes(requestId)) {
    return { consumed: true, remaining: Math.max(0, FREE_LIMIT - row.count), idempotent: true };
  }
  if (row.count >= FREE_LIMIT) {
    const err = new Error('Đã hết lượt miễn phí hôm nay');
    err.code = 'DAILY_LIMIT';
    throw err;
  }
  const newIds = requestId ? [...ids, requestId] : ids;
  await row.update({ count: row.count + 1, requestIds: newIds });
  return { consumed: true, remaining: Math.max(0, FREE_LIMIT - row.count - 1) };
}

module.exports = { checkQuota, consumeQuota, getDailyUsage };
