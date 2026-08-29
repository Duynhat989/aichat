(() => {
  const STORAGE_KEY = 'ollama_dash_auth';
  const titles = {
    realtime: 'Realtime',
    keys: 'Quản lý key',
    models: 'Quản lý model',
    history: 'Lịch sử',
    daily: 'Thống kê theo ngày',
    endpoint: 'Thống kê theo endpoint',
    settings: 'Cài đặt'
  };

  let auth = loadAuth();
  let panel = 'realtime';
  let realtimeTimer = null;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function loadAuth() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveAuth(next) {
    auth = next;
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.borderColor = isErr ? 'var(--err)' : 'var(--line)';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  async function api(path, opts = {}) {
    const base = (auth?.baseUrl || '/api/dash').replace(/\/$/, '');
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-API-Key': auth?.apiKey || '',
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || res.statusText || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data.data;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN');
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#connPill').textContent = auth.baseUrl || '/api/dash';
    switchPanel(panel);
  }

  function showLogin(errMsg) {
    stopRealtime();
    $('#app').classList.add('hidden');
    $('#loginScreen').classList.remove('hidden');
    const err = $('#loginError');
    if (errMsg) {
      err.textContent = errMsg;
      err.classList.remove('hidden');
    } else {
      err.classList.add('hidden');
    }
  }

  function switchPanel(name) {
    panel = name;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
    $$('.panel').forEach((p) => p.classList.add('hidden'));
    $(`#panel-${name}`)?.classList.remove('hidden');
    $('#pageTitle').textContent = titles[name] || name;
    if (name === 'realtime') startRealtime();
    else stopRealtime();
    refreshCurrent().catch((e) => toast(e.message, true));
  }

  function startRealtime() {
    stopRealtime();
    loadRealtime().catch(() => {});
    realtimeTimer = setInterval(() => {
      if (panel === 'realtime') loadRealtime().catch(() => {});
    }, 2000);
  }

  function stopRealtime() {
    if (realtimeTimer) clearInterval(realtimeTimer);
    realtimeTimer = null;
  }

  async function refreshCurrent() {
    if (panel === 'realtime') return loadRealtime();
    if (panel === 'keys') return loadKeys();
    if (panel === 'models') return loadModels();
    if (panel === 'history') return loadHistory();
    if (panel === 'daily') return loadDaily();
    if (panel === 'endpoint') return loadEndpoint();
    if (panel === 'settings') return loadSettings();
  }

  async function loadRealtime() {
    const data = await api('/realtime');
    $('#realtimeStats').innerHTML = [
      ['Key bật', data.enabledKeyCount],
      ['Đang chạy', data.totalRunning],
      ['Capacity', data.totalCapacity],
      ['Hàng đợi', data.queueLength]
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`
      )
      .join('');

    $('#rtUpdated').textContent = `Cập nhật ${new Date().toLocaleTimeString('vi-VN')}`;
    $('#realtimeKeysBody').innerHTML = (data.keys || [])
      .map((k) => {
        const pct = k.maxConcurrent ? Math.min(100, (k.running / k.maxConcurrent) * 100) : 0;
        const badge = !k.enabled
          ? '<span class="badge badge-off">off</span>'
          : k.running > 0
            ? '<span class="badge badge-run">busy</span>'
            : '<span class="badge badge-ok">idle</span>';
        return `<tr>
          <td>${esc(k.label)}</td>
          <td class="mono">${esc(k.apiKeyMasked)}</td>
          <td>${badge}</td>
          <td>
            <div class="mono">${k.running}/${k.maxConcurrent}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
          </td>
          <td class="mono">${esc(k.maxConcurrent)}</td>
          <td class="mono">${k.successCount} / ${k.errorCount}</td>
          <td class="muted">${esc(fmtTime(k.lastUsedAt))}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="7" class="muted">Chưa có key</td></tr>';
  }

  async function loadKeys() {
    const rows = await api('/keys');
    $('#keysBody').innerHTML = rows
      .map(
        (k) => `<tr>
        <td>${esc(k.label)}</td>
        <td class="mono">${esc(k.apiKeyMasked)}</td>
        <td>${k.enabled ? '<span class="badge badge-ok">on</span>' : '<span class="badge badge-off">off</span>'}</td>
        <td class="mono">${esc(k.maxConcurrent)}</td>
        <td class="mono">${esc(k.running)}</td>
        <td class="mono">${k.successCount}/${k.errorCount}</td>
        <td>
          <div class="btn-row">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-key="${esc(k.id)}">Sửa</button>
            <button type="button" class="btn btn-danger btn-sm" data-del-key="${esc(k.id)}">Xóa</button>
          </div>
        </td>
      </tr>`
      )
      .join('') || '<tr><td colspan="7" class="muted">Chưa có key — thêm mới trong Dash</td></tr>';

    $$('[data-edit-key]').forEach((btn) => {
      btn.onclick = () => {
        const row = rows.find((r) => r.id === btn.dataset.editKey);
        openKeyModal(row);
      };
    });
    $$('[data-del-key]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Xóa key này?')) return;
        try {
          await api(`/keys/${btn.dataset.delKey}`, { method: 'DELETE' });
          toast('Đã xóa key');
          loadKeys();
        } catch (e) {
          toast(e.message, true);
        }
      };
    });
  }

  function openKeyModal(row) {
    const isEdit = !!row;
    $('#modalTitle').textContent = isEdit ? 'Sửa key' : 'Thêm key';
    $('#modalBody').innerHTML = `
      <form id="keyForm">
        <label class="field"><span>Label</span><input name="label" required value="${esc(row?.label || '')}"></label>
        <label class="field"><span>API Key ${isEdit ? '(để trống nếu không đổi)' : ''}</span>
          <input name="apiKey" type="password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? '••••' : 'ollama cloud key'}">
        </label>
        <label class="field"><span>Max concurrent</span>
          <input name="maxConcurrent" type="number" min="1" value="${esc(row?.maxConcurrent ?? 10)}">
        </label>
        <label class="field"><span>Note</span><input name="note" value="${esc(row?.note || '')}"></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input name="enabled" type="checkbox" ${row?.enabled !== false ? 'checked' : ''}>
          <span>Enabled</span>
        </label>
        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Cập nhật' : 'Tạo key'}</button>
      </form>`;
    openModal();
    $('#keyForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        label: fd.get('label'),
        maxConcurrent: Number(fd.get('maxConcurrent') || 10),
        note: fd.get('note') || null,
        enabled: fd.get('enabled') === 'on'
      };
      const apiKey = String(fd.get('apiKey') || '').trim();
      if (apiKey) body.apiKey = apiKey;
      try {
        if (isEdit) await api(`/keys/${row.id}`, { method: 'PUT', body: JSON.stringify(body) });
        else {
          if (!body.apiKey) throw new Error('apiKey required');
          await api('/keys', { method: 'POST', body: JSON.stringify(body) });
        }
        closeModal();
        toast('Đã lưu key');
        loadKeys();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  async function loadModels() {
    const rows = await api('/models');
    $('#modelsBody').innerHTML = rows
      .map(
        (m) => `<tr>
        <td class="mono">${esc(m.id)}</td>
        <td>${esc(m.name)}</td>
        <td class="mono">${esc(m.upstreamModel)}</td>
        <td>${m.enabled ? '<span class="badge badge-ok">on</span>' : '<span class="badge badge-off">off</span>'}</td>
        <td class="mono">${esc(m.sortOrder)}</td>
        <td>
          <div class="btn-row">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-model="${esc(m.id)}">Sửa</button>
            <button type="button" class="btn btn-danger btn-sm" data-del-model="${esc(m.id)}">Xóa</button>
          </div>
        </td>
      </tr>`
      )
      .join('') || '<tr><td colspan="6" class="muted">Chưa có model</td></tr>';

    $$('[data-edit-model]').forEach((btn) => {
      btn.onclick = () => openModelModal(rows.find((r) => r.id === btn.dataset.editModel));
    });
    $$('[data-del-model]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Xóa model này?')) return;
        try {
          await api(`/models/${btn.dataset.delModel}`, { method: 'DELETE' });
          toast('Đã xóa model');
          loadModels();
        } catch (e) {
          toast(e.message, true);
        }
      };
    });
  }

  function openModelModal(row) {
    const isEdit = !!row;
    $('#modalTitle').textContent = isEdit ? 'Sửa model' : 'Thêm model';
    $('#modalBody').innerHTML = `
      <form id="modelForm">
        <label class="field"><span>ID (public)</span>
          <input name="id" required value="${esc(row?.id || '')}" ${isEdit ? 'readonly' : ''}>
        </label>
        <label class="field"><span>Tên hiển thị</span><input name="name" required value="${esc(row?.name || '')}"></label>
        <label class="field"><span>Upstream model (Ollama)</span>
          <input name="upstreamModel" required value="${esc(row?.upstreamModel || '')}">
        </label>
        <label class="field"><span>Sort order</span>
          <input name="sortOrder" type="number" value="${esc(row?.sortOrder ?? 0)}">
        </label>
        <label class="field"><span>Note</span><input name="note" value="${esc(row?.note || '')}"></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input name="enabled" type="checkbox" ${row?.enabled !== false ? 'checked' : ''}>
          <span>Enabled</span>
        </label>
        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Cập nhật' : 'Tạo model'}</button>
      </form>`;
    openModal();
    $('#modelForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        id: fd.get('id'),
        name: fd.get('name'),
        upstreamModel: fd.get('upstreamModel'),
        sortOrder: Number(fd.get('sortOrder') || 0),
        note: fd.get('note') || null,
        enabled: fd.get('enabled') === 'on'
      };
      try {
        if (isEdit) {
          const { id, ...patch } = body;
          await api(`/models/${row.id}`, { method: 'PUT', body: JSON.stringify(patch) });
        } else {
          await api('/models', { method: 'POST', body: JSON.stringify(body) });
        }
        closeModal();
        toast('Đã lưu model');
        loadModels();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  async function loadHistory() {
    const endpoint = $('#histEndpoint').value;
    const status = $('#histStatus').value;
    const q = new URLSearchParams({ limit: '100' });
    if (endpoint) q.set('endpoint', endpoint);
    if (status) q.set('status', status);
    const data = await api(`/history?${q}`);
    $('#historyBody').innerHTML = (data.items || [])
      .map((h) => {
        const badge =
          h.status === 'completed'
            ? 'badge-ok'
            : h.status === 'error'
              ? 'badge-err'
              : 'badge-run';
        return `<tr>
          <td class="muted">${esc(fmtTime(h.startedAt))}</td>
          <td class="mono">${esc(h.endpoint)}</td>
          <td>${esc(h.keyLabel || '—')}</td>
          <td class="mono">${esc(h.modelId || '—')}</td>
          <td><span class="badge ${badge}">${esc(h.status)}</span></td>
          <td class="mono">${h.durationMs ?? '—'}</td>
          <td class="muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.errorMessage || '')}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="7" class="muted">Chưa có lịch sử</td></tr>';
  }

  async function loadDaily() {
    const days = $('#dailyDays').value || '30';
    const rows = await api(`/stats/daily?days=${days}`);
    $('#dailyBody').innerHTML = rows
      .map((r) => {
        const avg = r.totalRequests ? Math.round(Number(r.totalDurationMs) / r.totalRequests) : 0;
        return `<tr>
          <td class="mono">${esc(r.date)}</td>
          <td class="mono">${esc(r.totalRequests)}</td>
          <td class="mono">${esc(r.successCount)}</td>
          <td class="mono">${esc(r.errorCount)}</td>
          <td class="mono">${esc(r.totalDurationMs)}</td>
          <td class="mono">${avg}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6" class="muted">Chưa có dữ liệu</td></tr>';
  }

  async function loadEndpoint() {
    const date = $('#endpointDate').value;
    const q = date ? `date=${encodeURIComponent(date)}` : 'days=30';
    const rows = await api(`/stats/endpoint?${q}`);
    $('#endpointBody').innerHTML = rows
      .map((r) => {
        const avg = r.totalRequests ? Math.round(Number(r.totalDurationMs) / r.totalRequests) : 0;
        return `<tr>
          <td class="mono">${esc(r.date)}</td>
          <td class="mono">${esc(r.endpoint)}</td>
          <td class="mono">${esc(r.totalRequests)}</td>
          <td class="mono">${esc(r.successCount)}</td>
          <td class="mono">${esc(r.errorCount)}</td>
          <td class="mono">${esc(r.totalDurationMs)}</td>
          <td class="mono">${avg}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="7" class="muted">Chưa có dữ liệu</td></tr>';
  }

  async function loadSettings() {
    const data = await api('/settings');
    const map = data.map || {};
    const form = $('#settingsForm');
    [...form.elements].forEach((el) => {
      if (el.name && map[el.name] !== undefined) el.value = map[el.name];
    });
  }

  function openModal() {
    $('#modal').classList.remove('hidden');
  }
  function closeModal() {
    $('#modal').classList.add('hidden');
    $('#modalBody').innerHTML = '';
  }

  // Events
  $('#loginBtn').onclick = async () => {
    const apiKey = $('#apiKeyInput').value.trim();
    const baseUrl = $('#baseUrlInput').value.trim() || '/api/dash';
    if (!apiKey) return showLogin('Nhập admin API key');
    saveAuth({ apiKey, baseUrl });
    try {
      await api('/realtime');
      showApp();
    } catch (e) {
      saveAuth(null);
      showLogin(e.message || 'Đăng nhập thất bại');
    }
  };

  $('#logoutBtn').onclick = () => {
    saveAuth(null);
    showLogin();
  };

  $$('.nav-item').forEach((btn) => {
    btn.onclick = () => switchPanel(btn.dataset.panel);
  });

  $('#refreshBtn').onclick = () => refreshCurrent().catch((e) => toast(e.message, true));
  $('#addKeyBtn').onclick = () => openKeyModal(null);
  $('#addModelBtn').onclick = () => openModelModal(null);
  $('#histEndpoint').onchange = () => loadHistory().catch((e) => toast(e.message, true));
  $('#histStatus').onchange = () => loadHistory().catch((e) => toast(e.message, true));
  $('#dailyDays').onchange = () => loadDaily().catch((e) => toast(e.message, true));
  $('#endpointDate').onchange = () => loadEndpoint().catch((e) => toast(e.message, true));

  $('#settingsForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const map = {};
    for (const [k, v] of fd.entries()) map[k] = v;
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ map }) });
      toast('Đã lưu cài đặt');
    } catch (err) {
      toast(err.message, true);
    }
  };

  $$('[data-close]').forEach((el) => {
    el.onclick = closeModal;
  });

  if (auth?.apiKey) {
    api('/realtime')
      .then(() => showApp())
      .catch(() => {
        saveAuth(null);
        showLogin();
      });
  }
})();
