/** Strip data-URI / whitespace so Ollama ImageData accepts the string. */
function toOllamaImageBase64(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = /^data:[^;]+;base64,(.+)$/is.exec(s);
  const raw = m ? m[1] : s;
  return raw.replace(/\s+/g, '');
}

function sanitizeMessagesImages(messages) {
  return (messages || []).map((msg) => {
    if (!msg || !Array.isArray(msg.images) || msg.images.length === 0) return msg;
    const images = msg.images.map(toOllamaImageBase64).filter(Boolean);
    if (!images.length) {
      const { images: _drop, ...rest } = msg;
      return rest;
    }
    return { ...msg, images };
  });
}

class OllamaChatService {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || 'https://ollama.com').replace(/\/$/, '');
    this.model = options.model || 'gemma3:27b';
    this.apiKey = options.apiKey || '';
    this.timeoutMs = Number(options.timeoutMs || 120000);
  }

  static geminiContentsToCloudMessages(contents, msgInstruction) {
    const messages = [];
    messages.push({
      role: 'system',
      content: msgInstruction?.parts?.[0]?.text || ''
    });
    for (const item of contents || []) {
      const role = item.role === 'model' ? 'assistant' : item.role;
      let text = '';
      const images = [];
      for (const part of item.parts || []) {
        if (part.text) text += `${part.text}\n`;
        if (part.inlineData?.data) {
          const b64 = toOllamaImageBase64(part.inlineData.data);
          if (b64) images.push(b64);
        }
      }
      messages.push({
        role,
        content: text.trim() || ' ',
        ...(images.length > 0 && { images })
      });
    }
    return messages;
  }

  static openAiVisionPartsToUserMessage(parts) {
    let text = '';
    const images = [];
    for (const p of parts || []) {
      if (p.type === 'text' && p.text) text += p.text;
      if (p.type === 'image_url' && p.image_url?.url) {
        const b64 = toOllamaImageBase64(p.image_url.url);
        if (b64) images.push(b64);
      }
    }
    return {
      role: 'user',
      content: text.trim() || ' ',
      ...(images.length ? { images } : {})
    };
  }

  async chat(messages, opts = {}) {
    if (!this.apiKey) {
      const err = new Error('Ollama API key is not configured');
      err.statusCode = 503;
      throw err;
    }

    const url = `${this.baseUrl}/api/chat`;
    const instructions =
      opts.instructions !== undefined
        ? opts.instructions
        : messages.find((m) => m.role === 'system')?.content || '';

    const body = {
      instructions: instructions || '',
      model: opts.model || this.model,
      stream: false,
      messages: sanitizeMessagesImages(messages)
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || data?.message || res.statusText || 'Ollama Cloud request failed';
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.statusCode = res.status >= 400 && res.status < 500 ? 400 : 502;
        throw err;
      }

      const text = data?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        const err = new Error(data?.error || 'Empty Ollama response');
        err.statusCode = 502;
        throw err;
      }
      return text.trim();
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('Ollama request timed out');
        err.statusCode = 504;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  async chat_stream(messages, opts = {}) {
    const controller = new AbortController();

    const url = `${this.baseUrl}/api/chat`;

    const body = {
      // instructions: opts.instructions || '',
      model: opts.model || this.model,
      stream: true,
      messages: sanitizeMessagesImages(messages)
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (!res.ok) {
        const text = await res.text();
        let msg = text;

        try {
          const data = JSON.parse(text);
          msg = data?.error || data?.message || text;
        } catch { }

        const err = new Error(msg || res.statusText);
        err.statusCode = res.status >= 400 && res.status < 500 ? 400 : 502;
        throw err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      return {
        async *[Symbol.asyncIterator]() {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) break;

              yield decoder.decode(value, { stream: true });
            }
          } finally {
            clearTimeout(timer);
            reader.releaseLock();
          }
        }
      };

    } catch (e) {
      clearTimeout(timer);

      if (e.name === 'AbortError') {
        const err = new Error('Ollama request timed out');
        err.statusCode = 504;
        throw err;
      }

      throw e;
    }
  }

  async chatFromGeminiContents(contents, msgInstruction, opts) {
    const messages = OllamaChatService.geminiContentsToCloudMessages(contents, msgInstruction);
    const instructions = msgInstruction?.parts?.[0]?.text || '';
    return this.chat(messages, { ...opts, instructions });
  }

  async textTask(systemPrompt, userText, opts) {
    const messages = [];
    messages.push({ role: 'system', content: systemPrompt || '' });
    messages.push({ role: 'user', content: userText });
    return this.chat(messages, { ...opts, instructions: systemPrompt || '' });
  }

  async visionTask(systemPrompt, openAiStyleParts, opts) {
    const messages = [];
    messages.push({ role: 'system', content: systemPrompt || '' });
    messages.push(OllamaChatService.openAiVisionPartsToUserMessage(openAiStyleParts));
    return this.chat(messages, { ...opts, instructions: systemPrompt || '' });
  }

  async apiConversation(contents, msgInstruction, opts = {}) {
    try {
      const msg = await this.chatFromGeminiContents(contents, msgInstruction, opts);
      return { status: true, isNewModel: true, msg };
    } catch (e) {
      return {
        status: false,
        isNewModel: true,
        msg: e.message || 'Error API',
        debug: e.statusCode
      };
    }
  }
  async chat_ollama(messages, opts = {}) {
    try {
      const url = `${this.baseUrl}/api/chat`;
      const body = {
        instructions: opts.instructions || '',
        model: opts.model || this.model,
        stream: false,
        messages: sanitizeMessagesImages(messages)
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.message || res.statusText || 'Ollama Cloud request failed';
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.statusCode = res.status >= 400 && res.status < 500 ? 400 : 502;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('Ollama request timed out');
        err.statusCode = 504;
        throw err;
      }
      throw e;
    }
  }
}

function getDefaultOllama() {
  return new OllamaChatService();
}

module.exports = {
  OllamaChatService,
  getDefaultOllama
};
