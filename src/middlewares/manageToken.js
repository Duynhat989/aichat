const jwt = require('jsonwebtoken');
require('dotenv').config();
 
function getPayloadToken(token){
    let data ;
     jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        data = user
    })
    return data
}
function getPayloadTokenMessage(token){
    let data ;
     jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        data = user
    })
    return data
}
function createNewToken(payload) {
    return  jwt.sign(payload, process.env.JWT_SECRET)
}
module.exports = {
    getPayloadToken,
    createNewToken
};
