/**
 * 腾讯云 OCR 文字识别 独立测试服务
 * 端口：3000
 *
 * 接口：
 *   POST /upload  上传图片，返回 filePath
 *   POST /ocr     传入 filePath，返回识别文字
 */

const express      = require('express');
const multer       = require('multer');
const fs           = require('fs');
const path         = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const tencentcloud = require('tencentcloud-sdk-nodejs');

// ─── 腾讯云 OCR 客户端 ────────────────────────────────────────────────────────
const OcrClient = tencentcloud.ocr.v20181119.Client;
const TENCENT_SECRET_ID  = (process.env.TENCENT_SECRET_ID || '').trim();
const TENCENT_SECRET_KEY = (process.env.TENCENT_SECRET_KEY || '').trim();
const TENCENT_OCR_REGION = process.env.TENCENT_OCR_REGION || 'ap-beijing';
let client = null;

if (TENCENT_SECRET_ID && TENCENT_SECRET_KEY) {
  client = new OcrClient({
    credential: {
      secretId: TENCENT_SECRET_ID,
      secretKey: TENCENT_SECRET_KEY
    },
    region: TENCENT_OCR_REGION,
    profile: {
      httpProfile: {
        endpoint: 'ocr.tencentcloudapi.com'
      }
    }
  });
}

// ─── OCR 核心函数 ─────────────────────────────────────────────────────────────
/**
 * 调用腾讯云通用印刷体 OCR
 * @param {string} imagePath 图片本地绝对路径
 * @returns {Promise<{text: string}>}
 */
async function tencentOCR(imagePath) {
  if (!client) {
    throw new Error('OCR 客户端未初始化，请先在 .env 中配置 TENCENT_SECRET_ID/TENCENT_SECRET_KEY');
  }
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');

  const result = await client.GeneralAccurateOCR({
    ImageBase64: imageBase64
  });

  const text = result.TextDetections
    .map(item => item.DetectedText)
    .join('\n');

  return { text };
}

// ─── Express 初始化 ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── 文件上传配置（multer）────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, suffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 jpg / png / pdf 格式'));
    }
  }
});

// ─── 路由 ─────────────────────────────────────────────────────────────────────

/**
 * POST /upload
 * 上传图片，返回 filePath
 */
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未收到文件' });
    }
    const filePath = req.file.path;
    console.log('[upload] 上传成功:', filePath);
    res.json({ success: true, filePath });
  } catch (err) {
    console.error('[upload] 错误:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /ocr
 * 传入 filePath，调用腾讯云 OCR，返回识别结果
 * Body: { "filePath": "uploads/xxx.jpg" }
 */
app.post('/ocr', async (req, res) => {
  try {
    if (!client) {
      return res.status(503).json({
        success: false,
        message: 'OCR 客户端未初始化，请先在 .env 中配置 TENCENT_SECRET_ID/TENCENT_SECRET_KEY'
      });
    }

    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'filePath 不能为空' });
    }

    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, filePath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: '文件不存在: ' + absPath });
    }

    console.log('[ocr] 开始识别:', absPath);
    const { text } = await tencentOCR(absPath);
    console.log('[ocr] 识别完成，文字长度:', text.length, '字');

    res.json({ success: true, text });

  } catch (err) {
    console.error('[ocr] 错误:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── 启动 ─────────────────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 OCR 测试服务启动成功`);
  console.log(`   端口     : ${PORT}`);
  console.log(`   上传接口  : POST http://localhost:${PORT}/upload`);
  console.log(`   OCR 接口  : POST http://localhost:${PORT}/ocr`);
  console.log(`   上传目录  : ${uploadDir}\n`);
});
