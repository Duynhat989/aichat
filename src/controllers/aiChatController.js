const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { extractDocumentText } = require('../utils/fileExtract');
const fileStore = require('../utils/fileStore');
const { OllamaChatService } = require('../services/ollamaChatService');
const keyPool = require('../ollama/keyPool');
const statsService = require('../ollama/statsService');
const { getOllamaModels } = require('../ollama/models');
const { isCanopyDatabaseReady } = require('../canopy/config/database');

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/** Ollama expects raw base64 (no data: URI prefix). */
function toOllamaImageBase64(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = /^data:[^;]+;base64,(.+)$/is.exec(s);
  const raw = m ? m[1] : s;
  return raw.replace(/\s+/g, '');
}

async function resolveFileForChat(fileId) {
  const loaded = await fileStore.loadBuffer(fileId);
  if (!loaded) return null;
  const { meta, buffer } = loaded;

  if (meta.type === 'image') {
    return {
      type: 'image',
      name: meta.name,
      text: buffer.toString('base64')
    };
  }

  const text = await extractDocumentText(buffer, meta.mimeType, meta.name);
  return {
    type: 'document',
    name: meta.name,
    text
  };
}

const historyMessages = new Map();

async function resolveModels() {
  if (isCanopyDatabaseReady()) {
    try {
      const { OllamaModel } = getOllamaModels();
      const rows = await OllamaModel.findAll({
        where: { enabled: true },
        order: [['sortOrder', 'ASC'], ['id', 'ASC']]
      });
      if (rows.length) {
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          model: r.upstreamModel
        }));
      }
    } catch (e) {
      console.error('resolveModels DB error:', e.message);
    }
  }
  const upstream = 'gemma3:27b';
  return [
    { id: 'onewise_v1', name: 'OneWise V1', model: upstream },
    { id: 'onewise_v2', name: 'OneWise V2', model: upstream }
  ];
}

async function getSetting(key, fallback) {
  if (!isCanopyDatabaseReady()) return fallback;
  try {
    const { map } = await statsService.getSettings();
    return map[key] !== undefined ? map[key] : fallback;
  } catch {
    return fallback;
  }
}

const aiChatController = {
  async getModel(req, res) {
    try {
      const models = await resolveModels();
      return res.json({
        success: true,
        data: models.map((m) => ({ id: m.id, name: m.name }))
      });
    } catch (error) {
      return fail(res, 500, error.message);
    }
  },

  async chatCompletionWithLimit(req, res) {
    const endpoint = req.ollamaEndpoint || 'aichat';
    let lease = null;
    let historyRow = null;
    let ok = false;
    let errorMessage = null;
    let metaOut = {};

    try {
      lease = await keyPool.acquire({ endpoint });
    } catch (err) {
      return fail(res, err.statusCode || 503, err.message || 'No available');
    }

    try {
      historyRow = await statsService.startHistory({
        keyId: lease.id,
        keyLabel: lease.label,
        endpoint
      });
    } catch (e) {
      console.error('startHistory error:', e.message);
    }

    try {
      await aiChatController.chatCompletion(req, res, {
        apiKey: lease.apiKey,
        keyId: lease.id,
        endpoint,
        onMeta: (meta) => {
          metaOut = { ...metaOut, ...meta };
        }
      });
      ok = true;
    } catch (err) {
      ok = false;
      errorMessage = err.message;
      if (!res.headersSent) {
        fail(res, err.statusCode || 500, err.message);
      }
    } finally {
      await keyPool.release(lease, { ok, error: errorMessage });
      try {
        if (historyRow) {
          await historyRow
            .update({
              modelId: metaOut.modelId || null,
              upstreamModel: metaOut.upstreamModel || null,
              taskId: metaOut.taskId || historyRow.taskId
            })
            .catch(() => {});
          await statsService.finishHistory(historyRow.id, {
            ok,
            error: errorMessage,
            taskId: metaOut.taskId
          });
        }
      } catch (e) {
        console.error('finishHistory error:', e.message);
      }
    }
  },

  async chatCompletion(req, res, runtime = {}) {
    const {
      taskId,
      prompt,
      instructions = '',
      files = [],
      model
    } = req.body;
    let newTaskId = 'chatcmpl-' + uuidv4();
    const created = Math.floor(Date.now() / 1000);
    let streamStarted = false;

    try {
      const models = await resolveModels();
      const modelId = model || models[0]?.id;
      const modelData = models.find((m) => m.id === modelId);
      if (!modelData) {
        const err = new Error('Invalid model');
        err.statusCode = 400;
        throw err;
      }

      const messages = [];
      if (taskId) {
        newTaskId = taskId;
        const history = historyMessages.get(newTaskId);
        if (history) {
          messages.push(...history.messages);
        }
      } else {
        historyMessages.set(newTaskId, {
          taskId: newTaskId,
          code: 'chat_completion',
          status: 'pending',
          model: modelData.id,
          messages: []
        });
        if (instructions) {
          messages.push({
            role: 'system',
            content: instructions
          });
        }
      }

      if (typeof runtime.onMeta === 'function') {
        runtime.onMeta({
          taskId: newTaskId,
          modelId: modelData.id,
          upstreamModel: modelData.model
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      streamStarted = true;

      const fileMessage = {
        role: 'user',
        content: prompt
      };
      if (files.length > 0) {
        const imgs = [];
        for (const file of files) {
          const fileData = await resolveFileForChat(file.fileId);
          if (fileData) {
            if (fileData.type === 'image') {
              const pureBase64 = toOllamaImageBase64(fileData.text);
              if (pureBase64) imgs.push(pureBase64);
            } else {
              messages.push({
                role: 'user',
                content: `This is a document file(name: ${fileData.name}, type: ${fileData.type}) \n Content: ${fileData.text}`
              });
            }
          }
        }
        if (imgs.length > 0) {
          fileMessage.images = imgs;
        }
      }

      messages.push(fileMessage);

      const baseUrl = await getSetting('ollama_base_url', 'https://ollama.com');
      const timeoutMs = Number(await getSetting('ollama_timeout_ms', 120000));

      const apiKey = runtime.apiKey || '';
      if (!apiKey) {
        throw Object.assign(new Error('No Ollama key available'), { statusCode: 503 });
      }

      const ollamaChatService = new OllamaChatService({
        apiKey,
        baseUrl,
        timeoutMs,
        model: modelData.model
      });

      const stream = await ollamaChatService.chat_stream(messages, {
        model: modelData.model,
        instructions
      });

      let bot_content = '';
      res.write(
        `data: ${JSON.stringify({
          id: newTaskId,
          object: 'chat.completion.chunk',
          created,
          model: modelData.id,
          status: 'pending',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null
            }
          ]
        })}\n\n`
      );

      for await (const chunk of stream) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const content = data?.message?.content || data?.content || '';
            if (!content) continue;

            res.write(
              `data: ${JSON.stringify({
                id: newTaskId,
                object: 'chat.completion.chunk',
                created,
                model: modelData.id,
                status: 'pending',
                choices: [
                  {
                    index: 0,
                    delta: { content },
                    finish_reason: null
                  }
                ]
              })}\n\n`
            );
            bot_content += content;
          } catch (_) {}
        }
      }

      res.write(
        `data: ${JSON.stringify({
          id: newTaskId,
          object: 'chat.completion.chunk',
          created,
          ended: Math.floor(Date.now() / 1000),
          model: modelData.id,
          status: 'completed',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }
          ]
        })}\n\n`
      );
      res.end();

      messages.push({
        role: 'assistant',
        content: bot_content
      });

      historyMessages.set(newTaskId, {
        taskId: newTaskId,
        code: 'chat_completion',
        status: 'completed',
        model: modelData.id,
        messages
      });
    } catch (error) {
      console.error(error);
      if (streamStarted) {
        res.write(
          `data: ${JSON.stringify({
            id: newTaskId,
            object: 'chat.completion.chunk',
            created,
            ended: Math.floor(Date.now() / 1000),
            model: 'unknown',
            status: 'error',
            error: { message: error.message }
          })}\n\n`
        );
        res.end();
      }
      throw error;
    }
  },

  async clearFile(fileId) {
    fileStore.scheduleExpire(fileId);
    return true;
  },

  async addFile(req, res) {
    try {
      const fileUpload = req.files?.file?.[0];
      const ext = path.extname(fileUpload?.originalname || '').toLowerCase();
      if (!fileUpload) {
        return fail(res, 400, 'No file uploaded');
      }
      const fileId = 'file-' + uuidv4();
      let type = 'unknown';
      if (['.pdf', '.docx', '.txt', '.csv', '.xlsx'].includes(ext)) {
        type = 'document';
      }
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        type = 'image';
      }
      if (type === 'unknown') {
        return fail(res, 400, 'Unsupported file type');
      }
      if (type === 'image' && fileUpload.size > 10 * 1024 * 1024) {
        return fail(res, 400, 'Image size must be less than 10MB');
      }
      if (type === 'document' && fileUpload.size > 5 * 1024 * 1024) {
        return fail(res, 400, 'Document size must be less than 5MB');
      }

      await fileStore.saveUpload({
        fileId,
        type,
        originalname: fileUpload.originalname,
        mimetype: fileUpload.mimetype,
        ext,
        buffer: fileUpload.buffer
      });

      return res.json({
        success: true,
        data: { fileId }
      });
    } catch (error) {
      console.error(error);
      return fail(res, error.statusCode || 500, error.message);
    }
  }
};

module.exports = aiChatController;
