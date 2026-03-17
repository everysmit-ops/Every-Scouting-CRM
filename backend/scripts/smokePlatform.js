const http = require("http");

function requestJson({ method = "GET", path = "/", body = null, token = "" }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: 4173,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (response.statusCode >= 400) {
              reject(new Error(parsed.error || `Request failed: ${response.statusCode}`));
              return;
            }
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function main() {
  const login = await requestJson({
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner@scoutflow.local", password: "demo123" },
  });
  const bootstrap = await requestJson({
    method: "GET",
    path: "/api/bootstrap",
    token: login.token,
  });

  if (!bootstrap.user || !bootstrap.summary || !bootstrap.candidates || !bootstrap.offers) {
    throw new Error("Smoke failed: bootstrap payload is incomplete");
  }

  console.log("Smoke OK");
  console.log(`User: ${bootstrap.user.email}`);
  console.log(`Candidates: ${bootstrap.summary.candidates}`);
  console.log(`Offers: ${bootstrap.summary.offers}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
