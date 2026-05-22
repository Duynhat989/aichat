// middlewares/decryptMiddleware.js
const CryptoJS = require('crypto-js');

// Lấy khóa mã hóa từ biến môi trường
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key';

/**
 * Middleware để giải mã dữ liệu từ request
 */
const decryptMiddleware = (req, res, next) => {
  try {
    // Kiểm tra xem request có chứa dữ liệu mã hóa không
    if (req.headers['x-encrypted'] === 'true' && req.body && req.body.e) {
      // Giải mã dữ liệu
      const bytes = CryptoJS.AES.decrypt(req.body.e, ENCRYPTION_KEY);
      
      // Chuyển đổi về JSON và thay thế body
      req.body = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    }
    next();
  } catch (error) {
    console.error('Decrypt error:', error);
    return res.status(400).json({ error: 'Invalid encrypted data' });
  }
};

module.exports = decryptMiddleware;