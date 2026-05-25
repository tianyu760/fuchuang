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

module.exports = { login, requireAdmin, issueToken };
