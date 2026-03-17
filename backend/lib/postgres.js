const fs = require("fs");
const { Pool } = require("pg");
const { POSTGRES_URL, POSTGRES_SSL } = require("./config");

let pool = null;

function getPool() {
  if (!POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not configured. Create .env from .env.example before using postgres scripts.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query("SELECT NOW() AS current_time");
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, "utf-8");
  const client = await getPool().connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testConnection,
  runSqlFile,
  closePool,
};
