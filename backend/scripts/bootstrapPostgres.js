const path = require("path");
const { ROOT } = require("../lib/config");
const { runSqlFile, closePool } = require("../lib/postgres");
const { applyMigrations, shouldSeedDatabase } = require("../lib/migrations");

const SEED_PATH = path.join(ROOT, "backend", "data", "seed.postgres.sql");

async function main() {
  try {
    const migrations = await applyMigrations();
    console.log(`Migrations ready: ${migrations.total}, applied now: ${migrations.executed.length}`);
    const needsSeed = await shouldSeedDatabase();
    if (needsSeed) {
      await runSqlFile(SEED_PATH);
      console.log(`Seed applied from ${SEED_PATH}`);
    } else {
      console.log("Seed skipped: database already contains users.");
    }
  } finally {
    await closePool();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
