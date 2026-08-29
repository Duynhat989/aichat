const keyPool = require('./keyPool');
const statsService = require('./statsService');
const { getOllamaModels } = require('./models');
const { isCanopyDatabaseReady } = require('../canopy/config/database');

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function requireDb(res) {
  if (!isCanopyDatabaseReady()) {
    fail(res, 503, 'Database not ready');
    return false;
  }
  return true;
}

const dashController = {
  async realtime(req, res) {
    try {
      if (!requireDb(res)) return;
      return ok(res, keyPool.getRealtimeSnapshot());
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async listKeys(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaKey } = getOllamaModels();
      const rows = await OllamaKey.findAll({ order: [['createdAt', 'ASC']] });
      const snap = keyPool.getRealtimeSnapshot();
      const ramById = Object.fromEntries(snap.keys.map((k) => [k.id, k]));
      const data = rows.map((r) => {
        const j = r.toJSON();
        const ram = ramById[j.id];
        return {
          ...j,
          apiKeyMasked: keyPool.maskKey(j.apiKey),
          apiKey: undefined,
          running: ram?.running ?? 0
        };
      });
      return ok(res, data);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async createKey(req, res) {
    try {
      if (!requireDb(res)) return;
      const { label, apiKey, enabled = true, maxConcurrent, note } = req.body || {};
      if (!apiKey || !String(apiKey).trim()) {
        return fail(res, 400, 'apiKey is required');
      }
      const { OllamaKey } = getOllamaModels();
      const row = await OllamaKey.create({
        label: label || 'key',
        apiKey: String(apiKey).trim(),
        enabled: enabled !== false,
        maxConcurrent: Math.max(1, Number(maxConcurrent) || keyPool.DEFAULT_MAX_CONCURRENT),
        note: note || null
      });
      await keyPool.loadFromDb();
      const j = row.toJSON();
      return ok(res, { ...j, apiKeyMasked: keyPool.maskKey(j.apiKey), apiKey: undefined, running: 0 });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async updateKey(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaKey } = getOllamaModels();
      const row = await OllamaKey.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Key not found');

      const { label, apiKey, enabled, maxConcurrent, note } = req.body || {};
      const patch = {};
      if (label !== undefined) patch.label = label;
      if (apiKey !== undefined && String(apiKey).trim()) patch.apiKey = String(apiKey).trim();
      if (enabled !== undefined) patch.enabled = !!enabled;
      if (maxConcurrent !== undefined) patch.maxConcurrent = Math.max(1, Number(maxConcurrent) || 1);
      if (note !== undefined) patch.note = note;

      await row.update(patch);
      await keyPool.loadFromDb();
      const j = row.toJSON();
      const ram = keyPool.getRamKey(j.id);
      return ok(res, {
        ...j,
        apiKeyMasked: keyPool.maskKey(j.apiKey),
        apiKey: undefined,
        running: ram?.running ?? 0
      });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async deleteKey(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaKey } = getOllamaModels();
      const row = await OllamaKey.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Key not found');
      const ram = keyPool.getRamKey(row.id);
      if (ram && ram.running > 0) {
        return fail(res, 409, 'Key still has running requests');
      }
      await row.destroy();
      await keyPool.loadFromDb();
      return ok(res, { id: req.params.id, deleted: true });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async reloadKeys(req, res) {
    try {
      if (!requireDb(res)) return;
      const snap = await keyPool.loadFromDb();
      return ok(res, snap);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async listModels(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaModel } = getOllamaModels();
      const rows = await OllamaModel.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
      return ok(res, rows);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async createModel(req, res) {
    try {
      if (!requireDb(res)) return;
      const { id, name, upstreamModel, enabled = true, sortOrder = 0, note } = req.body || {};
      if (!id || !name || !upstreamModel) {
        return fail(res, 400, 'id, name, upstreamModel are required');
      }
      const { OllamaModel } = getOllamaModels();
      const exists = await OllamaModel.findByPk(id);
      if (exists) return fail(res, 409, 'Model id already exists');
      const row = await OllamaModel.create({
        id: String(id).trim(),
        name: String(name).trim(),
        upstreamModel: String(upstreamModel).trim(),
        enabled: enabled !== false,
        sortOrder: Number(sortOrder) || 0,
        note: note || null
      });
      return ok(res, row);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async updateModel(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaModel } = getOllamaModels();
      const row = await OllamaModel.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Model not found');
      const { name, upstreamModel, enabled, sortOrder, note } = req.body || {};
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (upstreamModel !== undefined) patch.upstreamModel = upstreamModel;
      if (enabled !== undefined) patch.enabled = !!enabled;
      if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder) || 0;
      if (note !== undefined) patch.note = note;
      await row.update(patch);
      return ok(res, row);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async deleteModel(req, res) {
    try {
      if (!requireDb(res)) return;
      const { OllamaModel } = getOllamaModels();
      const row = await OllamaModel.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Model not found');
      await row.destroy();
      return ok(res, { id: req.params.id, deleted: true });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async getSettings(req, res) {
    try {
      if (!requireDb(res)) return;
      const data = await statsService.getSettings();
      return ok(res, data);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async updateSettings(req, res) {
    try {
      if (!requireDb(res)) return;
      const body = req.body || {};
      if (body.map && typeof body.map === 'object') {
        await statsService.upsertSettings(body.map);
      } else if (body.key !== undefined) {
        await statsService.upsertSetting(body.key, body.value, body.note);
      } else {
        await statsService.upsertSettings(body);
      }
      const data = await statsService.getSettings();
      return ok(res, data);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async history(req, res) {
    try {
      if (!requireDb(res)) return;
      const data = await statsService.listHistory({
        limit: req.query.limit,
        offset: req.query.offset,
        endpoint: req.query.endpoint,
        status: req.query.status,
        keyId: req.query.keyId
      });
      return ok(res, data);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async statsDaily(req, res) {
    try {
      if (!requireDb(res)) return;
      const rows = await statsService.listDailyStats({ days: req.query.days });
      return ok(res, rows);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  },

  async statsEndpoint(req, res) {
    try {
      if (!requireDb(res)) return;
      const rows = await statsService.listEndpointStats({
        date: req.query.date,
        days: req.query.days
      });
      return ok(res, rows);
    } catch (e) {
      return fail(res, 500, e.message);
    }
  }
};

module.exports = dashController;
