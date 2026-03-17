const crypto = require("crypto");
const { ROLE_LABELS, PERMISSIONS } = require("./config");
const { writeDb } = require("../data/store");
const { sendJson } = require("./http");

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString("hex")}`;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function normalizeDb(db) {
  let changed = false;

  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.users = Array.isArray(db.users) ? db.users : [];

  db.users = db.users.map((user) => {
    if (user.password) {
      const passwordSalt = crypto.randomBytes(16).toString("hex");
      const passwordHash = hashPassword(user.password, passwordSalt);
      changed = true;
      return {
        ...user,
        passwordSalt,
        passwordHash,
        passwordUpdatedAt: nowIso(),
        password: undefined,
      };
    }
    return user;
  });

  if (changed) {
    db.users = db.users.map((user) => {
      const clone = { ...user };
      delete clone.password;
      return clone;
    });
    writeDb(db);
  }
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, passwordUpdatedAt, ...rest } = user;
  return {
    ...rest,
    roleLabel: ROLE_LABELS[user.role],
    permissions: PERMISSIONS[user.role] || PERMISSIONS.scout,
  };
}

function getUserFromRequest(request, db) {
  const auth = request.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function requireAuth(request, response, db) {
  const user = getUserFromRequest(request, db);
  if (!user) {
    sendJson(response, 401, { error: "Unauthorized" });
    return null;
  }
  return user;
}

function requirePermission(response, user, permission) {
  if (!user.permissions[permission]) {
    sendJson(response, 403, { error: "Forbidden" });
    return false;
  }
  return true;
}

module.exports = {
  nowIso,
  newId,
  hashPassword,
  normalizeDb,
  safeUser,
  getUserFromRequest,
  requireAuth,
  requirePermission,
};
