function createRealtimeHub() {
  const clients = new Map();

  function subscribe(user, response) {
    const clientId = `${user.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    clients.set(clientId, { userId: user.id, response });

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ ok: true, userId: user.id })}\n\n`);

    const heartbeat = setInterval(() => {
      response.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    };

    response.on("close", cleanup);
    response.on("finish", cleanup);
    response.on("error", cleanup);
  }

  function publish(event = {}) {
    const payload = JSON.stringify({
      type: event.type || "workspace:refresh",
      scope: event.scope || "workspace",
      message: event.message || "",
      entityType: event.entityType || null,
      entityId: event.entityId || null,
      view: event.view || null,
      ts: new Date().toISOString(),
    });
    const targetUserIds = Array.isArray(event.targetUserIds) ? new Set(event.targetUserIds) : null;

    clients.forEach((client) => {
      if (targetUserIds && !targetUserIds.has(client.userId)) return;
      client.response.write(`event: update\ndata: ${payload}\n\n`);
    });
  }

  function close() {
    clients.forEach((client) => client.response.end());
    clients.clear();
  }

  return {
    subscribe,
    publish,
    close,
  };
}

module.exports = {
  createRealtimeHub,
};
