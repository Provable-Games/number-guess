import { Hono } from "hono";
import { db } from "../db/client.js";
import { gameStats, gameSessions } from "../db/schema.js";
import { sql } from "drizzle-orm";

const app = new Hono();

// GET /stats - Aggregate game stats
app.get("/", async (c) => {
  const stats = await db.select().from(gameStats).limit(1);

  if (stats.length === 0) {
    return c.json({
      totalSessions: 0,
      wins: 0,
      losses: 0,
      avgGuesses: null,
      perfectGames: 0,
    });
  }

  // Compute average guesses from won sessions
  const avgResult = await db.execute(
    sql`SELECT AVG(guess_count)::numeric(10,2) as avg_guesses FROM game_sessions WHERE status = 'won'`
  );

  return c.json({
    ...stats[0],
    avgGuesses: avgResult.rows?.[0]
      ? (avgResult.rows[0] as { avg_guesses: string }).avg_guesses
      : null,
  });
});

export default app;
