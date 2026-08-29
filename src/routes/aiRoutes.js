const express = require('express');
const multer = require('multer');

const aiChatController = require('../controllers/aiChatController');
const traffic = require('../middlewares/trafficMiddleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function withEndpoint(endpoint) {
  return (req, res, next) => {
    req.ollamaEndpoint = endpoint;
    next();
  };
}

router.get('/models', aiChatController.getModel);

router.post(
  '/chat-completion',
  withEndpoint('aichat'),
  (req, res, next) => traffic('aichat', next),
  aiChatController.chatCompletionWithLimit
);

router.post(
  '/spell-check',
  withEndpoint('spellchecker'),
  (req, res, next) => traffic('spellchecker', next),
  aiChatController.chatCompletionWithLimit
);

router.post(
  '/summarize',
  withEndpoint('summarize'),
  (req, res, next) => traffic('summarize', next),
  aiChatController.chatCompletionWithLimit
);

router.post(
  '/translate',
  withEndpoint('translate'),
  (req, res, next) => traffic('translate', next),
  aiChatController.chatCompletionWithLimit
);

router.post(
  '/study-guide',
  withEndpoint('studyguide'),
  (req, res, next) => traffic('studyguide', next),
  aiChatController.chatCompletionWithLimit
);

router.post(
  '/add-file',
  upload.fields([{ name: 'file', maxCount: 1 }]),
  aiChatController.addFile
);

module.exports = router;
