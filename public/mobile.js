const LS_KEY = 'canopy_admin_key';
const LS_BASE = 'canopy_admin_base';
let userPage = 1;
let selectedSendType = 'plant_reminder';

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
  toast('Đã lưu');
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
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const title = btn.dataset.title || PANEL_TITLES[name] || name;
  document.getElementById('pageTitle').textContent = title;
  closeSidebar();
  if (name === 'users') loadUsers(false);
  if (name === 'logs') loadLogs();
}

async function loadStats() {
  try {
    const r = await api('/admin/stats');
    document.getElementById('stUsers').textContent = r.data.totalUsers;
    document.getElementById('stPremium').textContent = r.data.premiumUsers;
    document.getElementById('stNotif').textContent = r.data.notificationsSent;
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
    document.getElementById('findResult').innerHTML = renderUser(u);
    document.getElementById('sendUserId').value = u.userId || u.legacyGreenId;
  } catch (e) {
    document.getElementById('findResult').innerHTML = '<p class="err-text">' + e.message + '</p>';
  }
}

function renderUser(u) {
  const prem = u.isPremium ? '<span class="pill premium">Premium</span>' : '';
  return (
    '<div class="user-item"><div class="id">' +
    (u.userId || u.legacyGreenId) +
    prem +
    '</div><div class="meta">' +
    u.platform +
    ' · ' +
    (u.locale || '—') +
    ' · v' +
    (u.appVersion || '—') +
    '</div><div class="meta">device: ' +
    u.deviceId +
    '</div></div>'
  );
}

async function loadUsers(more = false) {
  if (!more) {
    userPage = 1;
    document.getElementById('userList').innerHTML = '';
  }
  const search = document.getElementById('userSearch').value.trim();
  try {
    const r = await api(
      '/admin/users?page=' + userPage + '&limit=15&search=' + encodeURIComponent(search)
    );
    const html = r.data.users.map(renderUser).join('');
    document.getElementById('userList').insertAdjacentHTML('beforeend', html);
    const moreBtn = document.getElementById('userMore');
    if (r.data.users.length >= 15) moreBtn.classList.remove('hidden');
    else moreBtn.classList.add('hidden');
    if (more) userPage++;
    else userPage = 2;
  } catch (e) {
    toast(e.message, false);
  }
}

async function sendPush() {
  const userId = document.getElementById('sendUserId').value.trim();
  const title = document.getElementById('sendTitle').value.trim();
  const body = document.getElementById('sendBody').value.trim();
  const screen = document.getElementById('sendScreen').value.trim();
  const plantId = document.getElementById('sendPlantId').value.trim();
  if (!userId || !body) return toast('Thiếu userId hoặc nội dung', false);
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
  if (confirm('Gửi broadcast tới nhiều user?')) broadcastPush(true);
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

async function loadLogs() {
  try {
    const r = await api('/admin/notifications/logs?limit=30');
    document.getElementById('logList').innerHTML =
      r.data.logs
        .map(
          (l) =>
            '<div class="log-item"><strong>' +
            l.title +
            '</strong> — <span class="st-' +
            l.status +
            '">' +
            l.status +
            '</span><br><span class="muted-text">' +
            (l.body || '').slice(0, 80) +
            '</span><br><span class="muted-text small">' +
            new Date(l.sentAt).toLocaleString('vi') +
            '</span></div>'
        )
        .join('') || '<p class="muted-text">Chưa có log</p>';
  } catch (e) {
    toast(e.message, false);
  }
}

function bindActions() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'saveLogin') saveLogin();
    if (action === 'loadStats') loadStats();
    if (action === 'findUser') findUser();
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
  });

  document.getElementById('userSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadUsers(false);
  });

  document.querySelectorAll('#sendTypes .type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sendTypes .type-btn').forEach((b) => b.classList.remove('active'));
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
