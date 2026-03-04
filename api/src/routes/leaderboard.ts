import { Hono } from "hono";
import { db } from "../db/client.js";
import { gameSessions } from "../db/schema.js";
import { eq, desc, sql, and } from "drizzle-orm";

const app = new Hono();

// GET /leaderboard - Rankings by score
app.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);
  const offset = parseInt(c.req.query("offset") ?? "0");
  const sortBy = c.req.query("sort") ?? "score"; // score, guess_count

  let orderColumn;
  switch (sortBy) {
    case "guess_count":
      orderColumn = gameSessions.guessCount;
      break;
    default:
      orderColumn = gameSessions.score;
  }

  const results = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.status, "won"))
    .orderBy(desc(orderColumn))
    .limit(limit)
    .offset(offset);

  return c.json({ data: results, pagination: { limit, offset } });
});

export default app;
