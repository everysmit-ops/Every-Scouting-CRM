const { DB_PROVIDER } = require("../lib/config");
const { createFileRepository } = require("./fileRepository");
const { createPostgresRepository } = require("./postgresRepository");

function createRepository() {
  if (DB_PROVIDER === "postgres") {
    return createPostgresRepository();
  }

  return createFileRepository();
}

module.exports = {
  createRepository,
};
