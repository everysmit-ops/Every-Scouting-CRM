const http = require("http");
const { HOST, PORT } = require("./lib/config");
const { sendJson, serveStatic } = require("./lib/http");
const { createRepository } = require("./repositories/repositoryFactory");
const { createPlatformService } = require("./services/platformService");
const { createApiRouter } = require("./routes/api");
const { createRealtimeHub } = require("./lib/realtime");

function createRequestHandler() {
  const repository = createRepository();
  const realtime = createRealtimeHub();
  const service = createPlatformService(repository);
  const routeApi = createApiRouter({ repository, service, realtime });

  return async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const handled = await routeApi(request, response, url);
    if (handled) return;

    try {
      serveStatic(url.pathname, response);
    } catch (error) {
      sendJson(response, 500, { error: "Server error", details: error.message });
    }
  };
}

function startServer() {
  const repository = createRepository();
  const realtime = createRealtimeHub();
  const service = createPlatformService(repository);
  const routeApi = createApiRouter({ repository, service, realtime });

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const handled = await routeApi(request, response, url);
    if (handled) return;

    try {
      serveStatic(url.pathname, response);
    } catch (error) {
      sendJson(response, 500, { error: "Server error", details: error.message });
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(`ScoutFlow HQ is running at http://${HOST}:${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      realtime.close();
      if (typeof repository.close === "function") {
        await repository.close();
      }
      process.exit(0);
    });
  }

  process.once("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });

  process.once("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });

  return server;
}

module.exports = {
  startServer,
  createRequestHandler,
};
