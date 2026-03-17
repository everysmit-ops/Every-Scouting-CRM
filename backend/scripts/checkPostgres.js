const { testConnection, closePool } = require("../lib/postgres");

async function main() {
  try {
    const result = await testConnection();
    console.log(`PostgreSQL connection OK: ${result.current_time}`);
  } finally {
    await closePool();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
