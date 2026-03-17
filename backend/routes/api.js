const { parseBody, sendJson } = require("../lib/http");
const { requireAuth, safeUser, requirePermission } = require("../lib/auth");

function createApiRouter({ repository, service }) {
  async function resolveUser(request, response) {
    const auth = request.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!token) {
      sendJson(response, 401, { error: "Unauthorized" });
      return null;
    }

    if (typeof repository.findUserByToken === "function") {
      const user = await repository.findUserByToken(token);
      if (!user) {
        sendJson(response, 401, { error: "Unauthorized" });
        return null;
      }
      return user;
    }

    const db = await repository.read();
    return requireAuth(request, response, db);
  }

  function respondError(response, error) {
    const message = error.message || "Server error";
    const status =
      message === "Unauthorized" ? 401
      : message === "Forbidden" ? 403
      : message.includes("not found") || message.includes("Not found") ? 404
      : message.includes("exists") || message.includes("required") || message.includes("Invalid") ? 400
      : 500;
    sendJson(response, status, { error: message });
  }

  return async function routeApi(request, response, url) {
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const result = typeof repository.health === "function"
          ? await repository.health()
          : { ok: true, provider: repository.provider || "unknown" };
        sendJson(response, 200, {
          status: "ok",
          ...result,
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await parseBody(request);
        sendJson(response, 200, await service.login(body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        const auth = request.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        sendJson(response, 200, await service.logout(token));
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/me") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, { user: safeUser(user) });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/public/applications") {
        const body = await parseBody(request);
        sendJson(response, 201, await service.createPublicApplication(body));
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.bootstrap(user));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/public/applications/") && url.pathname.endsWith("/approve")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "reviewApplications")) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.decideApplication(user, url.pathname.split("/")[4], "approved", body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/public/applications/") && url.pathname.endsWith("/reject")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "reviewApplications")) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.decideApplication(user, url.pathname.split("/")[4], "rejected", body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/candidates") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createCandidate(user, body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/candidates/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updateCandidate(user, url.pathname.split("/").pop(), body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/offers") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageOffers")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createOffer(user, body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/offers/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageOffers")) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updateOffer(user, url.pathname.split("/").pop(), body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageTasks")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createTask(user, body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updateTask(user, url.pathname.split("/").pop(), body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/trainings") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageTrainings")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createTraining(user, body));
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/trainings/") && url.pathname.endsWith("/complete")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.completeTraining(user, url.pathname.split("/")[3]));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/users") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageUsers")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createUser(user, body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageUsers")) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updateUser(user, url.pathname.split("/").pop(), body));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/posts") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createPost(user, body));
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/chats/") && url.pathname.endsWith("/messages")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createChatMessage(user, url.pathname.split("/")[3], body));
        return true;
      }

      return false;
    } catch (error) {
      respondError(response, error);
      return true;
    }
  };
}

module.exports = {
  createApiRouter,
};
