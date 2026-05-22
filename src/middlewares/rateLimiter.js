const rateLimit = require('express-rate-limit');

// Hàm tạo middleware rate limiter với thời gian chờ (ms)
const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs, // Thời gian giới hạn
    max, // Số request tối đa
    message: {
      status: false,
      msg: `Too many requests. Please wait for 5 seconds.`,
    },
    standardHeaders: true, // Gửi thông tin rate limit trong headers (RateLimit-Limit, RateLimit-Remaining, etc)
    legacyHeaders: false, // Không sử dụng headers X-RateLimit-*
  });
};

module.exports = createRateLimiter;
