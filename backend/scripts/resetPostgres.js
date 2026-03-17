const { getPool, closePool } = require("../lib/postgres");

const TABLES = [
  "sessions",
  "notification_users",
  "notifications",
  "chat_participants",
  "chat_messages",
  "chats",
  "training_assignments",
  "trainings",
  "tasks",
  "offer_assignments",
  "candidates",
  "offers",
  "team_members",
  "audit_log",
  "public_applications",
  "users",
  "teams",
];

async function main() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const table of TABLES) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await client.query("COMMIT");
    console.log("PostgreSQL schema reset completed.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
