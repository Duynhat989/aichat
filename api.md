# TrueCallId - API Documentation

**Base URL:** `https://callid.onewise.app/api`  
Service page: [https://callid.onewise.app/](https://callid.onewise.app/)

---

## 1) Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/phones/check` | Check one phone number |
| `GET` | `/api/phones/:phone` | Check one phone number from URL param |
| `POST` | `/api/phones/check-bulk` | Check multiple phone numbers |
| `POST` | `/api/phones/report` | Report a phone number with spam type |

---

## 2) `POST /api/phones/check`

Check one phone number (from body or query).

### Request params

| Field | Required | Description |
|---|---|---|
| `phone` | Yes | Phone number to check |
| `countryCode` | No | Country hint, ex: `VN` or numeric calling code |
| `forceRefresh` | No | `true` / `1` to bypass valid cache |

### Example request

```bash
curl -sS -X POST "https://callid.onewise.app/api/phones/check" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"0901234567\",\"countryCode\":\"VN\",\"forceRefresh\":false}"
```

### Success response (200)

```json
{
  "success": true,
  "message": "Phone checked successfully",
  "data": {
    "phone": "84901234567",
    "normalizedPhone": "84901234567",
    "e164Phone": "+84901234567",
    "country": "VN",
    "countryCode": "VN",
    "countryCallingCode": "84",
    "nationalNumber": "901234567",
    "name": "Company A",
    "spamType": "tele-marketing",
    "isSpam": true,
    "spamScore": 100,
    "status": "reported",
    "source": "user-report",
    "cached": false,
    "checkedAt": "2026-05-06T07:40:00.000Z",
    "expiresAt": "2026-05-07T07:40:00.000Z",
    "rawResponse": {}
  }
}
```

### Error response (400)

```json
{
  "success": false,
  "message": "Phone is required"
}
```

---

## 3) `GET /api/phones/:phone`

Same logic as `POST /api/phones/check`, but phone comes from path param.

### Query params

| Field | Required | Description |
|---|---|---|
| `countryCode` | No | Same as check API |
| `forceRefresh` | No | Same as check API |

### Example request

```bash
curl -sS "https://callid.onewise.app/api/phones/0901234567?countryCode=VN&forceRefresh=false"
```

### Response

Same response structure as section 2.

---

## 4) `POST /api/phones/check-bulk`

Check multiple phone numbers in one request.

### Request params

| Field | Required | Description |
|---|---|---|
| `phones` | Yes | Non-empty array: string phone or object `{ phone, countryCode }` |
| `countryCode` | No | Default country hint for string items |
| `forceRefresh` | No | Bypass valid cache for all items |
| `concurrency` | No | External lookup parallelism (default 5) |

### Example request

```bash
curl -sS -X POST "https://callid.onewise.app/api/phones/check-bulk" \
  -H "Content-Type: application/json" \
  -d "{\"phones\":[\"0901234567\",{\"phone\":\"0912345678\",\"countryCode\":\"VN\"}],\"countryCode\":\"VN\",\"forceRefresh\":false,\"concurrency\":5}"
```

### Success response (200)

```json
{
  "success": true,
  "message": "Bulk phone check completed",
  "data": {
    "totalRequested": 2,
    "totalProcessed": 2,
    "cacheHits": 1,
    "externalLookups": 1,
    "items": []
  }
}
```

### Error response (400)

- `phones must be a non-empty array`
- `No valid phone numbers provided`
- `Maximum 500 phone numbers per request` (depends on env)

---

## 5) `POST /api/phones/report`

Report a phone number and classify it.

### Supported spam types

- `spam`
- `tele-marketing`
- `scam`
- any other value -> auto convert to `other`

### Request params

| Field | Required | Description |
|---|---|---|
| `phone` | Yes | Phone number to report |
| `countryCode` | No | Country hint, ex: `VN` |
| `spamType` | No | `spam` / `tele-marketing` / `scam`; otherwise `other` |
| `name` | No | Optional display name |

### Example request

```bash
curl -sS -X POST "https://callid.onewise.app/api/phones/report" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"0901234567\",\"countryCode\":\"VN\",\"spamType\":\"scam\",\"name\":\"Fake Bank\"}"
```

### Success response (200)

```json
{
  "success": true,
  "message": "Phone report submitted successfully",
  "data": {
    "phone": "84901234567",
    "normalizedPhone": "84901234567",
    "e164Phone": "+84901234567",
    "country": "VN",
    "countryCode": "VN",
    "countryCallingCode": "84",
    "nationalNumber": "901234567",
    "name": "Fake Bank",
    "spamType": "scam",
    "isSpam": true,
    "spamScore": 100,
    "status": "reported",
    "source": "user-report",
    "cached": false,
    "checkedAt": "2026-05-06T07:40:00.000Z",
    "expiresAt": "2026-05-07T07:40:00.000Z",
    "rawResponse": {}
  }
}
```

### Error response (400)

```json
{
  "success": false,
  "message": "Invalid phone number"
}
```

---

## 6) Phone result schema

This schema is used in:
- `data` of single check
- each item in `data.items` of bulk
- `data` of report API

| Field | Type | Description |
|---|---|---|
| `phone` | string | Stored phone value |
| `normalizedPhone` | string | E.164 without `+` (cache key) |
| `e164Phone` | string | E.164 format with `+` |
| `country` | string \| null | ISO alpha-2 country |
| `countryCode` | string \| null | ISO alpha-2 country (same value as `country`) |
| `countryCallingCode` | string \| null | International calling code |
| `nationalNumber` | string \| null | National number part |
| `name` | string \| null | Optional display name |
| `spamType` | string | `spam` / `tele-marketing` / `scam` / `other` |
| `isSpam` | boolean | Spam flag |
| `spamScore` | number | Spam/risk score |
| `status` | string | Processing status |
| `source` | string | Data source |
| `cached` | boolean | `true` if returned from valid cache |
| `checkedAt` | string (ISO) | Record updated time |
| `expiresAt` | string (ISO) \| null | Cache expiry |
| `rawResponse` | object \| null | Raw external/internal payload |

---

## 7) Common status codes

| HTTP code | Meaning |
|---|---|
| `200` | Success |
| `400` | Validation/business error |
| `404` | Route not found |
| `500` | Internal server error |

404 response:

```json
{
  "success": false,
  "message": "Route not found"
}
```

---

## 8) Quick test commands

```bash
# check
curl -sS -X POST "https://callid.onewise.app/api/phones/check" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"0901234567\",\"countryCode\":\"VN\"}"

# get by param
curl -sS "https://callid.onewise.app/api/phones/0901234567?countryCode=VN"

# bulk
curl -sS -X POST "https://callid.onewise.app/api/phones/check-bulk" \
  -H "Content-Type: application/json" \
  -d "{\"phones\":[\"0901234567\",\"0912345678\"],\"concurrency\":5}"

# report
curl -sS -X POST "https://callid.onewise.app/api/phones/report" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"0901234567\",\"countryCode\":\"VN\",\"spamType\":\"tele-marketing\",\"name\":\"Sales Team\"}"
```
