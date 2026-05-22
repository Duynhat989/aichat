function countWords(text) {
  if (text === null || text === undefined) return 0;
  const t = String(text).trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function assertMaxWords(text, maxWords, label = 'Text') {
  const n = countWords(text);
  if (n > maxWords) {
    const err = new Error(`${label} exceeds ${maxWords} words (got ${n})`);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = { countWords, assertMaxWords };
