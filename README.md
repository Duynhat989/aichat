# TrueCallId - Phone Spam Checker API

Backend Node.js kiểm tra số điện thoại spam: **cache MongoDB trước**, nếu thiếu hoặc hết hạn thì **gọi HTTP service ngoài** (cấu hình bằng `PHONE_LOOKUP_URL`), rồi lưu kết quả.

**Base URL API:** `https://callid.onewise.app/api` — trang dịch vụ: [callid.onewise.app](https://callid.onewise.app/).

---

## Danh sách API

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|--------|
| `POST` | `/api/phones/check` | Tra cứu **một** số (body hoặc query) |
| `GET` | `/api/phones/:phone` | Tra cứu **một** số (số nằm trong URL) |
| `POST` | `/api/phones/check-bulk` | Tra cứu **nhiều** số trong một request |

---

## `POST /api/phones/check`

Tra cứu một số.

**Tham số**

| Tên | Vị trí | Bắt buộc | Mô tả |
|-----|--------|----------|--------|
| `phone` | body hoặc query | Có | Chuỗi số điện thoại |
| `countryCode` | body hoặc query | Không | Gợi ý mã quốc gia (ví dụ `VN`) hoặc mã gọi dạng số |
| `forceRefresh` | body hoặc query | Không | `true` / `1` để bỏ qua cache còn hạn |

**Request body ví dụ**

```json
{
  "phone": "0901234567",
  "countryCode": "VN",
  "forceRefresh": false
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Phone checked successfully",
  "data": { }
}
```

Trường `data` là object kết quả tra cứu (xem [Cấu trúc `data` cho một số](#cấu-trúc-data-cho-một-số)).

**Response `400`** — thiếu `phone`, số không hợp lệ, hoặc lỗi xử lý

```json
{
  "success": false,
  "message": "Phone is required"
}
```

---

## `GET /api/phones/:phone`

Cùng logic với `POST /api/phones/check`, nhưng số lấy từ **path** (`:phone`). Query tùy chọn: `countryCode`, `forceRefresh`.

**Ví dụ:** `GET /api/phones/0901234567?countryCode=VN`

**Response** giống `POST /api/phones/check` (`200` / `400`).

---

## `POST /api/phones/check-bulk`

Tra cứu nhiều số; có giới hạn tối đa theo `PHONE_BULK_MAX_SIZE` (mặc định 500).

**Tham số**

| Tên | Vị trí | Bắt buộc | Mô tả |
|-----|--------|----------|--------|
| `phones` | body | Có (mảng không rỗng) | Mỗi phần tử là chuỗi số **hoặc** `{ "phone", "countryCode" }` |
| `countryCode` | body hoặc query | Không | Mã quốc gia mặc định khi phần tử chỉ là chuỗi |
| `forceRefresh` | body hoặc query | Không | Bỏ qua cache còn hạn cho tất cả số cần tra |
| `concurrency` | body hoặc query | Không | Số request song song tới service ngoài (mặc định 5, env `PHONE_LOOKUP_CONCURRENCY`) |

**Request body ví dụ**

```json
{
  "phones": [
    "0901234567",
    { "phone": "0912345678", "countryCode": "VN" },
    "+84987654321"
  ],
  "countryCode": "VN",
  "forceRefresh": false,
  "concurrency": 5
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Bulk phone check completed",
  "data": {
    "totalRequested": 3,
    "totalProcessed": 3,
    "cacheHits": 1,
    "externalLookups": 2,
    "items": [ ]
  }
}
```

- `totalRequested`: độ dài mảng `phones` gửi lên.
- `totalProcessed`: số số hợp lệ, không trùng sau chuẩn hóa.
- `cacheHits`: số số dùng được từ cache còn hạn (khi không `forceRefresh`).
- `externalLookups`: số số phải gọi ngoài trong batch này.
- `items`: mảng kết quả, cùng thứ tự với danh sách số đã chuẩn hóa (xem từng phần tử bên dưới).

**Response `400`**

```json
{
  "success": false,
  "message": "phones must be a non-empty array"
}
```

Hoặc: không có số hợp lệ, vượt `PHONE_BULK_MAX_SIZE`, lỗi xử lý (message tương ứng).

---

## Cấu trúc `data` cho một số

Mỗi lần tra cứu **một** số, hoặc mỗi phần tử trong `data.items` (bulk), có dạng:

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `phone` | string | Số lưu kèm metadata gốc |
| `normalizedPhone` | string | E.164 bỏ ký tự `+` (key cache) |
| `e164Phone` | string | Dạng E.164 (có `+`) |
| `country` | string \| null | Mã quốc gia 2 chữ cái |
| `countryCallingCode` | string \| null | Mã gọi quốc tế |
| `nationalNumber` | string \| null | Phần số trong nước |
| `isSpam` | boolean | Có bị đánh dấu spam hay không |
| `spamScore` | number | Điểm spam (0 nếu không parse được) |
| `status` | string | Trạng thái từ service ngoài / nội bộ |
| `source` | string | Nguồn dữ liệu (ví dụ `external-service`) |
| `cached` | boolean | `true` nếu lấy từ cache còn hạn |
| `checkedAt` | string (ISO) / Date | Thời điểm ghi nhận |
| `expiresAt` | string (ISO) / Date / null | Hết hạn cache |
| `rawResponse` | object \| null | JSON thô từ service ngoài + `phoneMeta` |

---

## Lỗi chung (không khớp route)

`404` toàn app:

```json
{
  "success": false,
  "message": "Route not found"
}
```

Lỗi server không bắt: `500` với `message: "Internal server error"`.

---

## Luồng xử lý (tóm tắt)

```text
Client
  -> Chuẩn hóa số (libphonenumber-js, mặc định gợi ý VN nếu cần)
  -> Đọc cache MongoDB (collection `phone_lookups`) theo `normalizedPhone`
  -> Còn hạn và không force: trả từ cache
  -> Ngược lại: HTTP tới `PHONE_LOOKUP_URL` -> cập nhật cache
```

---

## Cấu trúc thư mục chính

```text
index.js
src/
  config/config.js
  controllers/phoneController.js
  models/phoneModel.js
  routes/index.js, phoneRoutes.js
  services/phoneLookupService.js, externalPhoneSpamService.js
  utils/phoneNormalizer.js
```

---

## Biến môi trường

Sao chép `.env.example` thành `.env` và chỉnh:

- **MySQL:** `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_CONNECT_TIMEOUT_MS`, `MYSQL_LOGGING`
- **Service ngoài:** `PHONE_LOOKUP_URL` (hoặc `PHONE_SPAM_CHECK_URL`), `PHONE_LOOKUP_METHOD`, `PHONE_LOOKUP_API_KEY`, `PHONE_LOOKUP_USE_BEARER`, `PHONE_LOOKUP_TIMEOUT_MS`
- **Hành vi tra cứu:** `PHONE_DEFAULT_COUNTRY`, `PHONE_CACHE_TTL_MINUTES`, `PHONE_BULK_MAX_SIZE`, `PHONE_LOOKUP_CONCURRENCY`

---

## Chạy dự án

```bash
npm install
npm run dev
```

Ví dụ gọi nhanh:

```bash
curl -X POST https://callid.onewise.app/api/phones/check \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"0901234567\",\"countryCode\":\"VN\"}"
curl "https://callid.onewise.app/api/phones/0901234567?countryCode=VN"
curl -X POST https://callid.onewise.app/api/phones/check-bulk \
  -H "Content-Type: application/json" \
  -d "{\"phones\":[\"0901234567\",\"0912345678\"],\"concurrency\":5}"
```

---

## Tối ưu

- Cache-first (TTL `PHONE_CACHE_TTL_MINUTES`) giảm gọi ra ngoài.
- Bulk xử lý song song có giới hạn `concurrency` (tối đa 20 worker nội bộ).
- Index trên `normalizedPhone` / `expiresAt` trong model phục vụ truy vấn nhanh.
