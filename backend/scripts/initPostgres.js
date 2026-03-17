const path = require("path");
const { ROOT } = require("../lib/config");
const { runSqlFile, closePool } = require("../lib/postgres");

const SCHEMA_PATH = path.join(ROOT, "backend", "data", "schema.postgres.sql");
const SEED_PATH = path.join(ROOT, "backend", "data", "seed.postgres.sql");

async function main() {
  try {
    await runSqlFile(SCHEMA_PATH);
    console.log(`Schema applied from ${SCHEMA_PATH}`);
    await runSqlFile(SEED_PATH);
    console.log(`Seed applied from ${SEED_PATH}`);
  } finally {
    await closePool();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
