const { readDb, writeDb } = require("../data/store");
const { normalizeDb } = require("../lib/auth");
const { getBootstrap } = require("../lib/domain");

function createFileRepository() {
  return {
    provider: "file",

    async read() {
      const db = readDb();
      normalizeDb(db);
      return db;
    },

    async write(db) {
      writeDb(db);
      return db;
    },

    async transaction(mutator) {
      const db = await this.read();
      const result = await mutator(db);
      await this.write(db);
      return result;
    },

    async findUserByToken(token) {
      const db = await this.read();
      const session = db.sessions.find((item) => item.token === token);
      if (!session) return null;
      return db.users.find((user) => user.id === session.userId) || null;
    },

    async getBootstrapData(user) {
      const db = await this.read();
      return getBootstrap(db, user);
    },

    async syncPayouts(syncer) {
      return this.transaction(async (db) => {
        await syncer(db);
      });
    },

    async health() {
      return { ok: true, provider: "file" };
    },

    async close() {
      return undefined;
    },
  };
}

module.exports = {
  createFileRepository,
};
