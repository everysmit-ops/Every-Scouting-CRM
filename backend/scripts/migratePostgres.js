const { applyMigrations } = require("../lib/migrations");
const { closePool } = require("../lib/postgres");

async function main() {
  try {
    const result = await applyMigrations();
    console.log(`Migrations applied: ${result.executed.length}/${result.total}`);
    if (result.executed.length) {
      result.executed.forEach((item) => console.log(`- ${item}`));
    } else {
      console.log("No pending migrations.");
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
