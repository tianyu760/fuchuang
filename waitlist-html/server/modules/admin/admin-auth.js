const store = require('./admin-store');
const crypto = require('crypto');

const adminTokens = new Map();

function issueToken(admin) {
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, { id: admin.id, email: admin.email, role: admin.role, name: admin.name });
  return token;
}

function login(email, password) {
  const admins = store.readJson(store.FILES.admins, []);
  const admin = admins.find(function (a) { return a.email === email; });
  if (!admin || admin.password !== store.hashPwd(password)) return null;
  return { admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role }, token: issueToken(admin) };
}

function loginPlatformUser(user) {
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'platform_admin',
    userType: 'admin'
  });
  return token;
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
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const session = adminTokens.get(token);
  if (!session) {
    return res.status(401).json({ success: false, message: '管理员未登录或会话已过期' });
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
  FIXED_ADMIN_CODE
};
