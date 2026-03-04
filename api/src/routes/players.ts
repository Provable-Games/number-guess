import { Hono } from "hono";
import { db } from "../db/client.js";
import { gameSessions } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

const app = new Hono();

// GET /players/:address - Player game history
// Note: Since we don't have token->owner mapping in this DB,
// we query by tokenId. The client can resolve ownership from denshokan API.
app.get("/:tokenId", async (c) => {
  const tokenId = c.req.param("tokenId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);
  const offset = parseInt(c.req.query("offset") ?? "0");

  const sessions = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.tokenId, tokenId))
    .orderBy(desc(gameSessions.blockTimestamp))
    .limit(limit)
    .offset(offset);

  // Compute player stats
  const statsResult = await db.execute(
    sql`SELECT
      COUNT(*) as total_games,
      COUNT(*) FILTER (WHERE status = 'won') as wins,
      COUNT(*) FILTER (WHERE status = 'lost') as losses,
      COUNT(*) FILTER (WHERE status = 'playing') as active,
      AVG(guess_count) FILTER (WHERE status = 'won') as avg_guesses,
      MIN(guess_count) FILTER (WHERE status = 'won') as best_guess_count
    FROM game_sessions WHERE token_id = ${tokenId}`
  );

  const stats = statsResult.rows?.[0] ?? {};

  return c.json({
    tokenId,
    stats,
    sessions,
  });
});

export default app;
