const express = require('express');
const aiRoutes = require('./aiRoutes');
const dashRoutes = require('../ollama/routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AI Chat API is ready'
  });
});

router.use('/ai', aiRoutes);
router.use('/dash', dashRoutes);

module.exports = router;
