const fs = require('fs');
const path = require('path');

let cachedToken = { value: null, expiresAt: 0 };

async function getFcmAccessToken() {
  const saPath = process.env.CANOPY_FCM_SERVICE_ACCOUNT_PATH;
  if (!saPath || !fs.existsSync(saPath)) return null;
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.value;
  }
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })
  ).toString('base64url');
  const crypto = require('crypto');
  const signInput = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signInput}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!data.access_token) return null;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

async function sendFcm({ token, title, body, data = {} }) {
  const mock = String(process.env.CANOPY_FCM_MOCK || 'true').toLowerCase() === 'true';
  if (mock) {
    return {
      status: 'sent',
      fcmMessageId: `mock-${Date.now()}`,
      fcmResponse: { mock: true, token: `${token.slice(0, 8)}...` }
    };
  }
  const projectId = process.env.CANOPY_FCM_PROJECT_ID;
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !projectId) {
    const err = new Error('FCM not configured');
    err.code = 'FCM_CONFIG';
    throw err;
  }
  const payload = {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    }
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const invalid = json?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED');
    return {
      status: 'failed',
      fcmResponse: json,
      invalidToken: invalid
    };
  }
  return {
    status: 'sent',
    fcmMessageId: json.name,
    fcmResponse: json
  };
}

module.exports = { sendFcm };
