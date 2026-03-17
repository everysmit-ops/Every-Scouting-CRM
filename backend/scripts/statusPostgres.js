const { getMigrationStatus } = require("../lib/migrations");
const { closePool } = require("../lib/postgres");

async function main() {
  try {
    const status = await getMigrationStatus();
    console.log(`Applied: ${status.applied.length}`);
    status.applied.forEach((item) => console.log(`- ${item}`));
    console.log(`Pending: ${status.pending.length}`);
    status.pending.forEach((item) => console.log(`- ${item}`));
  } finally {
    await closePool();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
