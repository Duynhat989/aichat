const traffic = (type = 'aichat', next) => {
  if (typeof next === 'function') next();
};

module.exports = traffic;
