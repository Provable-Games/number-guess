import type { WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import pg from "pg";
import { pool } from "../db/client.js";

interface Subscription {
  channels: Set<string>;
}

const VALID_CHANNELS = new Set([
  "new_game",
  "guess",
  "game_won",
  "game_lost",
]);

const clients = new Map<WSContext, Subscription>();
let pgClient: pg.PoolClient | null = null;
let initialized = false;

async function initPgListener() {
  if (initialized) return;
  initialized = true;

  try {
    pgClient = await pool.connect();
    for (const channel of VALID_CHANNELS) {
      await pgClient.query(`LISTEN ${channel}`);
    }

    pgClient.on("notification", (msg: pg.Notification) => {
      if (!msg.channel || !msg.payload) return;
      const payload = JSON.parse(msg.payload);
      broadcast(msg.channel, payload);
    });

    pgClient.on("error", () => {
      pgClient = null;
      initialized = false;
    });
  } catch {
    pgClient = null;
    initialized = false;
  }
}

function broadcast(channel: string, payload: unknown) {
  const message = JSON.stringify({
    channel,
    data: payload,
    _timing: { serverTs: Date.now() },
  });

  for (const [ws, sub] of clients) {
    if (!sub.channels.has(channel)) continue;

    try {
      ws.send(message);
    } catch {
      clients.delete(ws);
    }
  }
}

export function createWSEvents(): WSEvents {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      initPgListener();
      clients.set(ws, { channels: new Set() });
    },

    onMessage(evt: MessageEvent<WSMessageReceive>, ws: WSContext) {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type: string;
          channels?: string[];
        };

        const sub = clients.get(ws);
        if (!sub) return;

        if (msg.type === "subscribe" && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            if (VALID_CHANNELS.has(ch)) sub.channels.add(ch);
          }
          ws.send(JSON.stringify({ type: "subscribed", channels: [...sub.channels] }));
        }

        if (msg.type === "unsubscribe" && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            sub.channels.delete(ch);
          }
          ws.send(JSON.stringify({ type: "unsubscribed", channels: [...sub.channels] }));
        }
      } catch (e) {
        console.error("[WebSocket] Error processing message:", e);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      clients.delete(ws);
    },
  };
}
