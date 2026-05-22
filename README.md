Dưới đây là file README dạng `.md` (Markdown) ngắn gọn đúng yêu cầu của bạn:

---

## 📄 File: `README.md`

```md
# OneWise AI API

Base URL:
https://console.onewise.app/api/ai

---

## 1. Get Models

Lấy danh sách model AI.

**GET**
```

/models

````

**Response**
```json
{
  "success": true,
  "data": [
    { "id": "onewise_v1", "name": "OneWise V1" },
    { "id": "onewise_v2", "name": "OneWise V2" }
  ]
}
````

---

## 2. Upload File

Upload file để dùng trong chat (image/document).

**POST**

```
/add-file
```

**Response**

```json
{
  "success": true,
  "data": {
    "fileId": "file-xxxx"
  }
}
```

---

## 3. Chat Completion (STREAM)

Chat AI có hỗ trợ streaming realtime.

**POST**

```
/chat-completion
```

### Body

```json
{
  "taskId": "optional (để giữ lịch sử chat)",
  "prompt": "Nội dung chat",
  "instructions": "Hướng dẫn cho AI",
  "model": "onewise_v1",
  "files": [
    { "fileId": "file-xxxx" }
  ]
}
```

### Lưu ý taskId

* Không truyền `taskId` → tạo cuộc chat mới
* Có `taskId` → giữ lịch sử chat

### Response (stream)

```
data: Xin
data: chào
data: ...
data: [DONE]
```

---

## 4. Spell Check

**POST**

```
/spell-check
```

---

## 5. Summarize

**POST**

```
/summarize
```

---

## 6. Translate

**POST**

```
/translate
```

---

## 7. Study Guide

**POST**

```
/study-guide
```

---

## 🔥 Summary

* `/models` → lấy model
* `/add-file` → upload file
* `/chat-completion` → chat AI (stream + taskId)
* `/spell-check` → sửa lỗi
* `/summarize` → tóm tắt
* `/translate` → dịch
* `/study-guide` → học tập hỗ trợ AI

---

## Base URL

```
https://console.onewise.app/api/ai
```

```

---

Nếu bạn muốn, mình có thể:
- :contentReference[oaicite:1]{index=1}
- hoặc :contentReference[oaicite:2]{index=2}
- hoặc :contentReference[oaicite:3]{index=3} 👍
::contentReference[oaicite:0]{index=0}
```
