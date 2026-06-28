const LS_KEY = 'canopy_admin_key';
const LS_BASE = 'canopy_admin_base';
let userPage = 1;
let selectedSendType = 'plant_reminder';
let premiumTargetUser = null;
let premiumTargetData = null;

const PANEL_TITLES = {
  dashboard: 'Tổng quan',
  send: 'Gửi push',
  broadcast: 'Broadcast',
  users: 'Người dùng',
  logs: 'Nhật ký push',
  settings: 'Cài đặt'
};

function cfg() {
  return {
    key: localStorage.getItem(LS_KEY) || '',
    base: (localStorage.getItem(LS_BASE) || '/v1').replace(/\/$/, '')
  };
}

function toast(msg, ok = true) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (ok ? 'ok' : 'err');
  setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(path, opts = {}) {
  const { key, base } = cfg();
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-API-Key': key,
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.error?.message || data.message || res.statusText;
    throw new Error(msg);
  }
  return data;
}

function setDbStatus(ok, text) {
  const pill = document.getElementById('dbStatus');
  const label = document.getElementById('dbStatusText');
  if (!pill || !label) return;
  pill.classList.remove('ok', 'err');
  pill.classList.add(ok ? 'ok' : 'err');
  label.textContent = text;
}

function saveLogin() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const base = document.getElementById('baseUrlInput').value.trim() || '/v1';
  if (!key) return toast('Nhập Admin API Key', false);
  localStorage.setItem(LS_KEY, key);
  localStorage.setItem(LS_BASE, base);
  showApp();
}

function saveSettings() {
  localStorage.setItem(LS_KEY, document.getElementById('settingsKey').value.trim());
  localStorage.setItem(LS_BASE, document.getElementById('settingsBase').value.trim() || '/v1');
  document.getElementById('connBadge').textContent = cfg().base;
  toast('Đã lưu cài đặt');
}

function logout() {
  localStorage.removeItem(LS_KEY);
  closeSidebar();
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('settingsKey').value = cfg().key;
  document.getElementById('settingsBase').value = cfg().base;
  document.getElementById('connBadge').textContent = cfg().base;
  checkDbHealth();
  loadStats();
  loadDauChart();
}

async function checkDbHealth() {
  try {
    const { base } = cfg();
    const res = await fetch(base + '/health');
    const data = await res.json().catch(() => ({}));
    if (data.dbReady) {
      setDbStatus(true, 'MySQL đã kết nối');
    } else {
      setDbStatus(false, 'MySQL chưa sẵn sàng');
      toast(data.dbError || 'Kiểm tra MYSQL_PASSWORD trong .env', false);
    }
  } catch (e) {
    setDbStatus(false, 'API không phản hồi');
    toast('Không gọi được API: ' + e.message, false);
  }
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function switchPanel(name, btn) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
  const navBtn = document.querySelector('.sidebar-nav .nav-link[data-panel="' + name + '"]')
    || document.querySelector('.sidebar-foot .nav-link[data-panel="' + name + '"]');
  if (navBtn) navBtn.classList.add('active');
  const title = btn?.dataset?.title || PANEL_TITLES[name] || name;
  document.getElementById('pageTitle').textContent = title;
  closeSidebar();
  if (name === 'users') loadUsers(false);
  if (name === 'logs') loadLogs();
  if (name === 'dashboard') {
    loadStats();
    loadDauChart();
  }
}

function userIdOf(u) {
  return u.userId || u.legacyGreenId || u.id;
}

function goToSendPush(userId) {
  document.getElementById('sendUserId').value = userId;
  const sendBtn = document.querySelector('.nav-link[data-panel="send"]');
  switchPanel('send', sendBtn);
  toast('Đã điền User ID — nhập nội dung và gửi');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi', { dateStyle: 'short', timeStyle: 'short' });
}

function renderUserRow(u) {
  const uid = userIdOf(u);
  const prem = u.isPremium
    ? '<span class="badge badge-premium">Premium</span>'
    : '<span class="badge badge-free">Free</span>';
  return (
    '<tr data-user-id="' + escapeHtml(uid) + '">' +
    '<td class="mono">' + escapeHtml(uid) + '</td>' +
    '<td>' + escapeHtml(u.platform || '—') + '</td>' +
    '<td>' + escapeHtml(u.locale || '—') + '</td>' +
    '<td class="muted">v' + escapeHtml(u.appVersion || '—') + '</td>' +
    '<td>' + prem + '</td>' +
    '<td class="muted" style="white-space:nowrap">' + formatDateTime(u.lastSeenAt) + '</td>' +
    '<td class="truncate muted" title="' + escapeHtml(u.deviceId || '') + '">' + escapeHtml(u.deviceId || '—') + '</td>' +
    '<td><div class="action-group">' +
    '<button type="button" class="btn-table-gold" data-action="openPremium" data-user-id="' + escapeHtml(uid) + '">Premium</button>' +
    '<button type="button" class="btn-table" data-action="sendToUser" data-user-id="' + escapeHtml(uid) + '">Push</button>' +
    '<button type="button" class="btn-table-danger" data-action="deleteUser" data-user-id="' + escapeHtml(uid) + '">Xoá</button>' +
    '</div></td>' +
    '</tr>'
  );
}

function renderUserCard(u) {
  const uid = userIdOf(u);
  const prem = u.isPremium ? '<span class="badge badge-premium">Premium</span>' : '';
  return (
    '<div class="user-card">' +
    '<div class="user-card-info">' +
    '<div class="uid">' + uid + ' ' + prem + '</div>' +
    '<div class="meta">' + u.platform + ' · ' + (u.locale || '—') + ' · v' + (u.appVersion || '—') + '</div>' +
    '<div class="meta">device: ' + escapeHtml(u.deviceId) + '</div>' +
    (u.isPremium && u.premiumExpiresAt
      ? '<div class="meta">Premium đến: ' + formatDateTime(u.premiumExpiresAt) + '</div>'
      : u.isPremium
        ? '<div class="meta">Premium: Lifetime</div>'
        : '') +
    '</div>' +
    '<div class="user-card-actions">' +
    '<button type="button" class="btn btn-secondary btn-sm" data-action="openPremium" data-user-id="' + escapeHtml(uid) + '">Premium</button>' +
    '<button type="button" class="btn btn-primary btn-sm" data-action="sendToUser" data-user-id="' + escapeHtml(uid) + '">Gửi push</button>' +
    '<button type="button" class="btn btn-danger-outline btn-sm" data-action="deleteUser" data-user-id="' + escapeHtml(uid) + '">Xoá</button>' +
    '</div>' +
    '</div>'
  );
}

async function loadStats() {
  try {
    const r = await api('/admin/stats');
    document.getElementById('stUsers').textContent = r.data.totalUsers;
    document.getElementById('stPremium').textContent = r.data.premiumUsers;
    document.getElementById('stNotif').textContent = r.data.notificationsSent;
    document.getElementById('stActiveToday').textContent = r.data.activeToday ?? '—';
    const yEl = document.getElementById('stActiveYesterday');
    if (yEl) yEl.textContent = r.data.activeYesterday ?? '—';
  } catch (e) {
    toast(e.message, false);
  }
}

async function loadDauChart() {
  const el = document.getElementById('dauChart');
  if (!el) return;
  const days = document.getElementById('dauDays')?.value || 14;
  el.innerHTML = '<div class="dau-empty">Đang tải...</div>';
  try {
    const r = await api('/admin/stats/daily-active?days=' + days);
    const series = r.data.series || [];
    if (!series.length) {
      el.innerHTML = '<div class="dau-empty">Chưa có dữ liệu truy cập</div>';
      return;
    }
    const max = Math.max(...series.map((s) => s.count), 1);
    el.innerHTML = series.map((s) => {
      const h = Math.max(4, Math.round((s.count / max) * 160));
      const label = s.date.slice(5);
      return (
        '<div class="dau-bar-wrap" title="' + s.date + ': ' + s.count + ' user">' +
        '<span class="dau-count">' + s.count + '</span>' +
        '<div class="dau-bar" style="height:' + h + 'px"></div>' +
        '<span class="dau-label">' + label + '</span>' +
        '</div>'
      );
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="dau-empty err-text">' + escapeHtml(e.message) + '</div>';
  }
}

async function createUser() {
  const deviceId = document.getElementById('newDeviceId').value.trim();
  const platform = document.getElementById('newPlatform').value;
  const appVersion = document.getElementById('newAppVersion').value.trim();
  const locale = document.getElementById('newLocale').value;
  const legacyUserId = document.getElementById('newLegacyId').value.trim();
  const isPremium = document.getElementById('newPremium').value === 'true';
  if (!deviceId || !appVersion) return toast('Nhập Device ID và App version', false);
  try {
    const r = await api('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        platform,
        appVersion,
        locale,
        legacyUserId: legacyUserId || undefined,
        isPremium
      })
    });
    toast('Đã tạo user: ' + userIdOf(r.data));
    document.getElementById('newDeviceId').value = '';
    document.getElementById('newLegacyId').value = '';
    loadUsers(false);
    loadStats();
    loadDauChart();
  } catch (e) {
    toast(e.message, false);
  }
}

async function deleteUser(userId) {
  if (!userId) return;
  if (!confirm('Xoá user ' + userId + '? Toàn bộ dữ liệu liên quan sẽ bị xoá.')) return;
  try {
    await api('/admin/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    toast('Đã xoá user');
    loadUsers(false);
    loadStats();
    loadDauChart();
  } catch (e) {
    toast(e.message, false);
  }
}

function premiumStatusText(u) {
  if (!u || !u.isPremium) return 'Hiện tại: <strong>Free</strong>';
  const plan = u.premiumPlan ? ' (' + u.premiumPlan + ')' : '';
  if (!u.premiumExpiresAt) return 'Hiện tại: <strong>Premium' + plan + ' — Lifetime</strong>';
  return 'Hiện tại: <strong>Premium' + plan + '</strong> — hết hạn ' + formatDateTime(u.premiumExpiresAt);
}

async function openPremiumModal(userId) {
  premiumTargetUser = userId;
  premiumTargetData = null;
  document.getElementById('premiumModalUser').textContent = userId;
  document.getElementById('premiumDays').value = '';
  document.getElementById('premiumPlan').value = 'monthly';
  const statusEl = document.getElementById('premiumCurrent');
  statusEl.className = 'premium-status';
  statusEl.innerHTML = 'Đang tải...';
  document.getElementById('premiumModal').classList.remove('hidden');
  try {
    const r = await api('/admin/users/find?q=' + encodeURIComponent(userId));
    premiumTargetData = r.data;
    statusEl.innerHTML = premiumStatusText(r.data);
    if (r.data.isPremium) statusEl.classList.add('active');
    if (r.data.premiumPlan) {
      document.getElementById('premiumPlan').value = r.data.premiumPlan;
    }
  } catch (e) {
    statusEl.innerHTML = '<span class="err-text">' + escapeHtml(e.message) + '</span>';
  }
}

function closePremiumModal() {
  document.getElementById('premiumModal').classList.add('hidden');
  premiumTargetUser = null;
  premiumTargetData = null;
}

async function grantPremium() {
  if (!premiumTargetUser) return;
  const premiumPlan = document.getElementById('premiumPlan').value;
  const daysRaw = document.getElementById('premiumDays').value.trim();
  const payload = { isPremium: true, premiumPlan };
  if (daysRaw) payload.days = Number(daysRaw);
  try {
    const r = await api('/admin/users/' + encodeURIComponent(premiumTargetUser) + '/premium', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    premiumTargetData = r.data;
    const statusEl = document.getElementById('premiumCurrent');
    statusEl.innerHTML = premiumStatusText(r.data);
    statusEl.className = 'premium-status active';
    toast('Đã nâng Premium cho ' + premiumTargetUser);
    loadUsers(false);
    loadStats();
  } catch (e) {
    toast(e.message, false);
  }
}

async function revokePremium() {
  if (!premiumTargetUser) return;
  if (!confirm('Huỷ Premium cho ' + premiumTargetUser + '?')) return;
  try {
    const r = await api('/admin/users/' + encodeURIComponent(premiumTargetUser) + '/premium', {
      method: 'PATCH',
      body: JSON.stringify({ isPremium: false })
    });
    premiumTargetData = r.data;
    const statusEl = document.getElementById('premiumCurrent');
    statusEl.innerHTML = premiumStatusText(r.data);
    statusEl.className = 'premium-status';
    document.getElementById('premiumPlan').value = 'monthly';
    toast('Đã huỷ Premium');
    loadUsers(false);
    loadStats();
  } catch (e) {
    toast(e.message, false);
  }
}

async function findUser() {
  const q = document.getElementById('findQ').value.trim();
  if (!q) return;
  try {
    const r = await api('/admin/users/find?q=' + encodeURIComponent(q));
    const u = r.data;
    document.getElementById('findResult').innerHTML = renderUserCard(u);
    document.getElementById('sendUserId').value = userIdOf(u);
  } catch (e) {
    document.getElementById('findResult').innerHTML = '<p class="err-text">' + e.message + '</p>';
  }
}

async function loadUsers(more = false) {
  const tbody = document.getElementById('userList');
  if (!more) {
    userPage = 1;
    tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Đang tải...</td></tr>';
  }
  const search = document.getElementById('userSearch').value.trim();
  try {
    const r = await api(
      '/admin/users?page=' + userPage + '&limit=20&search=' + encodeURIComponent(search)
    );
    const rows = r.data.users.map(renderUserRow).join('');
    if (!more) tbody.innerHTML = rows;
    else tbody.insertAdjacentHTML('beforeend', rows);
    if (!rows && !more) {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Không tìm thấy user</td></tr>';
    }
    const moreBtn = document.getElementById('userMore');
    if (r.data.users.length >= 20) moreBtn.classList.remove('hidden');
    else moreBtn.classList.add('hidden');
    if (more) userPage++;
    else userPage = 2;
  } catch (e) {
    tbody.innerHTML = '<tr class="table-empty"><td colspan="8" class="err-text">' + escapeHtml(e.message) + '</td></tr>';
    toast(e.message, false);
  }
}

async function sendPush() {
  const userId = document.getElementById('sendUserId').value.trim();
  const title = document.getElementById('sendTitle').value.trim();
  const body = document.getElementById('sendBody').value.trim();
  const screen = document.getElementById('sendScreen').value.trim();
  const plantId = document.getElementById('sendPlantId').value.trim();
  if (!userId || !body) return toast('Thiếu User ID hoặc nội dung', false);
  const data = { type: selectedSendType };
  if (screen) data.screen = screen;
  if (plantId) data.plantId = plantId;
  try {
    const r = await api('/admin/notifications/send', {
      method: 'POST',
      body: JSON.stringify({ userId, title, body, data })
    });
    toast('Đã gửi: ' + r.data.sent + ' thành công, ' + r.data.failed + ' lỗi');
  } catch (e) {
    toast(e.message, false);
  }
}

function confirmBroadcast() {
  if (confirm('Gửi broadcast tới nhiều user? Hành động này không thể hoàn tác.')) {
    broadcastPush(true);
  }
}

async function broadcastPush(confirmed) {
  if (!confirmed && !confirm('Gửi broadcast?')) return;
  const title = document.getElementById('bcTitle').value.trim();
  const body = document.getElementById('bcBody').value.trim();
  const locale = document.getElementById('bcLocale').value;
  const prem = document.getElementById('bcPremium').value;
  const type = document.getElementById('bcType').value;
  if (!body) return toast('Nhập nội dung', false);
  const payload = { title, body, data: { type } };
  if (locale) payload.locale = locale;
  if (prem === 'true') payload.isPremium = true;
  if (prem === 'false') payload.isPremium = false;
  try {
    const r = await api('/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Broadcast: ' + r.data.users + ' users, ' + r.data.sent + ' sent');
  } catch (e) {
    toast(e.message, false);
  }
}

function statusBadge(status) {
  const cls = status === 'sent' ? 'badge-sent' : 'badge-' + status;
  return '<span class="badge ' + cls + '">' + status + '</span>';
}

async function loadLogs() {
  const tbody = document.getElementById('logList');
  tbody.innerHTML = '<tr class="table-empty"><td colspan="4">Đang tải...</td></tr>';
  try {
    const r = await api('/admin/notifications/logs?limit=50');
    if (!r.data.logs.length) {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="4">Chưa có nhật ký</td></tr>';
      return;
    }
    tbody.innerHTML = r.data.logs.map((l) =>
      '<tr>' +
      '<td class="muted" style="white-space:nowrap">' + new Date(l.sentAt).toLocaleString('vi') + '</td>' +
      '<td><strong>' + escapeHtml(l.title) + '</strong></td>' +
      '<td class="truncate muted" title="' + escapeHtml(l.body || '') + '">' + escapeHtml((l.body || '').slice(0, 60)) + '</td>' +
      '<td>' + statusBadge(l.status) + '</td>' +
      '</tr>'
    ).join('');
  } catch (e) {
    tbody.innerHTML = '<tr class="table-empty"><td colspan="4" class="err-text">' + e.message + '</td></tr>';
    toast(e.message, false);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindActions() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'saveLogin') saveLogin();
    if (action === 'loadStats') {
      loadStats();
      loadDauChart();
    }
    if (action === 'findUser') findUser();
    if (action === 'createUser') createUser();
    if (action === 'deleteUser') deleteUser(btn.dataset.userId);
    if (action === 'openPremium') openPremiumModal(btn.dataset.userId);
    if (action === 'closePremiumModal') closePremiumModal();
    if (action === 'grantPremium') grantPremium();
    if (action === 'revokePremium') revokePremium();
    if (action === 'sendPush') sendPush();
    if (action === 'broadcastPush') broadcastPush(false);
    if (action === 'confirmBroadcast') confirmBroadcast();
    if (action === 'loadUsers') loadUsers(false);
    if (action === 'loadUsersMore') loadUsers(true);
    if (action === 'loadLogs') loadLogs();
    if (action === 'saveSettings') saveSettings();
    if (action === 'logout') logout();
    if (action === 'switchPanel') switchPanel(btn.dataset.panel, btn);
    if (action === 'toggleSidebar') toggleSidebar();
    if (action === 'closeSidebar') closeSidebar();
    if (action === 'sendToUser') goToSendPush(btn.dataset.userId);
  });

  document.getElementById('findQ').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findUser();
  });

  document.getElementById('userSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadUsers(false);
  });

  document.getElementById('apiKeyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveLogin();
  });

  const dauDays = document.getElementById('dauDays');
  if (dauDays) {
    dauDays.addEventListener('change', loadDauChart);
  }

  document.querySelectorAll('#sendTypes .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sendTypes .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSendType = btn.dataset.type;
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindActions();
  if (cfg().key) showApp();
  else document.getElementById('apiKeyInput').focus();
});
