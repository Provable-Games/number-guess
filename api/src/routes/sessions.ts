import { Hono } from "hono";
import { db } from "../db/client.js";
import { gameSessions, guesses } from "../db/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";

const app = new Hono();

// GET /sessions - List game sessions
app.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);
  const offset = parseInt(c.req.query("offset") ?? "0");
  const tokenId = c.req.query("token_id");
  const status = c.req.query("status");
  const settingsId = c.req.query("settings_id");

  const conditions = [];
  if (tokenId) conditions.push(eq(gameSessions.tokenId, tokenId));
  if (status) conditions.push(eq(gameSessions.status, status));
  if (settingsId) conditions.push(eq(gameSessions.settingsId, parseInt(settingsId)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(gameSessions)
      .where(where)
      .orderBy(desc(gameSessions.blockTimestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameSessions)
      .where(where),
  ]);

  return c.json({
    data: results,
    pagination: {
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    },
  });
});

// GET /sessions/:id - Session detail with guesses
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const session = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, id))
    .limit(1);

  if (session.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  const sessionGuesses = await db
    .select()
    .from(guesses)
    .where(eq(guesses.tokenId, session[0].tokenId))
    .orderBy(guesses.guessNumber);

  return c.json({
    ...session[0],
    guesses: sessionGuesses,
  });
});

// GET /sessions/:id/guesses - Guess history for a session
app.get("/:id/guesses", async (c) => {
  const id = c.req.param("id");

  const session = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, id))
    .limit(1);

  if (session.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  const sessionGuesses = await db
    .select()
    .from(guesses)
    .where(eq(guesses.tokenId, session[0].tokenId))
    .orderBy(guesses.guessNumber);

  return c.json({ data: sessionGuesses });
});

export default app;
