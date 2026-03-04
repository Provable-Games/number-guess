import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  index,
  uniqueIndex,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Game Sessions table - tracks each game instance
 */
export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: numeric("token_id").notNull(),
    settingsId: integer("settings_id").notNull(),
    rangeMin: integer("range_min").notNull(),
    rangeMax: integer("range_max").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    status: text("status").notNull().default("playing"), // playing, won, lost
    guessCount: integer("guess_count").notNull().default(0),
    score: bigint("score", { mode: "bigint" }),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTimestamp: timestamp("block_timestamp").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    lastUpdatedBlock: bigint("last_updated_block", { mode: "bigint" }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  },
  (table) => [
    index("game_sessions_token_idx").on(table.tokenId),
    index("game_sessions_status_idx").on(table.status),
    index("game_sessions_settings_idx").on(table.settingsId),
    index("game_sessions_token_status_idx").on(table.tokenId, table.status),
    // Unique constraint: one active session per token (latest block)
    uniqueIndex("game_sessions_token_block_tx_idx").on(
      table.tokenId,
      table.blockNumber,
      table.transactionHash
    ),
  ]
);

/**
 * Guesses table - individual guess records
 */
export const guesses = pgTable(
  "guesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: numeric("token_id").notNull(),
    player: text("player"),
    guessValue: integer("guess_value").notNull(),
    result: text("result").notNull(), // correct, too_low, too_high
    guessNumber: integer("guess_number").notNull(),
    rangeMinAfter: integer("range_min_after").notNull(),
    rangeMaxAfter: integer("range_max_after").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTimestamp: timestamp("block_timestamp").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => [
    uniqueIndex("guesses_block_tx_event_idx").on(
      table.blockNumber,
      table.transactionHash,
      table.eventIndex
    ),
    index("guesses_token_idx").on(table.tokenId),
    index("guesses_token_guess_num_idx").on(table.tokenId, table.guessNumber),
  ]
);

/**
 * Game Stats table - aggregated statistics
 */
export const gameStats = pgTable(
  "game_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    totalSessions: integer("total_sessions").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    avgGuesses: numeric("avg_guesses"),
    perfectGames: integer("perfect_games").notNull().default(0),
    lastUpdated: timestamp("last_updated").defaultNow(),
  }
);

export const schema = {
  gameSessions,
  guesses,
  gameStats,
};
