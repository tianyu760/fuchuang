/**
 * 多模态 AI 代理服务（Node.js）
 * 端口：3002
 * 职责：
 *   - 接收前端文件上传（图片/文档），提取内容
 *   - 接收对话请求，代理转发给 OpenAI GPT-4o（流式）
 *   - 前端 API Key 不暴露在浏览器中
 */

const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const {
  applyNodeUtf8Locale,
  installExpressUtf8Json,
  fixFileName,
  safeStorageFileName,
  ensureUtf8String
} = require('./lib/encoding-utils');

applyNodeUtf8Locale();
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto   = require('crypto');          // 用于生成 token 和密码 hash
const axios    = require('axios');           // 腾讯元器流式请求
const {
  apiSuccess,
  apiError
} = require('./lib/ai-utils');
const { searchLegalByQwen } = require('./lib/qwen-legal-search');
const { formatLegalSearchResult } = require('./lib/legal-search-formatter');
const { generateLegalDocumentByQwen } = require('./lib/qwen-legal-document');
const {
  detectIntent,
  isKeywordConflict,
  sanitizeHistoryByIntent
} = require('./lib/intent-router');
const {
  callTencentAgent,
  buildPassthroughUserContent,
  chatPassthrough,
  formatAttachment,
  PLACEHOLDER,
  YUANQI_API_KEY,
  YUANQI_ASSISTANT_ID
} = require('./lib/yuanqi-ai');
const adminRouter = require('./modules/admin');
const adminAnalytics = adminRouter.store;
const SYSTEM_CONFIG = require('./lib/system-config');
let lawEducationRouter;
try { lawEducationRouter = require('./modules/law-education'); } catch (e) { lawEducationRouter = null; }
// ─── 腾讯元器智能体配置（见 server/lib/yuanqi-ai.js）────────────────────────
console.log('当前 assistant_id:', YUANQI_ASSISTANT_ID);
const TENCENT_SECRET_ID   = (process.env.TENCENT_SECRET_ID  || '').trim();
const TENCENT_SECRET_KEY  = (process.env.TENCENT_SECRET_KEY || '').trim();
const TENCENT_OCR_REGION  = process.env.TENCENT_OCR_REGION || 'ap-beijing'; // OCR 地域
// 是否启用腾讯云 OCR（填入凭据后自动开启）
const TENCENT_CLOUD_ENABLED = !!(TENCENT_SECRET_ID && TENCENT_SECRET_KEY);
console.log(TENCENT_CLOUD_ENABLED
  ? '  ✅ 腾讯云 OCR 已就绪'
  : '  ⚠️  腾讯云 OCR 未配置，降级为本地解析');

// 腾讯云 OCR SDK 客户端（仅在凭据已配置时初始化）
let tencentOcrClient = null;
if (TENCENT_CLOUD_ENABLED) {
  try {
    const tencentcloud = require('tencentcloud-sdk-nodejs');
    const OcrClient = tencentcloud.ocr.v20181119.Client;
    tencentOcrClient = new OcrClient({
      credential: { secretId: TENCENT_SECRET_ID, secretKey: TENCENT_SECRET_KEY },
      region: TENCENT_OCR_REGION,
      profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } }
    });
    console.log('  ✅ 腾讯云 OCR 客户端初始化完成');
  } catch (e) {
    console.warn('  ⚠️  腾讯云 SDK 加载失败:', e.message);
  }
}

// ─── 可选文档解析库（缺失时降级为空字符串）─────────────────────────────────
let pdfParse, mammoth;
try { pdfParse = require('pdf-parse'); } catch (e) { console.warn('[warn] pdf-parse 未安装，PDF 解析不可用'); }
try { mammoth  = require('mammoth');   } catch (e) { console.warn('[warn] mammoth 未安装，DOCX 解析不可用'); }

// ─── 常量 ─────────────────────────────────────────────────────────────────
const PORT = 3002;

function buildOcrRecord(file, extra) {
  const base = {
    fileName: fixFileName(file && file.originalname),
    fileUrl: file && file.filename ? '/uploads/' + file.filename : '',
    storedFile: file && file.filename ? file.filename : ''
  };
  return Object.assign(base, extra || {});
}

/**
 * 解析文件内容为纯文本
 *
 * 优先级：
 *   1）腾讯云已配置 → 图片类用 OCR，PDF/Word 用文档剖析
 *   2）降级：本地 pdf-parse / mammoth / 直读 txt
 *
 * @param {string} filePath 文件绝对路径
 * @returns {Promise<string>} 提取的纯文本
 */
async function parseFileContent(filePath) {
  const ext    = path.extname(filePath).toLowerCase();
  const isImg  = ['.png','.jpg','.jpeg','.bmp','.gif','.webp'].includes(ext);
  const isDoc  = ['.pdf','.docx','.doc'].includes(ext);

  // ── 腾讯云通道（SecretId/SecretKey 已填入时自动启用） ──────────────────
  if (TENCENT_CLOUD_ENABLED) {
    try {
      if (isImg) {
        return await parseWithTencentOCR(filePath);
      }
      if (isDoc) {
        // 文档剖析服务待购买，暂用本地解析降级处理
      }
    } catch (e) {
      console.warn(`[parse] 腾讯云解析失败，降级本地: ${e.message}`);
      // 腾讯云失败后继续尝试本地解析
    }
  }

  // ── 本地解析（降级或腾讯云未配置） ──────────────────────────
  try {
    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }
    if (isDoc && pdfParse && ext === '.pdf') {
      const buf  = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return (data.text || '').trim();
    }
    if ((ext === '.docx' || ext === '.doc') && mammoth) {
      const result = await mammoth.extractRawText({ path: filePath });
      return (result.value || '').trim();
    }
  } catch (e) {
    console.warn(`[parse] 本地解析失败 ${path.basename(filePath)}:`, e.message);
  }
  return '';
}

/**
 * 腾讯云通用文字识别 OCR（图片 / 扫描件）
 *
 * 适用场景：.png .jpg .jpeg .bmp .gif 以及扫描版图片
 * 调用 API：通用文字识别（GeneralAccurateOCR）
 *
 * @param {string} filePath 文件绝对路径
 * @returns {Promise<string>} OCR 识别结果文本
 */
async function parseWithTencentOCR(filePath) {
  if (!tencentOcrClient) {
    throw new Error('腾讯云 OCR 客户端未初始化，请先配置 SecretId/SecretKey');
  }
  const buf    = fs.readFileSync(filePath);
  const base64 = buf.toString('base64');

  console.log(`[ocr] 调用腾讯云 OCR 识别: ${path.basename(filePath)}`);

  // GeneralAccurateOCR —— 通用精确识别（支持印刺、手写、混排文本）
  const result = await tencentOcrClient.GeneralBasicOCR({ ImageBase64: base64 });
  const lines  = ensureUtf8String(
    (result.TextDetections || []).map(t => t.DetectedText).join('\n')
  );

  console.log(`[ocr] 识别完成，共 ${result.TextDetections?.length || 0} 行文字`);
  return lines;
}

/**
 * 解析用户指令：识别文件操作意图并提取文件名
 *
 * 支持模式：
 *   - "分析名称为xxx的文件"
 *   - "查看xxx文件"
 *   - "总结xxx文档"
 *   - "分析 xxx.pdf"
 *
 * @param  {string} text 用户输入消息
 * @returns {{ type: 'file_analysis', fileName: string } | null}
 */
function parseUserInstruction(text) {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  const ACTIONS = '[分解析查看览总结归纳解读阅读读取处理帮我看]+';

  // 模式1： "分析名称为xxx" / "查看名为xxx" / "解读叫做xxx"
  const m1 = t.match(
    new RegExp(`(?:${ACTIONS})\\s*(?:名称?为|叫做?|名叫)\\s*[\u300c\u300e\u201c\u2018]?(.+?)[\u300d\u300f\u201d\u2019]?\\s*(?:的)?\\s*(?:文件|文档|内容)?\\s*$`)
  );
  if (m1) return { type: 'file_analysis', fileName: m1[1].trim() };

  // 模式2： "分析 xxx.pdf" — 操作词 + 空格 + 含扩展名的文件名
  const m2 = t.match(
    new RegExp(`(?:${ACTIONS})\\s+([^\\s\uff0c\u3002\uff01\uff1f,!?]+\\.(?:pdf|docx?|txt))`, 'i')
  );
  if (m2) return { type: 'file_analysis', fileName: m2[1].trim() };

  // 模式3： "分析xxx文件" / "查看xxx文档"— 操作词 + 候选名 + 文件|文档
  const m3 = t.match(
    new RegExp(`(?:${ACTIONS})[\u300c\u300e\u201c\u2018]?(.+?)[\u300d\u300f\u201d\u2019]?\\s*(?:的)?\\s*(?:文件|文档|内容)`)
  );
  if (m3) {
    const candidate = m3[1].trim();
    // 候选文件名：长度 1~40，且不是纯数字
    if (candidate.length >= 1 && candidate.length <= 40 && !/^\d+$/.test(candidate)) {
      return { type: 'file_analysis', fileName: candidate };
    }
  }

  return null;
}

/**
 * 文件查找：优先当前会话文件，其次个人资料库
 *
 * @param {string} fileName   要查找的文件名（模糊匹配）
 * @param {Array}  chatFiles  当前会话已上传文件 [{name, content}]
 * @param {Array}  kbItems    全部资料库条目（未过滤）
 * @param {string} userId     当前用户 ID（防止串数据）
 * @returns {{
 *   source:  'chat' | 'kb',   来源
 *   name:    string,           文件名
 *   path:    string | null,    完整文件系统路径（chat 源为 null）
 *   content: string,           文件纯文本内容
 *   item:    Object            原始条目对象
 * } | null}
 */
function findUserFile(fileName, chatFiles, kbItems, userId) {
  if (!fileName) return null;

  // 归一化关键词：小写 + 去扩展名
  const kw = fileName.toLowerCase().trim().replace(/\.[^.]+$/, '');
  if (!kw) return null;

  // ── 1. 当前会话已上传的文件（chat_files）──────────────
  if (Array.isArray(chatFiles) && chatFiles.length > 0) {
    const hit = chatFiles.find(f => {
      const n = (f.name || '').toLowerCase().replace(/\.[^.]+$/, '');
      return n.includes(kw) || kw.includes(n);
    });
    if (hit) {
      return {
        source:  'chat',
        name:    hit.name,
        path:    null,          // 内容已在内存中，无需文件路径
        content: hit.content || '',
        item:    hit
      };
    }
  }

  // ── 2. 个人资料库（必须限定 userId，防止串数据）───────
  const userKbItems = (kbItems || []).filter(i => i.userId === userId);
  const kbHit = userKbItems.find(item => {
    const fn = (item.fileName || '').toLowerCase().replace(/\.[^.]+$/, '');
    const tt = (item.title    || '').toLowerCase();
    return fn.includes(kw) || kw.includes(fn) ||
           tt.includes(kw) || kw.includes(tt);
  });

  if (kbHit) {
    const filePath = kbHit.fileUrl
      ? path.join(uploadDir, path.basename(kbHit.fileUrl))
      : null;
    return {
      source:  'kb',
      name:    kbHit.fileName || kbHit.title,
      path:    filePath,
      content: kbHit.parsedContent || kbHit.content || '',
      item:    kbHit
    };
  }

  // 两级均未命中
  return null;
}

/**
 * 从用户资料库中智能选取与问题相关的条目
 *
 * 策略：关键词匹配评分（TF）→ 无匹配时降级为最近上传的 topN 条
 *
 * @param {Array}  items    用户全部资料条目
 * @param {string} question 用户当前问题
 * @param {number} topN     最多返回条目数（默认 5）
 * @returns {{ items: Array, strategy: string }}
 */
function selectKbItems(items, question, topN = 5) {
  if (!items.length) return { items: [], strategy: 'empty' };

  // 提取关键词：长度 >= 2 的中文词、英文单词、数字串
  const words = question
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  if (words.length > 0) {
    const scored = items
      .map(item => {
        const haystack = [
          item.title || '',
          item.content || '',
          item.parsedContent || '',
          item.fileName || ''
        ].join(' ');

        let score = 0;
        words.forEach(w => {
          // 中文匹配区分大小写；英文不区分
          const flags = /[\u4e00-\u9fa5]/.test(w) ? 'g' : 'gi';
          const hits  = haystack.match(new RegExp(w, flags));
          if (hits) score += hits.length;
        });
        return { item, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(x => x.item);

    if (scored.length > 0) {
      return { items: scored, strategy: 'keyword' };
    }
  }

  // 关键修复：禁止“最近上传”自动注入，避免跨问题污染
  return { items: [], strategy: 'none' };
}

// callTencentAgent 已迁移至 server/lib/yuanqi-ai.js（纯透传）

// ─── Express 初始化 ───────────────────────────────────────────────────────
const app = express();

// JSON 请求体大小限制 50MB（支持 base64 图片传输）
app.use(express.json({ limit: '50mb' }));
installExpressUtf8Json(app);

// CORS：允许本地前端调用
app.use(cors({
  origin: [
    'http://localhost:8080', 'http://127.0.0.1:8080',
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'null'  // file:// 协议打开时
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'charset']
}));
app.options('*', cors());  // 响应所有 OPTIONS 预检请求

/** GET /api/system/config — 全局系统配置（客服电话、版权年份） */
app.get('/api/system/config', (req, res) => {
  res.json({ success: true, data: SYSTEM_CONFIG });
});

// ─── 文件上传配置 ─────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    file.originalname = fixFileName(file.originalname);
    cb(null, safeStorageFileName(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });


// ══════════════════════════════════════════════════════════════
//  工具函数
// ══════════════════════════════════════════════════════════════

/** 图片文件 → Base64 Data URL */
function imageToBase64(filePath) {
  const buf  = fs.readFileSync(filePath);
  const ext  = path.extname(filePath).toLowerCase();
  const mime = { '.jpg':'image/jpeg','.jpeg':'image/jpeg',
                 '.png':'image/png','.gif':'image/gif','.webp':'image/webp' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 文档提取纯文本 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.txt')  return fs.readFileSync(filePath, 'utf-8');
    if (ext === '.pdf' && pdfParse)  { const r = await pdfParse(fs.readFileSync(filePath)); return r.text; }
    if (ext === '.docx' && mammoth)  { const r = await mammoth.extractRawText({ path: filePath }); return r.value; }
    return '（不支持的文档格式）';
  } catch (e) {
    console.error('[extractText] 失败:', e.message);
    return '（文档解析失败）';
  }
}


// ══════════════════════════════════════════════════════════════
//  路由
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/upload
 * 接收单个文件，保存到磁盘，提取文档文本，返回 URL + content
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: '没有收到文件' });

  const file   = req.file;
  const origName = fixFileName(file.originalname);
  const ext    = path.extname(origName).toLowerCase();
  const isImg  = ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext);

  // 文档：提取文本供 AI 分析；图片：文本内容为空（前端用 base64 传给 AI）
  let content = '';
  if (!isImg) {
    content = await extractText(file.path);
  }

  console.log(`[upload] ${origName} (${isImg ? '图片' : '文档'}), 大小: ${(file.size/1024).toFixed(1)}KB`);

  res.json({
    ok: true,
    data: {
      fileId:   file.filename,
      fileName: origName,
      url:      `/uploads/${file.filename}`,
      content:  content,
      status:   'completed'
    }
  });
});


/**
 * POST /api/chat
 * 接收对话 + 文件信息，代理调用 OpenAI，SSE 流式返回
 *
 * 请求体（JSON）：
 * {
 *   messages:   [{role, content}],     // 历史对话
 *   imageFiles: [{name, base64Data}],  // 图片（前端转好的 base64）
 *   docFiles:   [{name, content}]      // 文档（后端解析好的文本）
 * }
 *
 * 响应（SSE 流）：
 * data: {"choices":[{"delta":{"content":"..."}}]}
 * data: [DONE]
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], imageFiles = [], docFiles = [] } = req.body;
    const strictWorkflow = req.body && req.body.strictWorkflow !== false;
    const carryHistory = !!(req.body && req.body.carryHistory);

    const chatUser = getTokenUser(req);
    if (!messages.length) {
      return res.status(400).json({ ok: false, message: 'messages 不能为空' });
    }

    console.log(`[chat] 消息 ${messages.length} 条，图片 ${imageFiles.length} 张，文档 ${docFiles.length} 份`);

    const latestUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const question = latestUserMsg ? String(latestUserMsg.content || '') : '';
    const intentResult = detectIntent(question);

    console.log(`[intent-router] module=legal_consultation intent=${intentResult.intent} score=${intentResult.score} hits=${intentResult.hitKeywords.join('|') || 'none'}`);
    if (intentResult.intent !== 'legal_consultation' && !imageFiles.length && !docFiles.length) {
      return res.json({
        success: true,
        content: `检测到您的问题更适合「${intentResult.intent}」模块。为避免上下文串台，本次未继承历史材料。请进入对应功能页重新发起请求。`
      });
    }

    // ── 1. 上下文附件（严格隔离：仅显式引用时注入）──
    const contextAttachments = [];
    docFiles.forEach(function (f) {
      contextAttachments.push({
        label: '附件: ' + f.name,
        text: (f.content || '').substring(0, 6000)
      });
    });

    if (chatUser) {
      const allKbItems = kbLoad().filter(i => i.userId === chatUser.id);
      const instruction = parseUserInstruction(question);
      if (instruction && instruction.type === 'file_analysis') {
        const found = findUserFile(
          instruction.fileName,
          docFiles,
          kbLoad(),
          chatUser.id
        );
        if (found) {
          const sourceLabel = found.source === 'chat' ? '当前会话' : '个人资料库';
          contextAttachments.push({
            label: '资料: ' + found.name + ' (' + sourceLabel + ')',
            text: found.content ? found.content.substring(0, 6000) : ''
          });
          console.log(`[chat] 指令匹配成功: "${found.name}" 源=${found.source} 用户=${chatUser.email}`);
        }
      } else if (allKbItems.length > 0) {
        console.log('[chat] 未检测到显式材料引用，本轮不注入资料库上下文');
      }
    }

    var sourceMessages = messages;
    if (strictWorkflow && !carryHistory) {
      sourceMessages = latestUserMsg ? [{ role: 'user', content: question }] : [];
    }

    const rawMessages = sourceMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content || '' }))
      .slice(-12);

    if (imageFiles.length > 0) {
      for (let i = rawMessages.length - 1; i >= 0; i--) {
        if (rawMessages[i].role === 'user') {
          if (!rawMessages[i].content.trim()) {
            rawMessages[i].content = PLACEHOLDER.image;
          }
          break;
        }
      }
    }

    if (imageFiles.length === 0) {
      for (let i = rawMessages.length - 1; i >= 0; i--) {
        if (rawMessages[i].role === 'user') {
          if (!rawMessages[i].content.trim()) {
            rawMessages[i].content = docFiles.length > 0 ? PLACEHOLDER.file : PLACEHOLDER.empty;
          }
          break;
        }
      }
    }

    const apiMessages = rawMessages
      .filter(m => m.content && String(m.content).trim() !== '');

    if (contextAttachments.length > 0 && apiMessages.length > 0) {
      const attachmentText = contextAttachments.map(function (a) { return a.text || ''; }).join('\n');
      if (isKeywordConflict(question, attachmentText)) {
        console.log('[sanity-check] 检测到问题与附件关键词冲突，已清空本次附件上下文');
        contextAttachments.length = 0;
      }
    }

    if (contextAttachments.length > 0 && apiMessages.length > 0) {
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === 'user') {
          apiMessages[i].content = buildPassthroughUserContent(apiMessages[i].content, contextAttachments);
          break;
        }
      }
    }

    console.log(`[chat] apiMessages 共 ${apiMessages.length} 条 (roles: ${apiMessages.map(m => m.role).join(',')}) contextLen=${contextAttachments.length} strict=${strictWorkflow} carryHistory=${carryHistory}`);

    // ── 2. 图片 OCR 结果并入消息（仅数据，无分析指令）──
    if (imageFiles.length > 0) {
      let lastUserIdx = -1;
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx >= 0) {
        const msg = apiMessages[lastUserIdx];
        const names = imageFiles.map(f => f.name).join('、');
        let ocrResults = '';

        if (tencentOcrClient) {
          for (const imgFile of imageFiles) {
            try {
              const base64 = imgFile.base64Data
                ? imgFile.base64Data.replace(/^data:image\/[a-z]+;base64,/, '')
                : null;
              if (!base64) continue;
              const ocrRes = await tencentOcrClient.GeneralBasicOCR({ ImageBase64: base64 });
              const text   = ensureUtf8String(
                (ocrRes.TextDetections || []).map(t => t.DetectedText).join('\n').trim()
              );
              if (text) {
                ocrResults += (ocrResults ? '\n' : '') + '《' + fixFileName(imgFile.name) + '》\n' + text;
              }
            } catch (ocrErr) {
              console.error(`[ocr-inline] ${imgFile.name} OCR 失败:`, ocrErr.message);
            }
          }
        }

        const ocrBlock = ocrResults || names;
        msg.content = buildPassthroughUserContent(msg.content, [
          { label: '图片/OCR: ' + names, text: ocrBlock }
        ]);
      }
    }

    // ── 3. 调用腾讯元器（纯透传）──────────────────
    const reply = await chatPassthrough({
      messages: apiMessages,
      userId: (req.body && req.body.conversationId) || (req.body && req.body.sessionId) || (chatUser && chatUser.id) || 'guest'
    });

    const lastUserMsg = [...messages].reverse().find(function (m) { return m.role === 'user'; });
    const chatPreview = String((lastUserMsg && lastUserMsg.content) || '').slice(0, 120);
    adminAnalytics.logEvent('ai_chat', {
      userId: chatUser && chatUser.id,
      email: chatUser && chatUser.email,
      preview: chatPreview,
      question: chatPreview
    });
    if (imageFiles.length > 0) {
      adminAnalytics.logEvent('ocr', {
        userId: chatUser && chatUser.id,
        fileName: imageFiles.map(function (f) { return f.name; }).join('、'),
        success: true,
        source: 'chat_inline'
      });
    }

    return res.json({
      success: true,
      content: reply
    });

  } catch (err) {
    console.error('[chat] 错误:', err.message);
    console.error('错误响应:', err.responseData || err.response?.data);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      ok:      false,
      message: err.message,
      detail:  err.responseData || undefined
    });
  }
});


// ── 静态资源（上传文件） ────────────────────────────────────────────────────
app.use('/uploads', express.static(uploadDir));


// ══════════════════════════════════════════════════════════════
//  用户认证接口（/api/auth/*）
//  数据持久化到 server/users.json；token 存在内存中（重启后需重新登录）
// ══════════════════════════════════════════════════════════════

const USERS_FILE  = path.join(__dirname, 'users.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

// token 持久化：启动时从文件加载，重启后客户端旧 token 不失效
function tokenStoreLoad() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const obj = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
      return new Map(Object.entries(obj));
    }
  } catch (e) { console.warn('[auth] tokenStore 加载失败:', e.message); }
  return new Map();
}
function tokenStoreSave(store) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(Object.fromEntries(store)), 'utf-8');
  } catch (e) { console.warn('[auth] tokenStore 保存失败:', e.message); }
}
const tokenStore = tokenStoreLoad(); // token → userId

function usersLoad() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) { console.error('[auth] 读取失败:', e.message); }
  return [];
}
function usersSave(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + 'fayi_salt_2024').digest('hex');
}
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}
function getTokenUser(req) {
  const token  = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const userId = tokenStore.get(token);
  if (!userId) return null;
  return usersLoad().find(u => u.id === userId) || null;
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const ADMIN_PERMISSION_CODE = 'manager';

function isExactAdminCode(code) {
  return String(code) === ADMIN_PERMISSION_CODE;
}

/** POST /api/auth/register — 注册（userType: user | admin） */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, avatar, userType, adminPermissionCode } = req.body || {};
  if (!email || !password) return res.json({ ok: false, message: '邮箱和密码不能为空' });

  const type = userType === 'admin' ? 'admin' : 'user';
  const emailNorm = normEmail(email);

  if (type === 'admin' && !isExactAdminCode(adminPermissionCode)) {
    return res.json({
      ok: false,
      message: '管理员权限验证码错误，无法注册管理员账号',
      code: 'ADMIN_CODE_INVALID'
    });
  }

  const users = usersLoad();
  if (users.find(u => normEmail(u.email) === emailNorm))
    return res.json({ ok: false, message: '该邮箱已被注册' });

  const nickname = (name || email.split('@')[0]).trim();
  const user = {
    id:           Date.now().toString() + Math.random().toString(36).slice(2, 6),
    nickname:     nickname,
    name:         nickname,
    email:        emailNorm,
    password:     hashPwd(password),
    avatar:       avatar || './images/avatars/1.svg',
    userType:     type,
    role:         type === 'admin' ? 'admin' : 'user',
    identityCode: type === 'admin' ? ADMIN_PERMISSION_CODE : null,
    persona:      'life_consume',
    status:       'active',
    createdAt:    new Date().toISOString(),
  };
  users.push(user);
  usersSave(users);
  adminAnalytics.logEvent(type === 'admin' ? 'admin_register' : 'user_register', {
    email: user.email, userId: user.id, userType: type
  });
  console.log(`[auth] 注册(${type}): ${email}`);
  res.json({ ok: true, message: '注册成功', data: { userType: type, email: user.email } });
});

/** POST /api/auth/login — 登录（管理员需 adminPermissionCode === manager） */
app.post('/api/auth/login', (req, res) => {
  const { email, password, adminPermissionCode } = req.body || {};
  if (!email || !password) return res.json({ ok: false, message: '请填写邮箱和密码' });

  const emailNorm = normEmail(email);
  const users = usersLoad();
  const user  = users.find(u => normEmail(u.email) === emailNorm && u.password === hashPwd(password));
  if (!user) return res.json({ ok: false, message: '邮箱或密码错误' });

  const role = user.role || (user.userType === 'admin' ? 'admin' : 'user');
  const isAdmin = role === 'admin' || user.userType === 'admin';

  if (user.status === 'banned') {
    return res.json({ ok: false, message: '账号已被封禁，请联系平台管理员' });
  }

  if (isAdmin) {
    if (adminPermissionCode === undefined || adminPermissionCode === '') {
      return res.json({
        ok: false,
        message: '请输入管理员权限验证码',
        code: 'ADMIN_CODE_REQUIRED'
      });
    }
    if (!isExactAdminCode(adminPermissionCode)) {
      return res.json({
        ok: false,
        message: '管理员权限验证失败',
        code: 'ADMIN_CODE_INVALID'
      });
    }

    const token = genToken();
    tokenStore.set(token, user.id);
    tokenStoreSave(tokenStore);

    let adminToken = token;
    try {
      const adminAuth = require('./modules/admin/admin-auth');
      adminToken = adminAuth.loginPlatformUser(user);
    } catch (e) {
      console.warn('[auth] admin token issue:', e.message);
    }

    adminAnalytics.logEvent('admin_login', { email: user.email, userId: user.id, source: 'platform_login' });
    console.log(`[auth] 管理员登录: ${email}`);
    return res.json({
      ok: true,
      data: {
        token,
        adminToken,
        adminVerified: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          persona: user.persona,
          userType: 'admin',
          role: 'admin'
        }
      }
    });
  }

  const token = genToken();
  tokenStore.set(token, user.id);
  tokenStoreSave(tokenStore);
  adminAnalytics.logEvent('user_login', { email: user.email, userId: user.id });
  console.log(`[auth] 登录: ${email}`);
  res.json({
    ok: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        persona: user.persona,
        userType: 'user',
        role: 'user'
      }
    }
  });
});

/** PUT /api/auth/profile — 更新资料 */
app.put('/api/auth/profile', (req, res) => {
  const user = getTokenUser(req);
  if (!user) return res.json({ ok: false, message: '未登录或会话已过期' });

  const users = usersLoad();
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return res.json({ ok: false, message: '用户不存在' });

  const { name, avatar, persona, lifeScene } = req.body || {};
  if (name)    users[idx].name    = name;
  if (avatar)  users[idx].avatar  = avatar;
  if (persona) users[idx].persona = persona;
  if (lifeScene) users[idx].persona = lifeScene;  // lifeScene 为 persona 的别名
  usersSave(users);

  const u = users[idx];
  console.log(`[auth] 更新资料: ${u.email}`);
  res.json({
    ok: true,
    data: {
      id: u.id, name: u.name, email: u.email,
      avatar: u.avatar, persona: u.persona, userType: u.userType || 'user'
    }
  });
});

/** POST /api/auth/change-password — 修改密码 */
app.post('/api/auth/change-password', (req, res) => {
  const user = getTokenUser(req);
  if (!user) return res.json({ ok: false, message: '未登录或会话已过期' });

  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword)
    return res.json({ ok: false, message: '请填写原密码和新密码' });

  const users = usersLoad();
  const idx   = users.findIndex(u => u.id === user.id);
  if (users[idx].password !== hashPwd(oldPassword))
    return res.json({ ok: false, message: '原密码错误' });

  users[idx].password = hashPwd(newPassword);
  usersSave(users);
  console.log(`[auth] 改密: ${user.email}`);
  res.json({ ok: true, message: '密码修改成功' });
});


// ══════════════════════════════════════════════════════════════
//  普法推荐接口（基于用户生活场景的动态推荐）
// ══════════════════════════════════════════════════════════════

/** 生活场景 → 法律推荐映射（核心配置） */
const LIFE_SCENE_MAP = {
  life_consume: [
    { title: '消费者权益保护', description: '购物、服务消费中的维权知识，了解退换货、欺诈赔偿等权利。', laws: ['《消费者权益保护法》', '《产品质量法》', '《电子商务法》'] },
    { title: '合同签订与履行', description: '日常生活中签订合同（装修、租赁、服务）应注意的法律要点。', laws: ['《民法典》合同编', '《合同违法行为监督处理办法》'] },
    { title: '食品安全与健康权', description: '了解食品安全标准、过期食品维权及健康损害赔偿。', laws: ['《食品安全法》', '《产品质量法》', '《侵权责任法》'] }
  ],
  work_labor: [
    { title: '劳动合同与权益保护', description: '了解劳动法规，保护工作中的合法权益，包括加班、年假、社保。', laws: ['《劳动法》', '《劳动合同法》', '《工资支付暂行规定》'] },
    { title: '工伤认定与赔偿', description: '工伤事故后的认定流程、赔偿标准及劳动仲裁途径。', laws: ['《工伤保险条例》', '《劳动争议调解仲裁法》'] },
    { title: '职场权益与反歧视', description: '招聘歧视、职场骚扰、违法解雇等问题的法律保障。', laws: ['《劳动法》', '《就业促进法》', '《妇女权益保障法》'] }
  ],
  privacy_data: [
    { title: '个人信息保护', description: '了解个人信息的采集、使用、存储规则及您的删除权、查阅权。', laws: ['《个人信息保护法》', '《网络安全法》', '《数据安全法》'] },
    { title: '网络账户与数据安全', description: '账号被盗、数据泄露后的维权途径及平台责任。', laws: ['《网络安全法》', '《数据安全法》', '《电信和互联网用户个人信息保护规定》'] },
    { title: '隐私权与名誉权保护', description: '被偷拍、信息被公开传播等隐私侵害的救济方式。', laws: ['《民法典》人格权编', '《治安管理处罚法》'] }
  ],
  rent_housing: [
    { title: '租房合同与押金纠纷', description: '租房合同签订注意事项、押金退还规则及违约处理。', laws: ['《民法典》合同编', '《商品房屋租赁管理办法》'] },
    { title: '房屋买卖与产权', description: '购房流程中的法律风险、产权登记及开发商违约。', laws: ['《城市房地产管理法》', '《不动产登记暂行条例》'] },
    { title: '物业纠纷处理', description: '物业费争议、公共区域使用、邻里纠纷的法律解决途径。', laws: ['《民法典》物权编', '《物业管理条例》'] }
  ],
  traffic: [
    { title: '交通事故责任认定', description: '交通事故后的责任划分、保险理赔及人身损害赔偿标准。', laws: ['《道路交通安全法》', '《道路交通事故处理程序规定》', '《民法典》侵权责任编'] },
    { title: '交通违法与处罚', description: '常见交通违法行为、扣分标准及行政复议流程。', laws: ['《道路交通安全法》', '《机动车驾驶证申领和使用规定》'] },
    { title: '网约车与公共出行', description: '网约车纠纷、公共交通意外伤害的法律保障。', laws: ['《网络预约出租汽车经营服务管理暂行办法》', '《民法典》合同编'] }
  ],
  minor_elder: [
    { title: '未成年人保护', description: '校园欺凌、网络沉迷、监护权等未成年人相关法律知识。', laws: ['《未成年人保护法》', '《预防未成年人犯罪法》', '《家庭教育促进法》'] },
    { title: '老年人权益保障', description: '赡养义务、养老金、遗产继承等老年人关心的法律问题。', laws: ['《老年人权益保障法》', '《民法典》继承编'] },
    { title: '家庭暴力与婚姻权益', description: '家暴维权、离婚财产分割、子女抚养权等家事法律。', laws: ['《反家庭暴力法》', '《民法典》婚姻家庭编'] }
  ],
  startup_micro: [
    { title: '市场主体登记与经营', description: '个体工商户、小微企业注册流程及经营合规要求。', laws: ['《市场主体登记管理条例》', '《个体工商户条例》', '《公司法》'] },
    { title: '合同风险与债务纠纷', description: '经营中常见的合同违约、货款追讨及担保法律问题。', laws: ['《民法典》合同编', '《民事诉讼法》'] },
    { title: '税务与知识产权基础', description: '小微企业税收优惠政策及商标、版权保护入门。', laws: ['《企业所得税法》', '《商标法》', '《著作权法》'] }
  ]
};

/** 默认推荐（用户未设置场景时） */
const DEFAULT_RECOMMEND = [
  { title: '消费者权益保护', description: '购物、服务消费中的维权知识，了解退换货、欺诈赔偿等权利。', laws: ['《消费者权益保护法》', '《产品质量法》', '《电子商务法》'] },
  { title: '劳动合同与权益保护', description: '了解劳动法规，保护工作中的合法权益，包括加班、年假、社保。', laws: ['《劳动法》', '《劳动合同法》', '《工资支付暂行规定》'] },
  { title: '个人信息保护', description: '了解个人信息的采集、使用、存储规则及您的删除权、查阅权。', laws: ['《个人信息保护法》', '《网络安全法》', '《数据安全法》'] },
  { title: '租房合同与押金纠纷', description: '租房合同签订注意事项、押金退还规则及违约处理。', laws: ['《民法典》合同编', '《商品房屋租赁管理办法》'] },
  { title: '交通事故责任认定', description: '交通事故后的责任划分、保险理赔及人身损害赔偿标准。', laws: ['《道路交通安全法》', '《民法典》侵权责任编'] }
];

/**
 * GET /api/recommend/law — 基于用户生活场景的动态法律推荐
 * GET /api/pufa          — 兼容旧接口（同逻辑）
 */
function handleRecommend(req, res) {
  try {
    const user = getTokenUser(req);
    const scene = (user && user.persona) ? user.persona : null;
    const items = (scene && LIFE_SCENE_MAP[scene]) ? LIFE_SCENE_MAP[scene] : DEFAULT_RECOMMEND;
    const sceneLabels = {
      life_consume:  '日常生活与消费维权',
      work_labor:    '劳动就业与职场',
      privacy_data:  '个人隐私与数据保护',
      rent_housing:  '租房与房屋居住',
      traffic:       '道路交通与出行',
      minor_elder:   '未成年人与老年人照护',
      startup_micro: '小微主体与开店经营'
    };
    const sceneName = scene ? (sceneLabels[scene] || scene) : null;
    const intro = sceneName
      ? `根据您选择的生活场景「${sceneName}」，为您推荐以下法律知识：`
      : '以下是为您推荐的通用法律知识，您可以在个人中心设置生活场景以获取更精准的推荐。';

    res.json({
      ok: true,
      data: {
        intro,
        scene: scene || 'default',
        items: items.map(it => ({
          title:       it.title,
          description: it.description,
          why:         it.description,   // 兼容旧前端字段
          laws:        it.laws
        }))
      }
    });
  } catch (err) {
    console.error('[recommend] 错误:', err.message);
    res.status(500).json({ ok: false, message: '推荐服务异常，请稍后重试' });
  }
}

app.get('/api/recommend/law', handleRecommend);
app.get('/api/pufa', handleRecommend);


// ══════════════════════════════════════════════════════════════
//  知识库接口（/api/knowledge）
//  数据持久化到 server/knowledge-data.json
// ══════════════════════════════════════════════════════════════

const KB_FILE = path.join(__dirname, 'knowledge-data.json');

function kbLoad() {
  try {
    if (fs.existsSync(KB_FILE)) return JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
  } catch (e) { console.error('[kb] 读取失败:', e.message); }
  return [];
}

function kbSave(items) {
  fs.writeFileSync(KB_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

/** GET /api/knowledge — 获取当前用户的条目（需 token；未登录返回空数组） */
app.get('/api/knowledge', (req, res) => {
  const user = getTokenUser(req);

  const all = kbLoad();

  if (!user) {
    // token 无效时（如服务重启后旧 token 失效），仍返回 userId 为 null 的孤儿条目
    return res.json({ ok: true, data: all.filter(i => i.userId === null || i.userId === undefined) });
  }

  // 已登录：返回属于该用户的 + 孤儿条目，并自动将孤儿正确归属
  let changed = false;
  const items = all.filter(i => {
    if (i.userId === user.id) return true;
    if (i.userId === null || i.userId === undefined) {
      i.userId = user.id;
      changed = true;
      return true;
    }
    return false;
  });
  if (changed) kbSave(all);
  res.json({ ok: true, data: items });
});

/** GET /api/user-files — 获取用户资料库文件列表（供外部使用） */
app.get('/api/user-files', (req, res) => {
  const user = getTokenUser(req);
  if (!user) return res.status(401).json({ ok: false, message: '未登录' });
  const items = kbLoad()
    .filter(i => i.userId === user.id && i.hasFile)
    .map(i => ({
      id: i.id, title: i.title, fileName: i.fileName,
      fileUrl: i.fileUrl, createdAt: i.createdAt
    }));
  res.json({ ok: true, data: items });
});

/** POST /api/knowledge — 新建条目，支持 multipart/form-data 文件附件 */
app.post('/api/knowledge', upload.single('file'), async (req, res) => {
  let { title, content } = req.body || {};

  if (!title || !title.trim()) {
    if (req.file) {
      title = fixFileName(req.file.originalname);
    } else {
      return res.status(400).json({ ok: false, message: '标题不能为空' });
    }
  }

  const kbUser = getTokenUser(req);

  const item = {
    id:            Date.now().toString() + Math.random().toString(36).slice(2, 6),
    userId:        kbUser ? kbUser.id : null,
    title:         title.trim(),
    content:       (content || '').trim(),
    parsedContent: '',    // 文件解析后的纯文本（自动填充）
    createdAt:     new Date().toISOString(),
    hasFile:       false,
    fileName:      null,
    fileUrl:       null,
  };

  if (req.file) {
    item.hasFile  = true;
    item.fileName = fixFileName(req.file.originalname);
    item.fileUrl  = `/uploads/${req.file.filename}`;

    // 自动解析文件内容（txt / pdf / docx）
    const filePath = path.join(uploadDir, req.file.filename);
    const parsed   = await parseFileContent(filePath);
    if (parsed) {
      item.parsedContent = parsed;
      console.log(`[knowledge] 解析成功: "${item.fileName}" 提取 ${parsed.length} 字符`);
    }
  }

  const items = kbLoad();
  items.unshift(item);
  kbSave(items);

  console.log(`[knowledge] 新建: "${item.title}" 用户:${kbUser ? kbUser.email : '未登录'}${req.file ? ' + 附件 ' + item.fileName : ''}`);
  res.json({ ok: true, data: item });
});

/**
 * GET /api/knowledge/:id/content — 获取条目的文件解析内容（getFileContent）
 * 已解析的直接返回缓存；未解析的实时解析并缓存
 */
app.get('/api/knowledge/:id/content', async (req, res) => {
  const user = getTokenUser(req);
  if (!user) return res.status(401).json({ ok: false, message: '未登录' });

  const items = kbLoad();
  const item  = items.find(i => i.id === req.params.id);
  if (!item)              return res.status(404).json({ ok: false, message: '条目不存在' });
  if (item.userId !== user.id) return res.status(403).json({ ok: false, message: '无权访问' });

  // 已缓存解析内容，直接返回
  if (item.parsedContent) {
    return res.json({ ok: true, id: item.id, title: item.title,
      content: item.parsedContent, cached: true });
  }

  // 文件存在时实时解析
  if (item.hasFile && item.fileUrl) {
    const filePath = path.join(uploadDir, path.basename(item.fileUrl));
    if (fs.existsSync(filePath)) {
      const parsed = await parseFileContent(filePath);
      if (parsed) {
        item.parsedContent = parsed;  // 写回缓存
        kbSave(items);
        console.log(`[knowledge] 按需解析: "${item.fileName}" 提取 ${parsed.length} 字符`);
      }
      return res.json({ ok: true, id: item.id, title: item.title,
        content: parsed, cached: false });
    }
  }

  // 无文件时返回手动输入的文本
  res.json({ ok: true, id: item.id, title: item.title,
    content: item.content || '', cached: false });
});

/** DELETE /api/knowledge/:id — 删除条目 */
app.delete('/api/knowledge/:id', (req, res) => {
  const items   = kbLoad();
  const updated = items.filter(i => i.id !== req.params.id);
  const deleted = updated.length < items.length;
  if (deleted) kbSave(updated);
  console.log(`[knowledge] 删除 ${req.params.id}: ${deleted ? '成功' : '未找到'}`);
  res.json({ ok: deleted, message: deleted ? '已删除' : '条目不存在' });
});


// ── POST /api/ocr  接收图片文件，调用腾讯云 GeneralBasicOCR，返回识别文字 ──────
app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传图片文件，字段名：file' });
    }

    const allowedExt = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!allowedExt.includes(ext)) {
      return res.status(400).json({ success: false, message: `不支持的文件类型 ${ext}，仅支持图片` });
    }

    if (!tencentOcrClient) {
      return res.status(503).json({ success: false, message: 'OCR 客户端未初始化，请检查密钥配置' });
    }

    const ocrStarted = Date.now();
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    console.log(`[/api/ocr] 识别: ${req.file.originalname}, base64长度: ${base64.length}`);

    const ocrRes = await tencentOcrClient.GeneralBasicOCR({ ImageBase64: base64 });
    const text   = ensureUtf8String(
      (ocrRes.TextDetections || []).map(t => t.DetectedText).join('\n').trim()
    );
    const lines  = ocrRes.TextDetections?.length || 0;
    const ocrFileName = fixFileName(req.file.originalname);
    console.log(`[/api/ocr] 完成，共识别 ${lines} 行文字`);

    const ocrUser = getTokenUser(req);
    adminAnalytics.appendOcrRecord(buildOcrRecord(req.file, {
      success: true,
      status: 'success',
      ocrType: 'basic',
      lines: lines,
      durationMs: Date.now() - ocrStarted,
      userId: ocrUser && ocrUser.id,
      textPreview: text.slice(0, 300),
      fullText: text.slice(0, 8000)
    }));
    adminAnalytics.logEvent('ocr', {
      userId: ocrUser && ocrUser.id,
      fileName: ocrFileName,
      success: true,
      lines: lines,
      ocrText: ensureUtf8String(text.slice(0, 500)),
      source: 'api_ocr'
    });

    res.json({ success: true, text, lines });
  } catch (err) {
    console.error('[/api/ocr] 错误:', err.message, '错误码:', err.code || err.statusCode);
    if (req.file) {
      adminAnalytics.appendOcrRecord(buildOcrRecord(req.file, {
        success: false,
        status: 'failed',
        ocrType: 'basic',
        error: err.message,
        userId: (getTokenUser(req) && getTokenUser(req).id) || ''
      }));
    }
    adminAnalytics.logEvent('ocr', {
      fileName: (req.file && fixFileName(req.file.originalname)) || 'unknown',
      success: false,
      source: 'api_ocr'
    });
    res.status(500).json({ success: false, message: err.message, code: err.code || err.statusCode });
  }
});


// ── POST /api/process-image  OCR识别 + 腾讯元器AI法律分析，完整闭环 ──────
app.post('/api/process-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传图片文件，字段名：file' });
    }

    const allowedExt = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!allowedExt.includes(ext)) {
      return res.status(400).json({ success: false, error: `不支持的文件类型 ${ext}，仅支持图片` });
    }

    if (!tencentOcrClient) {
      return res.status(503).json({ success: false, error: 'OCR 客户端未初始化，请检查密钥配置' });
    }

    // ──── 1. OCR 识别 ──────────────────────────────────────────────────
    const imgOcrStarted = Date.now();
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    console.log(`[/api/process-image] 上传文件： ${req.file.originalname}, base64长度: ${base64.length}`);

    const ocrRes  = await tencentOcrClient.GeneralBasicOCR({ ImageBase64: base64 });
    const ocr_text = ensureUtf8String(
      (ocrRes.TextDetections || []).map(t => t.DetectedText).join('\n').trim()
    );
    const lines   = ocrRes.TextDetections?.length || 0;
    const imgFileName = fixFileName(req.file.originalname);
    console.log(`[/api/process-image] OCR完成，共 ${lines} 行文字`);
    console.log(`[/api/process-image] OCR文字内容：${ocr_text.substring(0, 300)}`);

    // ──── 2. 腾讯元器 AI 法律分析 ─────────────────────────────────────────
    const imageUser = getTokenUser(req);
    const userId = (imageUser && imageUser.id) ? imageUser.id : 'fayi_image_user';

    const analysis = await chatPassthrough({
      messages: [{ role: 'user', content: buildPassthroughUserContent('', [{ label: 'OCR/' + imgFileName, text: ocr_text || PLACEHOLDER.image }]) }],
      userId: userId
    });
    console.log(`[/api/process-image] 接口返回：{ success: true, ocr_text长度: ${ocr_text.length}, analysis长度: ${analysis.length} }`);

    adminAnalytics.appendOcrRecord(buildOcrRecord(req.file, {
      success: true,
      status: 'success',
      ocrType: 'process_image',
      lines: lines,
      durationMs: Date.now() - imgOcrStarted,
      userId: userId,
      textPreview: ensureUtf8String(ocr_text.slice(0, 300)),
      fullText: ensureUtf8String(ocr_text.slice(0, 8000))
    }));
    adminAnalytics.logEvent('ocr', {
      userId: userId,
      fileName: imgFileName,
      success: true,
      lines: lines,
      ocrText: ensureUtf8String(ocr_text.slice(0, 500)),
      source: 'process_image'
    });
    adminAnalytics.logEvent('ai_case', {
      userId: userId,
      risk: '中',
      preview: ensureUtf8String((ocr_text || '图片法律分析').slice(0, 80)),
      analysis: (analysis || '').slice(0, 400),
      source: 'process_image'
    });

    res.json({ success: true, ocr_text, analysis });

  } catch (err) {
    console.error('[/api/process-image] 错误:', err.message, '错误码:', err.code || err.statusCode);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── POST /api/process-case  统一案件处理接口：text+file → OCR/解析 → AI分析 → 结构化返回 ──
app.post('/api/process-case', upload.single('file'), async (req, res) => {
  try {
    const userText = (req.body && req.body.text) ? req.body.text.trim() : '';
    let extractedText = userText;

    // 处理上传文件
    if (req.file) {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const isImg = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'].includes(ext);
      const isDoc = ['.pdf', '.docx', '.doc', '.txt'].includes(ext);

      if (isImg && tencentOcrClient) {
        const caseOcrStarted = Date.now();
        const base64 = fs.readFileSync(req.file.path).toString('base64');
        let ocrText = '';
        let usedMethod = 'GeneralBasicOCR';
        // 先试 GeneralBasicOCR，失败则尝试 GeneralFastOCR
        const ocrMethods = ['GeneralBasicOCR', 'GeneralFastOCR', 'GeneralAccurateOCR'];
        for (const method of ocrMethods) {
          try {
            const ocrRes = await tencentOcrClient[method]({ ImageBase64: base64 });
            ocrText = ensureUtf8String(
              (ocrRes.TextDetections || []).map(t => t.DetectedText).join('\n').trim()
            );
            if (ocrText) {
              usedMethod = method;
              console.log(`[process-case] ${method} 识别成功，${ocrRes.TextDetections?.length || 0}行`);
              break;
            }
          } catch (e) {
            console.warn(`[process-case] ${method} 失败: ${e.message} (${e.code || ''})`);
          }
        }
        if (ocrText) {
          extractedText = ocrText;
          if (userText) extractedText = userText + '\n\n' + ocrText;
          req._caseOcrMeta = {
            durationMs: Date.now() - caseOcrStarted,
            ocrType: usedMethod === 'GeneralAccurateOCR' ? 'accurate' : 'process_case',
            lines: (ocrText.match(/\n/g) || []).length + 1
          };
        } else {
          adminAnalytics.appendOcrRecord(buildOcrRecord(req.file, {
            success: false,
            status: 'failed',
            ocrType: 'process_case',
            error: 'OCR识别失败',
            userId: (getTokenUser(req) && getTokenUser(req).id) || ''
          }));
          // OCR 全部失败：兑廞汇报告用户并引导手动输入
          console.warn('[process-case] 所有OCR方式均失败，返回引导提示');
          return res.status(200).json({
            success: false,
            ocrError: true,
            error: 'OCR识别服务未开通。请将图片中的案情文字内容直接复制到输入框中发送，即可获得分析。'
          });
        }
      } else if (isDoc) {
        try {
          const docText = await extractText(req.file.path);
          if (docText) {
            extractedText = docText.substring(0, 8000);
            if (userText) extractedText = userText + '\n\n' + extractedText;
          }
        } catch (e) {
          console.warn('[process-case] 文档解析失败:', e.message);
        }
      }
    }

    if (!extractedText) {
      return res.status(400).json({ success: false, error: '请提供案件描述文字或上传文件' });
    }

    const caseUser = getTokenUser(req);
    const userId = (req.body && req.body.conversationId) || (caseUser && caseUser.id) || 'fayi_case_user';
    const content = await chatPassthrough({
      messages: [{ role: 'user', content: buildPassthroughUserContent(userText, [{ label: '案件材料', text: extractedText }]) }],
      userId: userId
    });

    console.log(`[process-case] 元器返回 ${content.length} 字`);
    adminAnalytics.logEvent('ai_case', {
      userId: caseUser && caseUser.id,
      preview: content.slice(0, 120),
      question: userText.slice(0, 200)
    });
    if (req.file) {
      const caseFileName = fixFileName(req.file.originalname);
      const caseText = ensureUtf8String(extractedText);
      const meta = req._caseOcrMeta || {};
      adminAnalytics.appendOcrRecord(buildOcrRecord(req.file, {
        textPreview: caseText.slice(0, 300),
        fullText: caseText.slice(0, 8000),
        success: true,
        status: 'success',
        ocrType: meta.ocrType || 'process_case',
        durationMs: meta.durationMs || 0,
        lines: meta.lines || 0,
        userId: caseUser && caseUser.id
      }));
      adminAnalytics.logEvent('ocr', {
        userId: caseUser && caseUser.id,
        fileName: caseFileName,
        success: true,
        ocrText: caseText.slice(0, 500),
        source: 'process_case'
      });
    }
    res.json({ success: true, content: content, raw: content });

  } catch (err) {
    console.error('[process-case] 错误:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── POST /api/wenshi/generate  法律文书生成（直连 Qwen，纯文本）──────────────────
app.post('/api/wenshi/generate', async (req, res) => {
  try {
    const question = (req.body && req.body.question) ? String(req.body.question).trim() : '';
    if (!question) {
      return res.status(400).json(apiError('问题不能为空'));
    }

    // 文书生成简化：仅使用当前问题，禁止继承历史上下文
    const content = await generateLegalDocumentByQwen(question);
    const firstLine = String(content || '').split(/\n+/).find(Boolean) || '法律文书';
    const title = firstLine.replace(/^《|》$/g, '').trim() || '法律文书';
    const normalized = {
      title: title,
      summary: question.slice(0, 200),
      document_content: content,
      body_markdown: content
    };

    adminAnalytics.logEvent('ai_wenshi', {
      title: title,
      preview: question.slice(0, 120),
      question: question.slice(0, 300),
      summary: content.slice(0, 300),
      source: 'qwen_direct'
    });
    adminAnalytics.appendDocRecord({
      title: title,
      docType: '法律文书',
      content: content,
      preview: question.slice(0, 120)
    });
    return res.json(apiSuccess(normalized, '法律文书生成成功'));
  } catch (err) {
    console.error('[wenshi/generate]', err.message);
    return res.status(err.statusCode || 500).json(apiError(
      '当前法律文书生成服务暂时不可用，请稍后重试。',
      err.message || 'wenshi unavailable'
    ));
  }
});

// ── POST /api/legal/search  法律法规检索（直连 Qwen，无历史上下文）───────────────
async function handleLegalSearch(req, res) {
  try {
    const query = (req.body && req.body.query) ? String(req.body.query).trim() : '';
    if (!query) {
      return res.status(400).json(apiError('检索词不能为空'));
    }

    // 法规检索必须单轮独立请求：禁止历史串台、禁止上下文复用
    const raw = await searchLegalByQwen(query);
    const normalized = formatLegalSearchResult(query, raw);

    adminAnalytics.logEvent('ai_fagui', {
      keyword: normalized.keyword,
      preview: query.slice(0, 120),
      query: query.slice(0, 300),
      analysis: (normalized.analysis || '').slice(0, 200),
      source: 'qwen_direct'
    });

    return res.json(apiSuccess(normalized, '法规检索成功'));
  } catch (err) {
    console.error('[legal/search]', err.message);
    return res.status(err.statusCode || 500).json(apiError(
      '当前法规检索服务暂时不可用，请稍后重试。',
      err.message || 'legal search unavailable'
    ));
  }
}

app.post('/api/legal/search', handleLegalSearch);
// 兼容旧前端路径：内部统一走直连 Qwen 链路
app.post('/api/fagui/search', handleLegalSearch);

// ── 普法宣传 API ────────────────────────────────────────────────────────────
if (lawEducationRouter) {
  app.use('/api/law-education', lawEducationRouter);
}

// ── 管理端 & 数字大屏 API（/api/admin/*）────────────────────────────────────
const { installAdminJsonEnvelope, installApiErrorHandlers } = require('./lib/api-response');
installAdminJsonEnvelope(adminRouter);
app.use('/api/admin', adminRouter);

// ── 公共数字看板 API（/api/dashboard/*）──────────────────────────────────────
app.get('/api/dashboard/realtime', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ success: true, data: adminAnalytics.buildRealtimePayload() });
});

app.get('/api/dashboard/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  let lastSeq = -1;
  function push() {
    const payload = adminAnalytics.buildRealtimePayload();
    const seq = (payload.revision && payload.revision.seq) || 0;
    if (seq !== lastSeq) {
      lastSeq = seq;
      res.write('event: update\ndata: ' + JSON.stringify({ success: true, data: payload }) + '\n\n');
    } else {
      res.write('event: ping\ndata: ' + JSON.stringify({ serverTime: payload.serverTime }) + '\n\n');
    }
  }
  push();
  const timer = setInterval(push, 2000);
  req.on('close', () => clearInterval(timer));
});

// ── 健康检查 ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { port: PORT, model: 'deepseek-chat' }, ok: true });
});

installApiErrorHandlers(app);

// ── 启动服务器 ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log(`  ║  DeepSeek AI 服务已启动                ║`);
  console.log(`  ║  http://localhost:${PORT}               ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  接口：');
  console.log('    POST /api/upload          — 文件上传（图片/文档）');
  console.log('    POST /api/chat            — 多模态对话（SSE 流式）');
  console.log('    GET  /api/knowledge       — 获取资料库列表');
  console.log('    POST /api/knowledge       — 新建资料库条目');
  console.log('    POST /api/wenshi/generate — 法律文书生成（JSON）');
  console.log('    POST /api/legal/search    — 法律法规检索（Qwen直连）');
  console.log('    POST /api/fagui/search    — 法律法规检索（兼容路径）');
  console.log('    GET  /api/admin/*         — 管理端 API');
  console.log('    GET  /api/admin/datav/realtime — 数字大屏实时数据');
  console.log('    GET  /api/admin/datav/stream   — 数字大屏 SSE 推送');
  console.log('    GET  /api/dashboard/realtime   — 公共实时看板数据');
  console.log('    GET  /api/dashboard/stream     — 公共实时看板 SSE');
  console.log('    GET  /api/law-education/* — 普法宣传 API');
  console.log('  个人中心管理端: profile.html#admin');
  console.log('  数字大屏:       http://localhost:8080/datav/');
  console.log('    DELETE /api/knowledge/:id — 删除资料库条目');
  console.log('    POST /api/auth/register   — 用户注册');
  console.log('    POST /api/auth/login      — 用户登录');
  console.log('    PUT  /api/auth/profile    — 更新资料');
  console.log('    POST /api/auth/change-password — 修改密码');
  console.log('    GET  /api/recommend/law   — 动态普法推荐（基于生活场景）');
  console.log('    GET  /api/pufa            — 普法推荐（兼容）');
  console.log('    GET  /health              — 健康检查');
  console.log('');
  const keyOk = YUANQI_API_KEY && YUANQI_API_KEY.length > 10;
  console.log(keyOk ? '  ✅ 腾讯元器 API Key 已配置' : '  ⚠️  腾讯元器 API Key 未配置');
  console.log(`  智能体 ID: ${YUANQI_ASSISTANT_ID}`);
  console.log('');
});
