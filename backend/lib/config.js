const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_ROOT = path.join(ROOT, "frontend");
const DB_PATH = path.join(ROOT, "backend", "data", "db.json");
const ENV_PATH = path.join(ROOT, ".env");
const UPLOADS_ROOT = path.join(ROOT, "backend", "uploads");

loadEnvFile(ENV_PATH);

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const DB_PROVIDER = process.env.DB_PROVIDER || "file";
const POSTGRES_URL = process.env.POSTGRES_URL || "";
const POSTGRES_SSL = process.env.POSTGRES_SSL || "false";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const ROLE_LABELS = {
  owner: "Главный админ",
  lead: "Тимлид",
  scout: "Скаут",
  referral: "Скаут (реферал)",
};

const PERMISSIONS = {
  owner: {
    manageOffers: true,
    manageTeams: true,
    manageTasks: true,
    manageTrainings: true,
    reviewApplications: true,
    manageUsers: true,
  },
  lead: {
    manageOffers: false,
    manageTeams: true,
    manageTasks: true,
    manageTrainings: true,
    reviewApplications: false,
    manageUsers: false,
  },
  scout: {
    manageOffers: false,
    manageTeams: false,
    manageTasks: false,
    manageTrainings: false,
    reviewApplications: false,
    manageUsers: false,
  },
  referral: {
    manageOffers: false,
    manageTeams: false,
    manageTasks: false,
    manageTrainings: false,
    reviewApplications: false,
    manageUsers: false,
  },
};

const PERMISSION_LABELS = {
  manageOffers: "Управление офферами",
  manageTeams: "Управление командами",
  manageTasks: "Управление задачами",
  manageTrainings: "Управление обучением",
  reviewApplications: "Обработка заявок",
  manageUsers: "Управление пользователями",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

module.exports = {
  ROOT,
  FRONTEND_ROOT,
  UPLOADS_ROOT,
  DB_PATH,
  ENV_PATH,
  PORT,
  HOST,
  DB_PROVIDER,
  POSTGRES_URL,
  POSTGRES_SSL,
  MIME_TYPES,
  ROLE_LABELS,
  PERMISSIONS,
  PERMISSION_LABELS,
};
