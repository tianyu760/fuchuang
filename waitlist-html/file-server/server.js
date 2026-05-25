/**
 * 法绎文件上传与解析服务
 * Node.js + Express + Multer
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseFile } = require('./fileParser');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件 - 开发环境允许所有来源（包括 file:// 协议直接打开的HTML）
app.use(cors({
  origin: function(origin, callback) {
    // 允许所有来源：localhost、127.0.0.1、file://（origin 为 null）
    callback(null, true);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 静态文件服务（访问上传的文件）
app.use('/uploads', express.static(UPLOAD_DIR));

// 存储文件解析状态（生产环境应使用 Redis）
const fileStatusMap = new Map();

// Multer 配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  
  const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${file.mimetype || ext}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB 限制
    files: 5 // 最多同时上传 5 个文件
  }
});

// ==================== API 路由 ====================

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 文件上传接口
 * POST /api/upload
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: '请选择要上传的文件'
      });
    }

    const fileId = uuidv4();
    const fileInfo = {
      fileId: fileId,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      savedName: req.file.filename,
      savedPath: req.file.path,
      url: `/uploads/${req.file.filename}`,
      status: 'parsing',
      content: null,
      error: null,
      uploadedAt: new Date().toISOString()
    };

    // 保存文件状态
    fileStatusMap.set(fileId, fileInfo);

    console.log(`文件上传成功: ${req.file.originalname}, fileId: ${fileId}`);

    // 异步解析文件
    setImmediate(async () => {
      try {
        const parseResult = await parseFile(req.file.path, req.file.originalname);
        
        if (parseResult.success) {
          fileInfo.status = 'completed';
          fileInfo.content = parseResult.content;
          console.log(`文件解析完成: ${fileId}`);
        } else {
          fileInfo.status = 'error';
          fileInfo.error = parseResult.error;
          console.error(`文件解析失败: ${fileId}, ${parseResult.error}`);
        }
        
        fileStatusMap.set(fileId, fileInfo);
      } catch (error) {
        console.error(`解析过程异常: ${fileId}`, error);
        fileInfo.status = 'error';
        fileInfo.error = error.message;
        fileStatusMap.set(fileId, fileInfo);
      }
    });

    // 立即返回响应（解析在后台进行）
    res.json({
      ok: true,
      data: {
        fileId: fileId,
        fileName: fileInfo.fileName,
        fileType: fileInfo.fileType,
        fileSize: fileInfo.fileSize,
        status: 'parsing',
        url: fileInfo.url,
        uploadedAt: fileInfo.uploadedAt
      }
    });

  } catch (error) {
    console.error('上传处理失败:', error);
    res.status(500).json({
      ok: false,
      message: '文件上传失败: ' + error.message
    });
  }
});

/**
 * 多文件上传接口
 * POST /api/upload/multiple
 */
app.post('/api/upload/multiple', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        ok: false,
        message: '请选择要上传的文件'
      });
    }

    const results = [];
    
    for (const file of req.files) {
      const fileId = uuidv4();
      const fileInfo = {
        fileId: fileId,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        savedName: file.filename,
        savedPath: file.path,
        url: `/uploads/${file.filename}`,
        status: 'parsing',
        content: null,
        error: null,
        uploadedAt: new Date().toISOString()
      };

      fileStatusMap.set(fileId, fileInfo);
      results.push({
        fileId: fileId,
        fileName: file.originalname,
        status: 'parsing',
        url: fileInfo.url
      });

      // 异步解析
      setImmediate(async () => {
        try {
          const parseResult = await parseFile(file.path, file.originalname);
          if (parseResult.success) {
            fileInfo.status = 'completed';
            fileInfo.content = parseResult.content;
          } else {
            fileInfo.status = 'error';
            fileInfo.error = parseResult.error;
          }
          fileStatusMap.set(fileId, fileInfo);
        } catch (error) {
          fileInfo.status = 'error';
          fileInfo.error = error.message;
          fileStatusMap.set(fileId, fileInfo);
        }
      });
    }

    res.json({
      ok: true,
      data: results
    });

  } catch (error) {
    console.error('批量上传失败:', error);
    res.status(500).json({
      ok: false,
      message: '批量上传失败: ' + error.message
    });
  }
});

/**
 * 查询文件解析状态
 * GET /api/upload/:fileId/status
 */
app.get('/api/upload/:fileId/status', (req, res) => {
  const { fileId } = req.params;
  const fileInfo = fileStatusMap.get(fileId);
  
  if (!fileInfo) {
    return res.status(404).json({
      ok: false,
      message: '文件不存在'
    });
  }

  res.json({
    ok: true,
    data: {
      fileId: fileInfo.fileId,
      fileName: fileInfo.fileName,
      status: fileInfo.status,
      content: fileInfo.status === 'completed' ? fileInfo.content : null,
      error: fileInfo.error,
      uploadedAt: fileInfo.uploadedAt
    }
  });
});

/**
 * 获取文件内容
 * GET /api/upload/:fileId/content
 */
app.get('/api/upload/:fileId/content', (req, res) => {
  const { fileId } = req.params;
  const fileInfo = fileStatusMap.get(fileId);
  
  if (!fileInfo) {
    return res.status(404).json({
      ok: false,
      message: '文件不存在'
    });
  }

  if (fileInfo.status !== 'completed') {
    return res.status(400).json({
      ok: false,
      message: '文件尚未解析完成'
    });
  }

  res.json({
    ok: true,
    data: {
      fileId: fileInfo.fileId,
      fileName: fileInfo.fileName,
      content: fileInfo.content
    }
  });
});

/**
 * 删除文件
 * DELETE /api/upload/:fileId
 */
app.delete('/api/upload/:fileId', (req, res) => {
  const { fileId } = req.params;
  const fileInfo = fileStatusMap.get(fileId);
  
  if (!fileInfo) {
    return res.status(404).json({
      ok: false,
      message: '文件不存在'
    });
  }

  // 删除物理文件
  try {
    if (fs.existsSync(fileInfo.savedPath)) {
      fs.unlinkSync(fileInfo.savedPath);
    }
  } catch (error) {
    console.warn(`删除物理文件失败: ${fileInfo.savedPath}`, error);
  }

  // 删除状态记录
  fileStatusMap.delete(fileId);

  res.json({
    ok: true,
    message: '文件已删除'
  });
});

/**
 * 获取所有已上传文件列表（调试用）
 * GET /api/upload
 */
app.get('/api/upload', (req, res) => {
  const files = Array.from(fileStatusMap.values()).map(f => ({
    fileId: f.fileId,
    fileName: f.fileName,
    status: f.status,
    uploadedAt: f.uploadedAt
  }));
  
  res.json({
    ok: true,
    data: files
  });
});

// ==================== 错误处理 ====================

// Multer 错误处理
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        ok: false,
        message: '文件大小不能超过 20MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        ok: false,
        message: '一次最多只能上传 5 个文件'
      });
    }
    return res.status(400).json({
      ok: false,
      message: '文件上传错误: ' + error.message
    });
  }
  
  if (error) {
    console.error('服务器错误:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || '服务器内部错误'
    });
  }
  
  next();
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: '接口不存在'
  });
});

// ==================== 启动服务 ====================

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('法绎文件上传服务已启动');
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`上传目录: ${UPLOAD_DIR}`);
  console.log('='.repeat(50));
});

module.exports = app;
