// middlewares/encryptResponseMiddleware.js
const CryptoJS = require('crypto-js');

// Lấy khóa mã hóa từ biến môi trường
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key';

/**
 * Middleware để mã hóa dữ liệu response
 * Mã hóa toàn bộ dữ liệu JSON trả về từ server
 */
const encryptResponseMiddleware = (req, res, next) => {
  // Lưu lại các phương thức response ban đầu
  const originalJson = res.json;
  const originalSend = res.send;

  // Ghi đè phương thức res.json
  res.json = function (data) {
    // Chỉ mã hóa nếu client gửi request đã mã hóa
    // hoặc nếu client yêu cầu nhận dữ liệu mã hóa
    if (req.headers['x-encrypted'] === 'true') {
      try {
        // Mã hóa dữ liệu
        const jsonString = JSON.stringify(data);
        const encryptedData = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
        // console.log(jsonString)
        // Thiết lập header cho client biết dữ liệu đã mã hóa
        res.set('Content-Type', 'application/json');
        res.set('X-Encrypted', 'true');

        // Gọi hàm json gốc với dữ liệu đã mã hóa
        return originalJson.call(this, { "r": encryptedData });
      } catch (error) {
        console.error('Encrypt response error:', error);
        // Nếu có lỗi khi mã hóa, vẫn trả về dữ liệu gốc
        return originalJson.call(this, data);
      }
    }

    // Nếu không cần mã hóa, trả về dữ liệu bình thường
    return originalJson.call(this, data);
  };

  // Ghi đè phương thức res.send để xử lý khi controller sử dụng res.send thay vì res.json
  res.send = function (body) {
    // Chỉ xử lý nếu body là object/array và client yêu cầu mã hóa
    if (req.headers['x-encrypted'] === 'true' &&
      body &&
      typeof body === 'object' &&
      !(body instanceof Buffer)) {
      try {
        // Chuyển đổi thành chuỗi JSON nếu chưa phải
        const jsonString = typeof body === 'string' ? body : JSON.stringify(body);

        // Mã hóa dữ liệu
        const encryptedData = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();

        // Thiết lập header
        res.set('Content-Type', 'application/json');
        res.set('X-Encrypted', 'true');

        // Gọi hàm send gốc với dữ liệu đã mã hóa
        return originalSend.call(this, JSON.stringify({ encryptedData }));
      } catch (error) {
        console.error('Encrypt response error:', error);
        // Nếu có lỗi, sử dụng dữ liệu gốc
        return originalSend.call(this, body);
      }
    }

    // Trường hợp thông thường, không mã hóa
    return originalSend.call(this, body);
  };

  next();
};

module.exports = encryptResponseMiddleware;