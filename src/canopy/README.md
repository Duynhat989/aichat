# Canopy API

Backend cho app **Canopy** (`com.canopy.treeid`) — auth thiết bị, premium, quota AI, push notification.

**Base URL:** `http://localhost:2053/v1`  
**Admin UI:** `http://localhost:2053/mobile.html`

---

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `MYSQL_*` | MySQL database `aichat`, bảng `canopy_*` |
| `CANOPY_JWT_SECRET` | Ký JWT access token |
| `CANOPY_ADMIN_API_KEY` | Header admin `X-Admin-API-Key` |
| `CANOPY_FREE_DAILY_LIMIT` | Lượt AI free/ngày (mặc định `3`) |
| `CANOPY_BILLING_MOCK` | `true` = verify IAP giả lập |
| `CANOPY_FCM_MOCK` | `true` = push giả lập (log) |

Setup DB lần đầu:

```bash
MYSQL_ROOT_PASSWORD=<root_pass> MYSQL_PASSWORD=<app_pass> npm run setup:canopy-db
```

---

## Xác thực

| Loại | Header |
|------|--------|
| User (mobile) | `Authorization: Bearer <accessToken>` |
| Admin | `X-Admin-API-Key: <CANOPY_ADMIN_API_KEY>` |

**Lỗi chuẩn:**

```json
{
  "success": false,
  "error": {
    "code": "DAILY_LIMIT",
    "message": "Đã hết lượt miễn phí hôm nay"
  }
}
```

---

## Health

### GET /v1/health

Không cần auth. Kiểm tra DB.

```bash
curl -s http://localhost:2053/v1/health
```

```json
{
  "success": true,
  "service": "canopy-api",
  "dbReady": true,
  "dbError": null,
  "time": "2026-06-28T10:00:00.000Z"
}
```

---

## Auth

### POST /v1/auth/register

Đăng ký thiết bị lần đầu (hoặc đăng nhập lại cùng `deviceId` + `platform`).

```bash
curl -s -X POST http://localhost:2053/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "platform": "android",
    "appVersion": "1.0.0",
    "locale": "vi",
    "legacyUserId": "greenid1234567890"
  }'
```

| Field | Bắt buộc | Mô tả |
|-------|----------|--------|
| `deviceId` | Có | UUID cố định trên thiết bị |
| `platform` | Có | `android` \| `ios` |
| `appVersion` | Có | VD: `1.0.0` |
| `locale` | Không | `vi`, `en` |
| `legacyUserId` | Không | `greenid...` khi migrate user cũ |

```json
{
  "success": true,
  "userId": "greenid1081635559",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "69b6cab137e43e52...",
  "isNewUser": true
}
```

Lưu `accessToken` và `refreshToken` cho các request sau:

```bash
export TOKEN="<accessToken>"
export REFRESH="<refreshToken>"
```

---

### POST /v1/auth/refresh

```bash
curl -s -X POST http://localhost:2053/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "'"$REFRESH"'"
  }'
```

```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "greenid1081635559"
}
```

---

## User

### GET /v1/users/me

Profile + trạng thái premium.

```bash
curl -s http://localhost:2053/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "id": "df8ce60d-0dd5-44b0-9025-32a5f0cab605",
    "userId": "greenid1081635559",
    "legacyGreenId": "greenid1081635559",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "platform": "android",
    "locale": "vi",
    "appVersion": "1.0.0",
    "isPremium": false,
    "premiumPlan": null,
    "premiumExpiresAt": null,
    "createdAt": "2026-06-28T10:00:00.000Z",
    "lastSeenAt": "2026-06-28T10:00:00.000Z"
  }
}
```

---

### PATCH /v1/users/me

Heartbeat — cập nhật `last_seen_at`, `app_version`, `locale`.

```bash
curl -s -X PATCH http://localhost:2053/v1/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appVersion": "1.0.1",
    "locale": "en"
  }'
```

---

### DELETE /v1/users/me

Xoá tài khoản (GDPR).

```bash
curl -s -X DELETE http://localhost:2053/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "message": "Account deleted"
}
```

---

### PUT /v1/users/me/push-token

Đăng ký FCM token.

```bash
curl -s -X PUT http://localhost:2053/v1/users/me/push-token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "fcm-device-token-here",
    "provider": "fcm",
    "enabled": true
  }'
```

---

### DELETE /v1/users/me/push-token

Huỷ nhận push.

```bash
curl -s -X DELETE http://localhost:2053/v1/users/me/push-token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "fcm-device-token-here"
  }'
```

---

### GET /v1/users/me/subscription

Restore / kiểm tra premium từ server.

```bash
curl -s http://localhost:2053/v1/users/me/subscription \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "isPremium": true,
    "premiumPlan": "monthly",
    "premiumExpiresAt": "2026-07-28T10:00:00.000Z",
    "latestPurchase": {
      "productId": "premium_monthly",
      "status": "active",
      "expiresAt": "2026-07-28T10:00:00.000Z",
      "updatedAt": "2026-06-28T10:00:00.000Z"
    }
  }
}
```

---

## Billing

### POST /v1/billing/verify-android

Xác minh mua Google Play (mock khi `CANOPY_BILLING_MOCK=true`).

```bash
curl -s -X POST http://localhost:2053/v1/billing/verify-android \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "premium_monthly",
    "purchaseToken": "google-play-purchase-token",
    "packageName": "com.canopy.treeid"
  }'
```

| `productId` | Gói |
|-------------|-----|
| `premium_monthly` | 30 ngày |
| `premium_yearly` | 365 ngày |
| `lifetime` | Vĩnh viễn |

```json
{
  "success": true,
  "data": {
    "isPremium": true,
    "premiumPlan": "monthly",
    "premiumExpiresAt": "2026-07-28T10:00:00.000Z",
    "status": "active"
  }
}
```

---

## Usage (quota AI)

Free: **3 lượt/ngày** (timezone `Asia/Ho_Chi_Minh`). Premium: không giới hạn.

### POST /v1/usage/check

Gọi **trước** khi dùng AI (OneWise).

```bash
curl -s -X POST http://localhost:2053/v1/usage/check \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "allowed": true,
  "remaining": 3,
  "resetsAt": "2026-06-29T00:00:00.000Z"
}
```

Premium: `"remaining": -1` (không giới hạn).

---

### POST /v1/usage/consume

Gọi **sau** khi AI thành công. Idempotent theo `requestId`.

```bash
curl -s -X POST http://localhost:2053/v1/usage/consume \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "scan-uuid-001"
  }'
```

```json
{
  "success": true,
  "consumed": true,
  "remaining": 2
}
```

Hết lượt:

```json
{
  "success": false,
  "error": {
    "code": "DAILY_LIMIT",
    "message": "Đã hết lượt miễn phí hôm nay"
  }
}
```

---

## Admin

Header bắt buộc: `X-Admin-API-Key`

```bash
export ADMIN_KEY="canopy-admin-dev-key"
```

### GET /v1/admin/stats

```bash
curl -s http://localhost:2053/v1/admin/stats \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

```json
{
  "success": true,
  "data": {
    "totalUsers": 10,
    "premiumUsers": 2,
    "notificationsSent": 5
  }
}
```

---

### GET /v1/admin/users

```bash
curl -s "http://localhost:2053/v1/admin/users?page=1&limit=20&search=greenid" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

### GET /v1/admin/users/find

Tìm theo UUID, `greenid`, hoặc `deviceId`.

```bash
curl -s "http://localhost:2053/v1/admin/users/find?q=greenid1081635559" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

### POST /v1/admin/notifications/send

Gửi push cho 1 user.

```bash
curl -s -X POST http://localhost:2053/v1/admin/notifications/send \
  -H "X-Admin-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "greenid1081635559",
    "title": "Canopy",
    "body": "Đến giờ tưới cây Monstera",
    "data": {
      "type": "plant_reminder",
      "plantId": "plant-123",
      "screen": "plants"
    }
  }'
```

| `data.type` | Mục đích |
|-------------|----------|
| `plant_reminder` | Nhắc tưới/bón phân |
| `promo` | Khuyến mãi Premium |
| `system` | Bảo trì, cập nhật |
| `ai_limit` | Hết lượt free |

```json
{
  "success": true,
  "data": {
    "sent": 1,
    "failed": 0
  }
}
```

---

### POST /v1/admin/notifications/broadcast

```bash
curl -s -X POST http://localhost:2053/v1/admin/notifications/broadcast \
  -H "X-Admin-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Canopy",
    "body": "Ưu đãi Premium 50%",
    "locale": "vi",
    "isPremium": false,
    "data": {
      "type": "promo",
      "screen": "premium"
    }
  }'
```

---

### GET /v1/admin/notifications/logs

```bash
curl -s "http://localhost:2053/v1/admin/notifications/logs?page=1&limit=30" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

## Luồng app (tóm tắt)

```
Mở app lần đầu
  → POST /v1/auth/register
  → Lưu accessToken + userId
  → PUT  /v1/users/me/push-token

Trước AI (quét/chẩn đoán/chat)
  → POST /v1/usage/check
  → (gọi OneWise)
  → POST /v1/usage/consume

Mua Premium
  → Google Play IAP
  → POST /v1/billing/verify-android
  → GET  /v1/users/me/subscription
```

---

## Database

MySQL `aichat`, bảng riêng (không đụng bảng cũ):

| Bảng | Mô tả |
|------|--------|
| `canopy_users` | User / thiết bị |
| `canopy_push_tokens` | FCM tokens |
| `canopy_refresh_tokens` | Refresh token hash |
| `canopy_subscriptions` | Google Play purchases |
| `canopy_usage_daily` | Quota AI theo ngày |
| `canopy_notification_logs` | Log push |
