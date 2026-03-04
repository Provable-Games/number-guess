import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";

import { healthCheck, shutdown } from "./db/client.js";
import { rateLimit, cleanupTimer } from "./middleware/rateLimit.js";
import { createWSEvents } from "./ws/subscriptions.js";

import sessionsRouter from "./routes/sessions.js";
import leaderboardRouter from "./routes/leaderboard.js";
import statsRouter from "./routes/stats.js";
import playersRouter from "./routes/players.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use("*", cors());
app.use("/stats", rateLimit(30));
app.use("*", rateLimit(100));

// Health
app.get("/health", async (c) => {
  const dbOk = await healthCheck();
  return c.json({ status: dbOk ? "ok" : "degraded", db: dbOk }, dbOk ? 200 : 503);
});

// Routes
app.route("/sessions", sessionsRouter);
app.route("/leaderboard", leaderboardRouter);
app.route("/stats", statsRouter);
app.route("/players", playersRouter);

// WebSocket
app.get("/ws", upgradeWebSocket(() => createWSEvents()));

// Server
const port = parseInt(process.env.PORT ?? "3002", 10);
const certPath = process.env.TLS_CERT ?? "localhost-cert.pem";
const keyPath = process.env.TLS_KEY ?? "localhost-key.pem";

let serverOptions: Parameters<typeof serve>[0] = { fetch: app.fetch, port };

try {
  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);
  serverOptions = { ...serverOptions, createServer, serverOptions: { cert, key } };
  console.log(`[Number Guess API] TLS certs loaded from ${certPath}`);
} catch {
  console.log(`[Number Guess API] TLS certs not found, falling back to HTTP`);
}

const server = serve(serverOptions, (info) => {
  const protocol = serverOptions.createServer ? "https" : "http";
  console.log(`[Number Guess API] Listening on ${protocol}://localhost:${info.port}`);
});

injectWebSocket(server);

// Graceful shutdown
function handleShutdown() {
  console.log("[Number Guess API] Shutting down...");
  clearInterval(cleanupTimer);
  server.close(async () => {
    await shutdown();
    process.exit(0);
  });
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
