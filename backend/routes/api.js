const { parseBody, sendJson } = require("../lib/http");
const { requireAuth, safeUser, requirePermission } = require("../lib/auth");

function createApiRouter({ repository, service, realtime }) {
  async function resolveUser(request, response) {
    const auth = request.headers.authorization || "";
    const queryToken = new URL(request.url, `http://${request.headers.host}`).searchParams.get("token") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : queryToken;
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
        const result = await service.createPublicApplication(body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "application:create",
          scope: "management",
          message: `Новая заявка: ${result.application?.name || body.name || "кандидат"}`,
          entityType: "application",
          entityId: result.application?.id || null,
          view: "management",
        });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.bootstrap(user));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/notifications/") && url.pathname.endsWith("/read")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.markNotificationRead(user, url.pathname.split("/")[3]));
        realtime.publish({ type: "notification:read", scope: "notifications", targetUserIds: [user.id] });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/notifications/read-all") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.markAllNotificationsRead(user));
        realtime.publish({ type: "notification:read_all", scope: "notifications", targetUserIds: [user.id] });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/events") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        realtime.subscribe(user, response);
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/uploads") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.uploadAsset(user, body));
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/public/applications/") && url.pathname.endsWith("/approve")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "reviewApplications")) return true;
        const body = await parseBody(request);
        const result = await service.decideApplication(user, url.pathname.split("/")[4], "approved", body);
        sendJson(response, 200, result);
        realtime.publish({
          type: "application:approved",
          scope: "management",
          message: `Заявка одобрена: ${result.application?.name || "кандидат"}`,
          entityType: "application",
          entityId: result.application?.id || null,
          view: "management",
        });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/public/applications/") && url.pathname.endsWith("/reject")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "reviewApplications")) return true;
        const body = await parseBody(request);
        const result = await service.decideApplication(user, url.pathname.split("/")[4], "rejected", body);
        sendJson(response, 200, result);
        realtime.publish({
          type: "application:rejected",
          scope: "management",
          message: `Заявка отклонена: ${result.application?.name || "кандидат"}`,
          entityType: "application",
          entityId: result.application?.id || null,
          view: "management",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/candidates") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.createCandidate(user, body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "candidate:create",
          scope: "workspace",
          message: `Новый кандидат: ${result.candidate?.name || body.name || "без имени"}`,
          entityType: "candidate",
          entityId: result.candidate?.id || null,
          view: "candidates",
        });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/candidates/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.updateCandidate(user, url.pathname.split("/").pop(), body);
        sendJson(response, 200, result);
        realtime.publish({
          type: "candidate:update",
          scope: "workspace",
          message: `Кандидат обновлен: ${result.candidate?.name || "карточка"}`,
          entityType: "candidate",
          entityId: result.candidate?.id || null,
          view: "candidates",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/candidates/") && url.pathname.endsWith("/documents")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.addCandidateDocument(user, url.pathname.split("/")[3], body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "candidate:document:create",
          scope: "workspace",
          message: `Документ добавлен: ${result.document?.title || "файл"}`,
          entityType: "candidate",
          entityId: result.candidate?.id || url.pathname.split("/")[3],
          view: "candidates",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/candidates/") && url.pathname.endsWith("/comments")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.addCandidateComment(user, url.pathname.split("/")[3], body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "candidate:comment",
          scope: "workspace",
          message: `Новый комментарий по кандидату ${result.candidate?.name || ""}`.trim(),
          entityType: "candidate",
          entityId: result.candidate?.id || url.pathname.split("/")[3],
          view: "candidates",
        });
        return true;
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/candidates/") && url.pathname.includes("/documents/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const parts = url.pathname.split("/");
        const result = await service.removeCandidateDocument(user, parts[3], parts[5]);
        sendJson(response, 200, result);
        realtime.publish({
          type: "candidate:document:delete",
          scope: "workspace",
          message: "Документ кандидата удален",
          entityType: "candidate",
          entityId: parts[3],
          view: "candidates",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/offers") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageOffers")) return true;
        const body = await parseBody(request);
        const result = await service.createOffer(user, body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "offer:create",
          scope: "workspace",
          message: `Новый оффер: ${result.offer?.title || body.title || "без названия"}`,
          entityType: "offer",
          entityId: result.offer?.id || null,
          view: "offers",
        });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/offers/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageOffers")) return true;
        const body = await parseBody(request);
        const result = await service.updateOffer(user, url.pathname.split("/").pop(), body);
        sendJson(response, 200, result);
        realtime.publish({
          type: "offer:update",
          scope: "workspace",
          message: `Оффер обновлен: ${result.offer?.title || "карточка"}`,
          entityType: "offer",
          entityId: result.offer?.id || url.pathname.split("/").pop(),
          view: "offers",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageTasks")) return true;
        const body = await parseBody(request);
        const result = await service.createTask(user, body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "task:create",
          scope: "workspace",
          message: `Новая задача: ${result.task?.title || body.title || "без названия"}`,
          entityType: "task",
          entityId: result.task?.id || null,
          view: "tasks",
        });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.updateTask(user, url.pathname.split("/").pop(), body);
        sendJson(response, 200, result);
        realtime.publish({
          type: "task:update",
          scope: "workspace",
          message: `Задача обновлена: ${result.task?.title || "карточка"}`,
          entityType: "task",
          entityId: result.task?.id || url.pathname.split("/").pop(),
          view: "tasks",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/trainings") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageTrainings")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createTraining(user, body));
        realtime.publish({ type: "training:create", scope: "workspace" });
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/trainings/") && url.pathname.endsWith("/complete")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        sendJson(response, 200, await service.completeTraining(user, url.pathname.split("/")[3]));
        realtime.publish({ type: "training:complete", scope: "workspace" });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/users") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageUsers")) return true;
        const body = await parseBody(request);
        sendJson(response, 201, await service.createUser(user, body));
        realtime.publish({ type: "user:create", scope: "management" });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        if (!requirePermission(response, safeUser(user), "manageUsers")) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updateUser(user, url.pathname.split("/").pop(), body));
        realtime.publish({ type: "user:update", scope: "management" });
        return true;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/payouts/")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updatePayout(user, url.pathname.split("/").pop(), body));
        realtime.publish({ type: "payout:update", scope: "finance" });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/payouts/batch") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        sendJson(response, 200, await service.updatePayoutBatch(user, body));
        realtime.publish({ type: "payout:batch", scope: "finance" });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/posts") {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.createPost(user, body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "post:create",
          scope: "social",
          message: `Новый пост: ${result.post?.title || body.title || "без названия"}`,
          entityType: "post",
          entityId: result.post?.id || null,
          view: "social",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/posts/") && url.pathname.endsWith("/comments")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.addPostComment(user, url.pathname.split("/")[3], body);
        sendJson(response, 201, result);
        realtime.publish({
          type: "post:comment",
          scope: "social",
          message: "Новый комментарий в соцпространстве",
          entityType: "post",
          entityId: url.pathname.split("/")[3],
          view: "social",
        });
        return true;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/chats/") && url.pathname.endsWith("/messages")) {
        const user = await resolveUser(request, response);
        if (!user) return true;
        const body = await parseBody(request);
        const result = await service.createChatMessage(user, url.pathname.split("/")[3], body);
        sendJson(response, 201, result);
        realtime.publish({ type: "chat:message", scope: "teams" });
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
