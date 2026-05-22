const { validationResult } = require('express-validator');

// Hàm xử lý validate chung
const validate = (validations) => {
    return async (req, res, next) => {
        const missingFields = [];
        // Lặp qua từng tham số trong danh sách validations
        validations.forEach(field => {
            if (!req.body[field]) {
                missingFields.push(field); // Thêm vào danh sách các tham số bị thiếu
            }
        });
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Missing parameter",
                fields:missingFields,
                statusCode: 400
            });
        }
        next();
    };
};

module.exports = { validate };
