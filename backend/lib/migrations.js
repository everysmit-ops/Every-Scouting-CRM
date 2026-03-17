const fs = require("fs");
const path = require("path");
const { getPool } = require("./postgres");
const { ROOT } = require("./config");

const MIGRATIONS_DIR = path.join(ROOT, "backend", "data", "migrations");

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(client) {
  await ensureMigrationsTable(client);
  const result = await client.query("SELECT version FROM schema_migrations ORDER BY version ASC");
  return new Set(result.rows.map((row) => row.version));
}

async function getMigrationStatus() {
  const client = await getPool().connect();
  try {
    const files = getMigrationFiles();
    const applied = await getAppliedVersions(client);
    return {
      files,
      applied: files.filter((file) => applied.has(file)),
      pending: files.filter((file) => !applied.has(file)),
    };
  } finally {
    client.release();
  }
}

async function applyMigrations() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await ensureMigrationsTable(client);
    const applied = await getAppliedVersions(client);
    const files = getMigrationFiles();
    const executed = [];

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      executed.push(file);
    }

    await client.query("COMMIT");
    return { executed, total: files.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function shouldSeedDatabase() {
  const client = await getPool().connect();
  try {
    const result = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (!result.rows[0]?.users_table) return true;
    const count = await client.query("SELECT COUNT(*)::int AS total FROM users");
    return Number(count.rows[0]?.total || 0) === 0;
  } finally {
    client.release();
  }
}

module.exports = {
  MIGRATIONS_DIR,
  getMigrationFiles,
  getMigrationStatus,
  applyMigrations,
  shouldSeedDatabase,
};
