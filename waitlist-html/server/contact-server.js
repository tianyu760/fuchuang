/**
 * 法绎 · 联系表单邮件服务
 * 端口: 3001
 * 启动: node contact-server.js
 */
require('dotenv').config({ path: __dirname + '/.env' });

var express    = require('express');
var nodemailer = require('nodemailer');
var cors       = require('cors');
var bodyParser = require('body-parser');
var multer     = require('multer');
var fs         = require('fs');
var path       = require('path');

var app  = express();
var PORT = process.env.CONTACT_PORT || 3001;
var MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
var MAX_UPLOAD_COUNT = 5;
var ALLOWED_EXT = {
    pdf: true, doc: true, docx: true,
    png: true, jpg: true, jpeg: true,
    zip: true, txt: true
};
var ALLOWED_MIME = {
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'image/png': true,
    'image/jpeg': true,
    'application/zip': true,
    'application/x-zip-compressed': true,
    'text/plain': true
};
var CONTACT_UPLOAD_DIR = path.join(__dirname, 'uploads', 'contact');
var FEEDBACK_LOG_FILE = path.join(__dirname, 'data', 'admin', 'feedback-upload-log.json');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(CONTACT_UPLOAD_DIR);
ensureDir(path.dirname(FEEDBACK_LOG_FILE));

/* ─── CORS：只允许本地前端访问 ─── */
app.use(cors({
    origin: [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000',
        'null'          /* file:// 协议本地直接打开 */
    ],
    methods: ['POST', 'OPTIONS']
}));

app.use(bodyParser.json({ limit: '30kb' }));

/* ─── 简易 IP 速率限制（每 IP 每分钟最多 5 次） ─── */
var rateMap = {};
function rateLimit(req, res, next) {
    var ip  = req.ip || req.connection.remoteAddress || 'unknown';
    var now = Date.now();
    if (!rateMap[ip]) rateMap[ip] = [];
    rateMap[ip] = rateMap[ip].filter(function (t) { return now - t < 60000; });
    if (rateMap[ip].length >= 5) {
        console.warn('[contact] 速率限制触发 IP:', ip);
        return res.status(429).json({ success: false, message: '操作过于频繁，请 1 分钟后再试' });
    }
    rateMap[ip].push(now);
    next();
}

/* ─── HTML 转义，防止 XSS 注入邮件 ─── */
function escHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function fileExt(name) {
    var n = String(name || '').toLowerCase();
    var idx = n.lastIndexOf('.');
    return idx >= 0 ? n.slice(idx + 1) : '';
}

function safeUnlink(filePath) {
    if (!filePath) return;
    fs.unlink(filePath, function () {});
}

function appendFeedbackLog(row) {
    var list = [];
    try {
        if (fs.existsSync(FEEDBACK_LOG_FILE)) {
            var raw = fs.readFileSync(FEEDBACK_LOG_FILE, 'utf-8');
            var parsed = raw ? JSON.parse(raw) : [];
            list = Array.isArray(parsed) ? parsed : [];
        }
    } catch (e) {
        list = [];
    }
    list.unshift(row);
    if (list.length > 2000) list = list.slice(0, 2000);
    try {
        fs.writeFileSync(FEEDBACK_LOG_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
        console.warn('[contact] 写入 feedback_upload_log 失败:', e.message);
    }
}

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, CONTACT_UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        var ext = path.extname(file.originalname || '');
        var base = path.basename(file.originalname || 'file', ext).replace(/[^\w\u4e00-\u9fa5-]/g, '_');
        cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + base + ext);
    }
});

var upload = multer({
    storage: storage,
    limits: { fileSize: MAX_UPLOAD_SIZE, files: MAX_UPLOAD_COUNT },
    fileFilter: function (req, file, cb) {
        var ext = fileExt(file.originalname);
        var mime = String(file.mimetype || '').toLowerCase();
        if (!ALLOWED_EXT[ext]) {
            return cb(new Error('附件类型不支持，仅支持 pdf/doc/docx/png/jpg/jpeg/zip/txt'));
        }
        if (mime && !ALLOWED_MIME[mime]) {
            return cb(new Error('附件 MIME 类型不支持'));
        }
        cb(null, true);
    }
});

/* ─── 邮件发送器（QQ SMTP）─── */
var transporter = nodemailer.createTransport({
    service: 'qq',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS   /* QQ授权码，非登录密码 */
    }
});

/* ─── 接口：POST /api/contact（multipart + 附件）─── */
app.post('/api/contact', rateLimit, upload.array('files', MAX_UPLOAD_COUNT), async function (req, res) {
    /* 取值并截断，防止超长输入 */
    var name     = (req.body.name     || '').toString().trim().slice(0, 50);
    var email    = (req.body.email    || '').toString().trim().slice(0, 100);
    var contact  = (req.body.contact  || '').toString().trim().slice(0, 120);
    var userEmail = (req.body.userEmail || '').toString().trim().slice(0, 120);
    var identity = (req.body.identity || '未填写').toString().trim().slice(0, 50);
    var message  = (req.body.message  || '').toString().trim().slice(0, 2000);
    var attachmentText = (req.body.attachmentText || '').toString().trim().slice(0, 600);
    var files = Array.isArray(req.files) ? req.files : [];

    console.log('[contact] 收到提交 name=%s email=%s identity=%s files=%d', name, email, identity, files.length);

    /* 必填字段校验 */
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: '姓名、邮箱和咨询内容不能为空' });
    }

    /* 邮箱格式校验 */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    }

    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f.size > MAX_UPLOAD_SIZE) {
            safeUnlink(f.path);
            return res.status(400).json({ success: false, message: '附件大小不能超过10MB' });
        }
    }

    /* 构造邮件 */
    var now       = new Date();
    var timeStr   = now.toLocaleString('zh-CN', { hour12: false });
    var attachmentRows = files.map(function (f) {
        return '<li>' + escHtml(f.originalname) + '（' + Math.round((f.size || 0) / 1024) + 'KB）</li>';
    }).join('');
    var attachments = files.map(function (f) {
        return {
            filename: f.originalname,
            path: f.path,
            contentType: f.mimetype || undefined
        };
    });
    var receiver = process.env.CONTACT_RECEIVER || process.env.EMAIL_USER;
    var mailOpts  = {
        from   : '"法绎系统通知" <' + process.env.EMAIL_USER + '>',
        to     : receiver,
        subject: '【法绎系统】用户反馈通知',
        attachments: attachments,
        html   : [
            '<div style="font-family:\'PingFang SC\',Arial,sans-serif;max-width:680px;',
            'margin:0 auto;background:#f8f9ff;border-radius:14px;overflow:hidden;',
            'border:1px solid #e0e3ff;">',

            /* 顶部色条 */
            '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);',
            'padding:20px 28px;">',
            '<h2 style="color:#fff;margin:0;font-size:18px;">',
            '📩 收到新的用户反馈</h2>',
            '<p style="color:rgba(255,255,255,.7);margin:4px 0 0;font-size:13px;">',
            timeStr, '</p></div>',

            /* 信息表格 */
            '<div style="padding:24px 28px;">',
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">',
            '<tr><td style="padding:10px 0 10px 0;color:#6b7280;width:80px;',
            'vertical-align:top;">反馈时间</td>',
            '<td style="padding:10px 0;color:#1f2937;font-weight:600;">',
            escHtml(timeStr), '</td></tr>',
            '<tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">',
            '用户联系方式</td>',
            '<td style="padding:10px 0;color:#1f2937;">',
            '<a href="mailto:', escHtml(email), '" style="color:#4f46e5;">',
            escHtml(contact || email), '</a></td></tr>',
            '<tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">',
            '问题类型</td>',
            '<td style="padding:10px 0;color:#1f2937;">', escHtml(identity), '</td></tr>',
            '<tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">',
            '用户账号</td>',
            '<td style="padding:10px 0;color:#1f2937;">', escHtml(userEmail || '未提供'), '</td></tr>',
            '</table>',

            /* 咨询内容 */
            '<div style="margin-top:8px;">',
            '<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">反馈内容：</p>',
            '<div style="background:#fff;padding:16px;border-radius:10px;',
            'border:1px solid #e5e7eb;color:#1f2937;line-height:1.8;',
            'white-space:pre-wrap;font-size:14px;">',
            escHtml(message), '</div></div>',
            '<div style="margin-top:14px;">',
            '<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">附件：</p>',
            (files.length
              ? '<ul style="margin:0;padding-left:18px;color:#1f2937;">' + attachmentRows + '</ul>'
              : '<p style="margin:0;color:#9ca3af;">无</p>'),
            '<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">',
            files.length ? '（已附带真实文件附件，可直接下载查看）' : '（未上传附件）',
            '</p></div>',

            /* 提示 */
            '<p style="color:#9ca3af;font-size:12px;margin:20px 0 0;',
            'border-top:1px solid #e5e7eb;padding-top:16px;">',
            '此邮件由法绎系统自动发送，请在处理后回访用户。</p>',
            '</div></div>'
        ].join('')
    };

    try {
        var info = await transporter.sendMail(mailOpts);
        console.log('[contact] ✅ 邮件发送成功 messageId:', info.messageId);
        appendFeedbackLog({
            uploadTime: new Date().toISOString(),
            fileNames: files.map(function (f) { return f.originalname; }),
            fileSizes: files.map(function (f) { return f.size; }),
            userId: userEmail || email,
            contact: contact || email,
            identity: identity,
            status: 'sent',
            messageId: info.messageId
        });
        res.json({ success: true, message: '反馈已提交，附件已发送成功。' });
    } catch (err) {
        console.error('[contact] ❌ 邮件发送失败:', err.message);
        appendFeedbackLog({
            uploadTime: new Date().toISOString(),
            fileNames: files.map(function (f) { return f.originalname; }),
            fileSizes: files.map(function (f) { return f.size; }),
            userId: userEmail || email,
            contact: contact || email,
            identity: identity,
            status: 'failed',
            error: err.message
        });
        res.status(500).json({ success: false, message: '附件发送失败，请稍后重试。' });
    } finally {
        files.forEach(function (f) { safeUnlink(f.path); });
    }
});

app.use(function (err, req, res, next) {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: '附件大小不能超过10MB' });
        }
        return res.status(400).json({ success: false, message: '附件上传失败：' + err.message });
    }
    if (/附件类型不支持|MIME/.test(err.message || '')) {
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error('[contact] 附件处理中间件异常:', err.message);
    res.status(500).json({ success: false, message: '附件发送失败，请稍后重试。' });
});

/* ─── 健康检查 ─── */
app.get('/api/contact/health', function (req, res) {
    res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, function () {
    console.log('');
    console.log('  ✅ 法绎联系服务已启动');
    console.log('  📮 接口: http://localhost:' + PORT + '/api/contact');
    console.log('  📬 收件箱:', process.env.EMAIL_USER || '（未配置 .env）');
    console.log('');
    if (!process.env.EMAIL_PASS || process.env.EMAIL_PASS === '请填入QQ邮箱授权码') {
        console.warn('  ⚠️  警告: EMAIL_PASS 未配置！请编辑 server/.env 文件填入 QQ 授权码');
    }
});
