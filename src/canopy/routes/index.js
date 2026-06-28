const express = require('express');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const billingController = require('../controllers/billingController');
const usageController = require('../controllers/usageController');
const adminController = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');
const { registerRateLimit } = require('../middleware/rateLimit');
const { dbReady } = require('../middleware/dbReady');
const { isCanopyDatabaseReady, getLastDbError } = require('../config/database');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'canopy-api',
    dbReady: isCanopyDatabaseReady(),
    dbError: getLastDbError(),
    time: new Date().toISOString()
  });
});

router.use(dbReady);

router.post('/auth/register', registerRateLimit, authController.register);
router.post('/auth/refresh', authController.refresh);

router.get('/users/me', authMiddleware, userController.me);
router.patch('/users/me', authMiddleware, userController.patchMe);
router.delete('/users/me', authMiddleware, userController.deleteMe);
router.put('/users/me/push-token', authMiddleware, userController.putPushToken);
router.delete('/users/me/push-token', authMiddleware, userController.deletePushToken);
router.get('/users/me/subscription', authMiddleware, userController.subscription);

router.post('/billing/verify-android', authMiddleware, billingController.verifyAndroid);

router.post('/usage/check', authMiddleware, usageController.check);
router.post('/usage/consume', authMiddleware, usageController.consume);

router.get('/admin/stats', adminMiddleware, adminController.stats);
router.get('/admin/users', adminMiddleware, adminController.users);
router.get('/admin/users/find', adminMiddleware, adminController.findUser);
router.get('/admin/notifications/logs', adminMiddleware, adminController.logs);
router.post('/admin/notifications/send', adminMiddleware, adminController.send);
router.post('/admin/notifications/broadcast', adminMiddleware, adminController.broadcast);

module.exports = router;
