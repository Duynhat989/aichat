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
  aiChatController.chatCompletionWithLimit
);


// =========================
// SPELL CHECKER
// =========================

router.post(
  '/spell-check',
  (req, res, next) => traffic('spellchecker', next),
  aiChatController.chatCompletionWithLimit
);

// =========================
// SUMMARIZE
// =========================

router.post(
  '/summarize',
  (req, res, next) => traffic('summarize', next),
  aiChatController.chatCompletionWithLimit
);

// =========================
// TRANSLATE
// =========================

router.post(
  '/translate',
  (req, res, next) => traffic('translate', next),
  aiChatController.chatCompletionWithLimit
);

// =========================
// STUDY GUIDE
// =========================

router.post(
  '/study-guide',
  (req, res, next) => traffic('studyguide', next),
  aiChatController.chatCompletionWithLimit
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