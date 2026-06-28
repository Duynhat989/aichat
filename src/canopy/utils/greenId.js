function generateGreenId() {
  const n = String(Math.floor(1000000000 + Math.random() * 9000000000));
  return `greenid${n}`;
}

module.exports = { generateGreenId };
