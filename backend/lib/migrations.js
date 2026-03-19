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

async function hasLegacyInitialSchema(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.teams') AS teams_table,
      to_regclass('public.users') AS users_table,
      to_regclass('public.offers') AS offers_table,
      to_regclass('public.candidates') AS candidates_table
  `);
  const row = result.rows[0] || {};
  return Boolean(row.teams_table && row.users_table && row.offers_table && row.candidates_table);
}

async function baselineLegacyInitialSchema(client, applied) {
  const initialVersion = "001_initial_schema.sql";
  if (applied.has(initialVersion)) return false;
  if (applied.size > 0) return false;
  const legacySchemaExists = await hasLegacyInitialSchema(client);
  if (!legacySchemaExists) return false;
  await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", [initialVersion]);
  applied.add(initialVersion);
  return true;
}

async function getMigrationStatus() {
  const client = await getPool().connect();
  try {
    const files = getMigrationFiles();
    const applied = await getAppliedVersions(client);
    await baselineLegacyInitialSchema(client, applied);
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
    await baselineLegacyInitialSchema(client, applied);
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
