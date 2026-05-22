  const { v4: uuidv4 } = require('uuid');
  const path = require('path');
  const { extractDocumentText } = require('../utils/fileExtract');
  const { OllamaChatService } = require('../services/ollamaChatService');

  function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
  }

  async function docContextFromFile(file) {
    if (!file) return '';
    if (file.buffer.length > 5 * 1024 * 1024) {
      const e = new Error('Document exceeds 5MB');
      e.statusCode = 400;
      throw e;
    }
    return extractDocumentText(file.buffer, file.mimetype, file.originalname);
  }
  async function imgContextFromFile(file) {
    if (!file) return '';

    if (file.buffer.length > 10 * 1024 * 1024) {
      const e = new Error('Image exceeds 10MB');
      e.statusCode = 400;
      throw e;
    }

    const mimeType = file.mimetype || 'image/png';

    const base64 = file.buffer.toString('base64');

    return `data:${mimeType};base64,${base64}`;
  }
  const historyMessages = new Map();
  const DEFAULT_MODEL = [
    {
      id: "onewise_v1",
      name: "OneWise V1",
      model: "gemma3:12b",
    },
    {
      id: "onewise_v2",
      name: "OneWise V2",
      model: "gemma3:27b",
    }
  ];
  const filesTemp = new Map();

  // Queue for chat completion
  const MAX_CONCURRENT = 3;
  let running = 0;
  const queue = [];

  function runWithLimit(task) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        running++;

        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          running--;
          next();
        }
      };

      const next = () => {
        if (queue.length > 0 && running < MAX_CONCURRENT) {
          const fn = queue.shift();
          fn();
        }
      };

      if (running < MAX_CONCURRENT) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  }

  const aiChatController = {
    async getModel(req, res) {
      try {
        const models = DEFAULT_MODEL.map(m => ({
          id: m.id,
          name: m.name
        }));
        return res.json({
          success: true, data: models
        });
      } catch (error) {
        return fail(res, 500, error.message);
      }
    },
    async chatCompletionWithLimit(req, res) {
      return runWithLimit(() => aiChatController.chatCompletion(req, res));
    },
    async chatCompletion(req, res) {
      const {
        taskId,
        prompt,
        instructions = '',
        files = [],
        model = DEFAULT_MODEL[0].id
      } = req.body;
      let newTaskId = 'chatcmpl-' + uuidv4();
      const created = Math.floor(Date.now() / 1000);
      try {
        const modelData = DEFAULT_MODEL.find(m => m.id === model);
        if (!modelData) {
          return fail(res, 400, 'Invalid model');
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
            code: "chat_completion",
            status: "pending",
            model: modelData.id,
            messages: [],
          });
          if (instructions) {
            messages.push({
              role: 'system',
              content: instructions
            });
          }
        }
        // console.log(modelData);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        
        let fileMessage = {
          role: "user",
          content: prompt
        }
        if (files.length > 0) {
          let imgs = [];
          for (const file of files) {
            const fileData = filesTemp.get(file.fileId);
            if (fileData) {
              if (fileData.type === 'image') {
                const pureBase64 = fileData.text.replace(
                  /^data:image\/\w+;base64,/,
                  ''
                );
                imgs.push(pureBase64)
              } else {
                messages.push({
                  role: 'user',
                  content: `This is a document file(name: ${fileData.originalname}, type: ${fileData.type}) \n Content: ${fileData.text}`
                });
                break;
              }
            }
          }
          if (imgs.length > 0) {
            fileMessage.images = imgs;
          }
        }

        messages.push(fileMessage);
        console.log(JSON.stringify(messages, null, 2));


        const ollamaChatService = new OllamaChatService();

        const stream = await ollamaChatService.chat_stream(messages, {
          model: modelData.model,
          instructions: instructions
        });

        let bot_content = '';
        // first chunk
        res.write(
          `data: ${JSON.stringify({
            id: newTaskId,
            object: 'chat.completion.chunk',
            created,
            model: modelData.id,
            status: "pending",
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant'
                },
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

              const content =
                data?.message?.content ||
                data?.content ||
                '';

              if (!content) continue;

              res.write(
                `data: ${JSON.stringify({
                  id: newTaskId,
                  object: 'chat.completion.chunk',
                  created,
                  model: modelData.id,
                  status: "pending",
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content
                      },
                      finish_reason: null
                    }
                  ]
                })}\n\n`
              );
              bot_content += content;
            } catch (e) { }
          }
        }

        // end chunk
        res.write(
          `data: ${JSON.stringify({
            id: newTaskId,
            object: 'chat.completion.chunk',
            created,
            ended: Math.floor(Date.now() / 1000),
            model: modelData.id,
            status: "completed",
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
        // Clear file and image in fileMessage

        messages.push({
          role: 'assistant',
          content: bot_content
        });

        historyMessages.set(newTaskId, {
          taskId: newTaskId,
          code: "chat_completion",
          status: "completed",
          model: modelData.id,
          messages: messages,
        });
      } catch (error) {
        console.error(error);

        res.write(
          `data: ${JSON.stringify({
            id: newTaskId,
            object: 'chat.completion.chunk',
            created,
            ended: Math.floor(Date.now() / 1000),
            model: "unknown",
            status: "error",
            error: {
              message: error.message
            }
          })}\n\n`
        );

        res.end();
      }
    },
    async clearFile(fileId) {
      setTimeout(() => {
        filesTemp.delete(fileId);
      }, 1000 * 60 * 10); // 10 minutes
      return true;
    },
    async addFile(req, res) {
      try {

        const fileUpload = req.files?.file?.[0];
        const ext = path.extname(fileUpload?.originalname).toLowerCase();
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
        //limit image size to 10MB
        if (type === 'image' && fileUpload.size > 10 * 1024 * 1024) {
          return fail(res, 400, 'Image size must be less than 10MB');
        }
        //limit document size to 5MB
        if (type === 'document' && fileUpload.size > 5 * 1024 * 1024) {
          return fail(res, 400, 'Document size must be less than 5MB');
        }

        if (type === 'image') {
          const imgText = await imgContextFromFile(fileUpload);
          filesTemp.set(fileId, {
            fileId,
            type: 'image',
            name: fileUpload.originalname,
            text: imgText,
            mimeType: ext
          });
        }
        if (type === 'document') {
          const docText = await docContextFromFile(fileUpload);
          filesTemp.set(fileId, {
            fileId,
            type: 'document',
            name: fileUpload.originalname,
            text: docText,
            mimeType: ext
          });
        }
        aiChatController.clearFile(fileId);

        return res.json({
          success: true,
          data: {
            fileId,
            // details: filesTemp.get(fileId)
          }
        });
      } catch (error) {
        console.error(error);
        return fail(res, 500, error.message);
      }
    },
  };

  module.exports = aiChatController;
