const fs = require("fs");
const { DB_PATH } = require("../lib/config");

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  readDb,
  writeDb,
};
