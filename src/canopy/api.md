# Canopy API — Hướng dẫn sử dụng

**Domain:** [https://console.onewise.app/](https://console.onewise.app/)  
**Base URL Canopy:** `https://console.onewise.app/v1`  
**Admin console:** [https://console.onewise.app/mobile.html](https://console.onewise.app/mobile.html)  
**App:** Canopy (`com.canopy.treeid`)

Tài liệu mô tả API backend Canopy cho mobile: đăng ký thiết bị, premium, quota AI, push notification.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Xác thực](#2-xác-thực)
3. [Health](#3-health)
4. [Auth](#4-auth)
5. [User](#5-user)
6. [Billing](#6-billing)
7. [Usage — Quota AI](#7-usage--quota-ai)
8. [Admin](#8-admin)
9. [Luồng tích hợp app](#9-luồng-tích-hợp-app)
10. [Mã lỗi](#10-mã-lỗi)

---

## 1. Tổng quan

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|--------|
| `GET` | `/v1/health` | — | Kiểm tra service & MySQL |
| `POST` | `/v1/auth/register` | — | Đăng ký thiết bị |
| `POST` | `/v1/auth/refresh` | Refresh token | Làm mới JWT |
| `GET` | `/v1/users/me` | JWT | Profile user |
| `PATCH` | `/v1/users/me` | JWT | Heartbeat |
| `DELETE` | `/v1/users/me` | JWT | Xoá tài khoản |
| `PUT` | `/v1/users/me/push-token` | JWT | Đăng ký FCM |
| `DELETE` | `/v1/users/me/push-token` | JWT | Huỷ FCM token |
| `GET` | `/v1/users/me/subscription` | JWT | Trạng thái Premium |
| `POST` | `/v1/billing/verify-android` | JWT | Xác minh Google Play |
| `POST` | `/v1/usage/check` | JWT | Kiểm tra quota AI |
| `POST` | `/v1/usage/consume` | JWT | Trừ lượt AI |
| `GET` | `/v1/admin/stats` | Admin key | Thống kê |
| `GET` | `/v1/admin/users` | Admin key | Danh sách user |
| `GET` | `/v1/admin/users/find` | Admin key | Tìm user |
| `GET` | `/v1/admin/notifications/logs` | Admin key | Log push |
| `POST` | `/v1/admin/notifications/send` | Admin key | Gửi push 1 user |
| `POST` | `/v1/admin/notifications/broadcast` | Admin key | Gửi broadcast |

**Content-Type mặc định:** `application/json`

**Response lỗi chuẩn:**

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

## 2. Xác thực

### Mobile app (JWT)

```http
Authorization: Bearer <accessToken>
```

- `accessToken` từ `POST /v1/auth/register` hoặc `POST /v1/auth/refresh`
- Hết hạn → refresh; refresh fail → đăng ký lại

### Admin

```http
X-Admin-API-Key: <CANOPY_ADMIN_API_KEY>
```

Dùng cho `/v1/admin/*` và [mobile.html](https://console.onewise.app/mobile.html).

### Biến shell tiện test

```bash
export BASE="https://console.onewise.app/v1"
export TOKEN="<accessToken>"
export REFRESH="<refreshToken>"
export ADMIN_KEY="<admin_api_key>"
```

---

## 3. Health

### `GET /v1/health`

Không cần auth.

```bash
curl -sS "https://console.onewise.app/v1/health"
```

**Response 200:**

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

## 4. Auth

### `POST /v1/auth/register`

```bash
curl -sS -X POST "https://console.onewise.app/v1/auth/register" \
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
| `platform` | Có | `android` hoặc `ios` |
| `appVersion` | Có | VD: `1.0.0` |
| `locale` | Không | `vi`, `en` |
| `legacyUserId` | Không | `greenid...` khi migrate |

**Response:**

```json
{
  "success": true,
  "userId": "greenid1081635559",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "69b6cab137e43e52...",
  "isNewUser": true
}
```

---

### `POST /v1/auth/refresh`

```bash
curl -sS -X POST "https://console.onewise.app/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "'"$REFRESH"'"}'
```

**Response:**

```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "greenid1081635559"
}
```

---

## 5. User

### `GET /v1/users/me`

```bash
curl -sS "https://console.onewise.app/v1/users/me" \
  -H "Authorization: Bearer $TOKEN"
```

---

### `PATCH /v1/users/me`

```bash
curl -sS -X PATCH "https://console.onewise.app/v1/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appVersion": "1.0.1", "locale": "en"}'
```

---

### `DELETE /v1/users/me`

```bash
curl -sS -X DELETE "https://console.onewise.app/v1/users/me" \
  -H "Authorization: Bearer $TOKEN"
```

---

### `PUT /v1/users/me/push-token`

```bash
curl -sS -X PUT "https://console.onewise.app/v1/users/me/push-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "fcm-device-token-here",
    "provider": "fcm",
    "enabled": true
  }'
```

---

### `DELETE /v1/users/me/push-token`

```bash
curl -sS -X DELETE "https://console.onewise.app/v1/users/me/push-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "fcm-device-token-here"}'
```

---

### `GET /v1/users/me/subscription`

```bash
curl -sS "https://console.onewise.app/v1/users/me/subscription" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. Billing

### `POST /v1/billing/verify-android`

```bash
curl -sS -X POST "https://console.onewise.app/v1/billing/verify-android" \
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

---

## 7. Usage — Quota AI

Free: **3 lượt/ngày** (UTC+7). Premium: không giới hạn.

### `POST /v1/usage/check`

Gọi **trước** AI.

```bash
curl -sS -X POST "https://console.onewise.app/v1/usage/check" \
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

---

### `POST /v1/usage/consume`

Gọi **sau** AI thành công.

```bash
curl -sS -X POST "https://console.onewise.app/v1/usage/consume" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "scan-uuid-001"}'
```

---

## 8. Admin

```bash
export ADMIN_KEY="your-admin-api-key"
```

### `GET /v1/admin/stats`

```bash
curl -sS "https://console.onewise.app/v1/admin/stats" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

### `GET /v1/admin/users`

```bash
curl -sS "https://console.onewise.app/v1/admin/users?page=1&limit=20&search=greenid" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

### `GET /v1/admin/users/find`

```bash
curl -sS "https://console.onewise.app/v1/admin/users/find?q=greenid1081635559" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

### `POST /v1/admin/notifications/send`

```bash
curl -sS -X POST "https://console.onewise.app/v1/admin/notifications/send" \
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
| `plant_reminder` | Nhắc tưới / bón phân |
| `promo` | Khuyến mãi Premium |
| `system` | Bảo trì, cập nhật |
| `ai_limit` | Hết lượt free |

---

### `POST /v1/admin/notifications/broadcast`

```bash
curl -sS -X POST "https://console.onewise.app/v1/admin/notifications/broadcast" \
  -H "X-Admin-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Canopy",
    "body": "Ưu đãi Premium 50%",
    "locale": "vi",
    "isPremium": false,
    "data": { "type": "promo", "screen": "premium" }
  }'
```

---

### `GET /v1/admin/notifications/logs`

```bash
curl -sS "https://console.onewise.app/v1/admin/notifications/logs?page=1&limit=30" \
  -H "X-Admin-API-Key: $ADMIN_KEY"
```

---

## 9. Luồng tích hợp app

```
Mở app
  → POST /v1/auth/register
  → PATCH /v1/users/me
  → PUT  /v1/users/me/push-token

Trước AI
  → POST /v1/usage/check
  → (gọi OneWise AI tại https://console.onewise.app/api/ai)
  → POST /v1/usage/consume

Mua Premium
  → Google Play IAP
  → POST /v1/billing/verify-android
  → GET  /v1/users/me/subscription
```

---

## 10. Mã lỗi

| HTTP | Code | Mô tả |
|------|------|--------|
| `400` | `VALIDATION` | Thiếu/sai tham số |
| `401` | `UNAUTHORIZED` | JWT không hợp lệ |
| `401` | `TOKEN_EXPIRED` | JWT hết hạn |
| `401` | `INVALID_REFRESH` | Refresh token sai |
| `403` | `FORBIDDEN` | Sai admin key |
| `403` | `DAILY_LIMIT` | Hết lượt AI free |
| `404` | `NOT_FOUND` | Không tìm thấy |
| `429` | `RATE_LIMIT` | Quá nhiều register |
| `503` | `DB_UNAVAILABLE` | MySQL chưa sẵn sàng |

---

## Quick test

```bash
export BASE="https://console.onewise.app/v1"

curl -sS "$BASE/health"

curl -sS -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-001","platform":"android","appVersion":"1.0.0","locale":"vi"}'

export TOKEN="<accessToken>"

curl -sS "$BASE/users/me" -H "Authorization: Bearer $TOKEN"

curl -sS -X POST "$BASE/usage/check" -H "Authorization: Bearer $TOKEN"
```

---

## Liên quan

| Tài nguyên | URL |
|------------|-----|
| Production | [https://console.onewise.app/](https://console.onewise.app/) |
| Canopy API | `https://console.onewise.app/v1` |
| Admin UI | [https://console.onewise.app/mobile.html](https://console.onewise.app/mobile.html) |
| AI API | `https://console.onewise.app/api/ai` |
