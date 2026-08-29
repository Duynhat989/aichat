const express = require('express');
const dashController = require('./dashController');

const router = express.Router();

function dashAdminAuth(req, res, next) {
  const key = req.headers['x-admin-api-key'] || req.headers['x-api-key'] || '';
  const expected = process.env.DASH_ADMIN_API_KEY || process.env.CANOPY_ADMIN_API_KEY || '';
  if (!expected || key !== expected) {
    return res.status(403).json({ success: false, message: 'Invalid admin API key' });
  }
  next();
}

router.use(dashAdminAuth);

router.get('/realtime', dashController.realtime);

router.get('/keys', dashController.listKeys);
router.post('/keys', dashController.createKey);
router.put('/keys/:id', dashController.updateKey);
router.delete('/keys/:id', dashController.deleteKey);
router.post('/keys/reload', dashController.reloadKeys);

router.get('/models', dashController.listModels);
router.post('/models', dashController.createModel);
router.put('/models/:id', dashController.updateModel);
router.delete('/models/:id', dashController.deleteModel);

router.get('/settings', dashController.getSettings);
router.put('/settings', dashController.updateSettings);

router.get('/history', dashController.history);
router.get('/stats/daily', dashController.statsDaily);
router.get('/stats/endpoint', dashController.statsEndpoint);

module.exports = router;
