const bcrypt = require('bcryptjs')
//mã hóa mật khẩu
function encryption(password){
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                reject(err)
            } else {
                resolve(hash)
            }
          });
    });
}
async function compare(password, hash) {
    try {
      const result = await bcrypt.compare(password, hash);
      return result;
    } catch (err) {
      throw new Error('Lỗi so sánh mật khẩu');
    }
  }

module.exports = {
    compare,
    encryption
}