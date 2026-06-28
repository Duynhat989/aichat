const TZ = process.env.CANOPY_TIMEZONE || 'Asia/Ho_Chi_Minh';
const FREE_LIMIT = Number(process.env.CANOPY_FREE_DAILY_LIMIT || 3);

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

function nextResetAt(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  const next = new Date(`${y}-${m}-${d}T00:00:00+07:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

module.exports = { TZ, FREE_LIMIT, todayKey, nextResetAt };
