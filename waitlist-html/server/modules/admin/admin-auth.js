const store = require('./admin-store');
const crypto = require('crypto');

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'fayi_admin_session_dev_2026';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str) {
  var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function sessionFromAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    name: admin.name,
    identityCode: admin.identityCode,
    adminLevel: admin.adminLevel || (admin.role === 'super_admin' ? 'super' : 'standard'),
    userType: admin.userType
  };
}

function signSession(session) {
  var payload = Object.assign({}, session, { exp: Date.now() + TOKEN_TTL_MS });
  var body = b64urlEncode(JSON.stringify(payload));
  var sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return body + '.' + sig;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  var body = parts[0];
  var sig = parts[1];
  var expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  var sigBuf = Buffer.from(sig);
  var expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    var data = JSON.parse(b64urlDecode(body).toString('utf8'));
    if (!data || !data.exp || data.exp < Date.now()) return null;
    var session = Object.assign({}, data);
    delete session.exp;
    return session;
  } catch (e) {
    return null;
  }
}

function issueToken(admin) {
  return signSession(sessionFromAdmin(admin));
}

function login(email, password) {
  const admins = store.readJson(store.FILES.admins, []);
  const admin = admins.find(function (a) { return a.email === email; });
  if (!admin || admin.password !== store.hashPwd(password)) return null;
  return { admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role }, token: issueToken(admin) };
}

function loginPlatformUser(user) {
  return issueToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'platform_admin',
    userType: 'admin',
    identityCode: user.identityCode
  });
}

const FIXED_ADMIN_CODE = 'manager';

/** 仅凭身份验证码进入（演示/运营门禁） */
function loginByCode(identityCode) {
  if (String(identityCode) !== FIXED_ADMIN_CODE) {
    return null;
  }
  const admins = store.readJson(store.FILES.admins, []);
  const base = admins[0] || {
    id: 'sys_admin',
    email: 'admin@fayi.local',
    name: '系统管理员',
    role: 'super_admin'
  };
  const admin = {
    id: base.id,
    email: base.email,
    name: base.name,
    nickname: base.name,
    role: base.role || 'super_admin',
    userType: 'admin',
    identityCode: FIXED_ADMIN_CODE
  };
  const token = issueToken(admin);
  return { admin, token };
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  let token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token && req.query && req.query.access_token) {
    token = String(req.query.access_token).trim();
  }
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({
      code: 401,
      message: '管理员未登录或会话已过期',
      data: null,
      success: false
    });
  }
  req.admin = session;
  next();
}

module.exports = {
  login,
  loginPlatformUser,
  loginByCode,
  requireAdmin,
  issueToken,
  verifySessionToken,
  FIXED_ADMIN_CODE
};
