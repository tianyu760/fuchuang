# 法绎文件上传服务

Node.js + Express + Multer 实现的文件上传与解析服务

## 功能特性

- ✅ 单文件/多文件上传
- ✅ 文件类型限制（PDF, Word, Excel, PPT, 图片, 文本）
- ✅ 文件大小限制（20MB）
- ✅ 自动文件解析（PDF, Word, Excel, 图片 OCR）
- ✅ 上传进度查询
- ✅ CORS 跨域支持

## 快速开始

### 1. 安装依赖

```bash
cd file-server
npm install
```

### 2. 启动服务

```bash
# 开发模式（带热重载）
npm run dev

# 生产模式
npm start
```

服务将在 http://localhost:3001 启动

## API 接口

### 上传文件
```http
POST /api/upload
Content-Type: multipart/form-data

file: <文件>
```

**响应：**
```json
{
  "ok": true,
  "data": {
    "fileId": "uuid",
    "fileName": "合同.pdf",
    "fileType": "application/pdf",
    "fileSize": 12345,
    "status": "parsing",
    "url": "/uploads/xxx.pdf",
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 查询解析状态
```http
GET /api/upload/{fileId}/status
```

**响应：**
```json
{
  "ok": true,
  "data": {
    "fileId": "uuid",
    "fileName": "合同.pdf",
    "status": "completed",
    "content": "解析后的文本内容...",
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 获取文件内容
```http
GET /api/upload/{fileId}/content
```

### 删除文件
```http
DELETE /api/upload/{fileId}
```

## 支持的文件格式

| 格式 | 扩展名 | 解析方式 |
|------|--------|----------|
| PDF | .pdf | pdf-parse |
| Word | .doc, .docx | mammoth |
| Excel | .xls, .xlsx, .csv | xlsx |
| PPT | .ppt, .pptx | 基本信息 |
| 图片 | .jpg, .jpeg, .png | Tesseract OCR |
| 文本 | .txt | 直接读取 |

## 常见问题

### 1. OCR 需要下载语言包

首次使用图片 OCR 时，会自动下载中文语言包（约 10MB），请确保网络连接正常。

### 2. 文件上传失败

- 检查文件大小是否超过 20MB
- 检查文件类型是否在支持列表中
- 查看后端日志获取详细错误信息

### 3. CORS 跨域问题

默认允许以下源：
- http://localhost:3000
- http://127.0.0.1:3000
- http://localhost:8080

如需添加其他源，请修改 server.js 中的 cors 配置。
