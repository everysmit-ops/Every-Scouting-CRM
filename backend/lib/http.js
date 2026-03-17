const fs = require("fs");
const path = require("path");
const { MIME_TYPES, FRONTEND_ROOT, UPLOADS_ROOT } = require("./config");

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  });
  response.end(JSON.stringify(data, null, 2));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveStatic(urlPath, response) {
  const isUpload = urlPath.startsWith("/uploads/");
  const baseRoot = isUpload ? UPLOADS_ROOT : FRONTEND_ROOT;
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const relativePath = isUpload ? requestedPath.replace("/uploads", "") : requestedPath;
  const filePath = path.join(baseRoot, relativePath);

  if (!filePath.startsWith(baseRoot)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    response.writeHead(200, { "Content-Type": mime });
    response.end(content);
  });
}

module.exports = {
  sendJson,
  parseBody,
  serveStatic,
};
