const express = require('express');
const multer = require('multer');

const aiChatController = require('../controllers/aiChatController');
const traffic = require('../middlewares/trafficMiddleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// =========================
// MODELS
// =========================

router.get('/models', aiChatController.getModel);

// =========================
// AI CHAT
// =========================

router.post(
  '/chat-completion',
  (req, res, next) => traffic('aichat', next),
  aiChatController.chatCompletion
);


// =========================
// SPELL CHECKER
// =========================

router.post(
  '/spell-check',
  (req, res, next) => traffic('spellchecker', next),
  aiChatController.chatCompletion
);

// =========================
// SUMMARIZE
// =========================

router.post(
  '/summarize',
  (req, res, next) => traffic('summarize', next),
  aiChatController.chatCompletion
);

// =========================
// TRANSLATE
// =========================

router.post(
  '/translate',
  (req, res, next) => traffic('translate', next),
  aiChatController.chatCompletion
);

// =========================
// STUDY GUIDE
// =========================

router.post(
  '/study-guide',
  (req, res, next) => traffic('studyguide', next),
  aiChatController.chatCompletion
);

// =========================
// ADD FILE
// =========================

router.post(
  '/add-file',
  upload.fields([
    {
      name: 'file',
      maxCount: 1
    }
  ]),
  aiChatController.addFile
);

module.exports = router;