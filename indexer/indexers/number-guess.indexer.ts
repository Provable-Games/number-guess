/**
 * Number Guess Indexer
 *
 * Indexes NumberGuess contract events and persists them to PostgreSQL.
 * Uses the Apibara SDK with Drizzle ORM for storage.
 *
 * Events indexed:
 * - NewGameStarted: New game session created for a token
 * - GuessMade: A guess attempt with result (correct, too_low, too_high)
 *
 * Architecture Notes:
 * - Uses high-level defineIndexer API for simplicity
 * - Token IDs are felt252 (not u256) with packed immutable data
 * - Idempotent writes for safe re-indexing
 * - Game session status tracked: playing -> won/lost
 * - Aggregated stats maintained in game_stats table
 */

import { defineIndexer } from "apibara/indexer";
import { useLogger } from "apibara/plugins";
import { StarknetStream } from "@apibara/starknet";
import {
  drizzle,
  drizzleStorage,
  useDrizzleStorage,
} from "@apibara/plugin-drizzle";
import { sql } from "drizzle-orm";
import type { ApibaraRuntimeConfig } from "apibara/types";

import * as schema from "../src/lib/schema.js";
import {
  EVENT_SELECTORS,
  decodeNewGameStarted,
  decodeGuessMade,
  feltToHex,
  stringifyWithBigInt,
  resultToString,
} from "../src/lib/decoder.js";

interface NumberGuessConfig {
  contractAddress: string;
  streamUrl: string;
  startingBlock: string;
  databaseUrl: string;
}

/** Normalize contract address: lowercase hex with no leading-zero padding */
const normalizeAddress = (addr: string) =>
  `0x${BigInt(addr).toString(16)}`;

export default function numberGuessIndexer(runtimeConfig: ApibaraRuntimeConfig) {
  const config = runtimeConfig.numberGuess as NumberGuessConfig;
  const {
    contractAddress,
    streamUrl,
    startingBlock: startBlockStr,
    databaseUrl,
  } = config;
  const startingBlock = BigInt(startBlockStr);

  const normalizedAddress = normalizeAddress(contractAddress);

  // Log configuration on startup
  console.log("[Number Guess Indexer] Contract:", contractAddress);
  console.log("[Number Guess Indexer] Stream:", streamUrl);
  console.log("[Number Guess Indexer] Starting Block:", startingBlock.toString());

  // Create Drizzle database instance
  const database = drizzle({ schema, connectionString: databaseUrl });

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "pending",
    startingBlock,
    filter: {
      events: [
        {
          address: normalizedAddress as `0x${string}`,
          keys: [EVENT_SELECTORS.NewGameStarted as `0x${string}`],
          includeReceipt: false,
        },
        {
          address: normalizedAddress as `0x${string}`,
          keys: [EVENT_SELECTORS.GuessMade as `0x${string}`],
          includeReceipt: false,
          includeTransaction: true,
        },
      ],
    },
    plugins: [
      drizzleStorage({
        db: database,
        persistState: true,
        indexerName: "number-guess",
        idColumn: "id",
        migrate: {
          migrationsFolder: "./migrations",
        },
      }),
    ],
    hooks: {
      "run:before": () => {
        console.log("[Number Guess Indexer] Starting indexer...");
      },
      "run:after": async () => {
        console.log("[Number Guess Indexer] Indexer stopped.");
      },
      "connect:before": ({ request }) => {
        // Keep connection alive with periodic heartbeats (30 seconds)
        request.heartbeatInterval = { seconds: 30n, nanos: 0 };
      },
      "connect:after": async () => {
        console.log("[Number Guess Indexer] Connected to DNA stream.");
      },
    },
    async transform({ block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events, transactions, header } = block;

      if (!header) {
        logger.warn("No header in block, skipping");
        return;
      }

      const blockNumber = header.blockNumber ?? 0n;
      const blockTimestamp = header.timestamp ?? new Date();

      if (events.length > 0) {
        logger.info(
          `Processing ${events.length} events at block ${blockNumber}`
        );
      }

      for (const event of events) {
        const keys = event.keys;
        const data = event.data;
        const transactionHash = event.transactionHash ?? "0x0";
        const eventIndex = event.eventIndex ?? 0;

        // Extract sender address from the transaction (if includeTransaction is enabled)
        let senderAddress: string | undefined;
        const txIdx = event.transactionIndex;
        if (txIdx != null && transactions && transactions[txIdx]) {
          const txWrapper = transactions[txIdx];
          const tx = txWrapper.transaction as any;
          if (tx) {
            // Log raw transaction keys to diagnose structure
            logger.info(`[TX DEBUG] txIdx=${txIdx}, top-level keys: ${Object.keys(tx).join(", ")}`);
            if (tx.invokeV3) logger.info(`[TX DEBUG] invokeV3 keys: ${Object.keys(tx.invokeV3).join(", ")}`);
            if (tx.invokeV1) logger.info(`[TX DEBUG] invokeV1 keys: ${Object.keys(tx.invokeV1).join(", ")}`);
            if (tx.meta) logger.info(`[TX DEBUG] meta keys: ${Object.keys(tx.meta).join(", ")}`);

            const addr = tx.invokeV3?.senderAddress
              ?? tx.invokeV1?.senderAddress
              ?? tx.invokeV0?.contractAddress
              ?? tx.deployAccount?.contractAddressSalt;
            if (addr) {
              senderAddress = "0x" + BigInt(addr).toString(16);
              logger.info(`[TX DEBUG] extracted addr=${senderAddress}, raw type=${typeof addr}, raw=${String(addr).slice(0, 40)}`);
            }
          }
        }

        if (keys.length === 0) continue;

        const selector = feltToHex(keys[0]);

        try {
          switch (selector) {
            case EVENT_SELECTORS.NewGameStarted: {
              const decoded = decodeNewGameStarted(keys, data);
              const tokenIdStr = decoded.tokenId.toString();

              logger.info(
                `NewGameStarted: token=${tokenIdStr} settings=${decoded.settingsId} range=${decoded.rangeMin}-${decoded.rangeMax} maxAttempts=${decoded.maxAttempts}`
              );

              await db
                .insert(schema.gameSessions)
                .values({
                  tokenId: tokenIdStr,
                  settingsId: decoded.settingsId,
                  rangeMin: decoded.rangeMin,
                  rangeMax: decoded.rangeMax,
                  maxAttempts: decoded.maxAttempts,
                  status: "playing",
                  guessCount: 0,
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  lastUpdatedBlock: blockNumber,
                })
                .onConflictDoUpdate({
                  target: [schema.gameSessions.tokenId, schema.gameSessions.blockNumber, schema.gameSessions.transactionHash],
                  set: {
                    settingsId: decoded.settingsId,
                    rangeMin: decoded.rangeMin,
                    rangeMax: decoded.rangeMax,
                    maxAttempts: decoded.maxAttempts,
                    status: "playing",
                    guessCount: 0,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: new Date(),
                  },
                });

              // Ensure stats row exists, then increment total sessions
              await db
                .insert(schema.gameStats)
                .values({
                  totalSessions: 1,
                  wins: 0,
                  losses: 0,
                  perfectGames: 0,
                })
                .onConflictDoNothing();

              await db.execute(
                sql`UPDATE game_stats SET total_sessions = total_sessions + 1, last_updated = NOW() WHERE id = (SELECT id FROM game_stats LIMIT 1)`
              );

              // Notify WebSocket subscribers
              await db.execute(
                sql`SELECT pg_notify('new_game', ${JSON.stringify({
                  tokenId: tokenIdStr,
                  settingsId: decoded.settingsId,
                  rangeMin: decoded.rangeMin,
                  rangeMax: decoded.rangeMax,
                  maxAttempts: decoded.maxAttempts,
                  status: "playing",
                })})`
              );

              break;
            }

            case EVENT_SELECTORS.GuessMade: {
              const decoded = decodeGuessMade(keys, data);
              const tokenIdStr = decoded.tokenId.toString();
              const resultStr = resultToString(decoded.result);

              logger.info(
                `GuessMade: token=${tokenIdStr} guess=${decoded.guessValue} result=${resultStr} count=${decoded.guessCount} range=${decoded.rangeMin}-${decoded.rangeMax} player=${senderAddress ?? "unknown"}`
              );

              // Insert guess record
              await db
                .insert(schema.guesses)
                .values({
                  tokenId: tokenIdStr,
                  player: senderAddress ?? null,
                  guessValue: decoded.guessValue,
                  result: resultStr,
                  guessNumber: decoded.guessCount,
                  rangeMinAfter: decoded.rangeMin,
                  rangeMaxAfter: decoded.rangeMax,
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              // Update session guess count and status
              if (resultStr === "correct") {
                // Calculate score: base 100 + efficiency bonus + perfect bonus
                const session = await db.execute(
                  sql`SELECT range_min, range_max FROM game_sessions WHERE token_id = ${tokenIdStr} AND status = 'playing' LIMIT 1`
                ) as { rows: Array<{ range_min: number; range_max: number }> };

                let rangeSize = decoded.rangeMax - decoded.rangeMin + 1;
                if (session.rows && session.rows.length > 0) {
                  rangeSize = session.rows[0].range_max - session.rows[0].range_min + 1;
                }

                // Optimal guesses = ceil(log2(rangeSize))
                let optimalGuesses = 1;
                let n = rangeSize;
                while (n > 1) { optimalGuesses++; n = Math.floor(n / 2); }

                let score = 100n;
                if (decoded.guessCount <= optimalGuesses) {
                  score += BigInt((optimalGuesses - decoded.guessCount + 1) * 10);
                }
                if (decoded.guessCount === 1) {
                  score += 50n;
                }

                // Mark session as won
                await db.execute(
                  sql`UPDATE game_sessions SET status = 'won', guess_count = ${decoded.guessCount}, score = ${score.toString()}::bigint, last_updated_block = ${blockNumber.toString()}::bigint, last_updated_at = NOW() WHERE token_id = ${tokenIdStr} AND status = 'playing'`
                );

                // Update stats: wins
                await db.execute(
                  sql`UPDATE game_stats SET wins = wins + 1, last_updated = NOW() WHERE id = (SELECT id FROM game_stats LIMIT 1)`
                );

                // Update stats: perfect games (first-guess win)
                if (decoded.guessCount === 1) {
                  await db.execute(
                    sql`UPDATE game_stats SET perfect_games = perfect_games + 1, last_updated = NOW() WHERE id = (SELECT id FROM game_stats LIMIT 1)`
                  );
                }
              } else {
                // Update guess count on the active session
                await db.execute(
                  sql`UPDATE game_sessions SET guess_count = ${decoded.guessCount}, last_updated_block = ${blockNumber.toString()}::bigint, last_updated_at = NOW() WHERE token_id = ${tokenIdStr} AND status = 'playing'`
                );

                // Check if this was the last attempt (max_attempts > 0 and guessCount >= maxAttempts)
                const sessions = await db.execute(
                  sql`SELECT max_attempts FROM game_sessions WHERE token_id = ${tokenIdStr} AND status = 'playing' LIMIT 1`
                ) as { rows: Array<{ max_attempts: number }> };

                if (sessions.rows && sessions.rows.length > 0) {
                  const maxAttempts = sessions.rows[0].max_attempts;
                  if (maxAttempts > 0 && decoded.guessCount >= maxAttempts) {
                    await db.execute(
                      sql`UPDATE game_sessions SET status = 'lost', last_updated_block = ${blockNumber.toString()}::bigint, last_updated_at = NOW() WHERE token_id = ${tokenIdStr} AND status = 'playing'`
                    );

                    await db.execute(
                      sql`UPDATE game_stats SET losses = losses + 1, last_updated = NOW() WHERE id = (SELECT id FROM game_stats LIMIT 1)`
                    );
                  }
                }
              }

              // Notify WebSocket subscribers about the guess
              const guessPayload = JSON.stringify({
                tokenId: tokenIdStr,
                guessValue: decoded.guessValue,
                result: resultStr,
                guessNumber: decoded.guessCount,
                rangeMinAfter: decoded.rangeMin,
                rangeMaxAfter: decoded.rangeMax,
                ...(senderAddress && { player: senderAddress }),
              });
              await db.execute(sql`SELECT pg_notify('guess', ${guessPayload})`);

              // Notify game_won / game_lost if applicable
              if (resultStr === "correct") {
                await db.execute(
                  sql`SELECT pg_notify('game_won', ${JSON.stringify({
                    tokenId: tokenIdStr,
                    guessCount: decoded.guessCount,
                  })})`
                );
              } else {
                // Re-check if the game was lost (last attempt)
                const lostCheck = await db.execute(
                  sql`SELECT status FROM game_sessions WHERE token_id = ${tokenIdStr} AND status = 'lost' AND last_updated_block = ${blockNumber.toString()}::bigint LIMIT 1`
                ) as { rows: Array<{ status: string }> };
                if (lostCheck.rows && lostCheck.rows.length > 0) {
                  await db.execute(
                    sql`SELECT pg_notify('game_lost', ${JSON.stringify({
                      tokenId: tokenIdStr,
                      guessCount: decoded.guessCount,
                    })})`
                  );
                }
              }

              break;
            }

            default:
              // Unknown event selector - skip
              logger.debug(`Unknown event selector: ${selector}`);
              break;
          }
        } catch (error) {
          logger.error(
            `Error processing event at block ${blockNumber}, index ${eventIndex}: ${error}`
          );
          logger.error(`Event selector: ${selector}`);
          logger.error(`Keys: ${JSON.stringify(keys)}`);
          logger.error(`Data: ${JSON.stringify(data)}`);
          // Don't re-throw - let the indexer continue processing other events
          // Reorgs are handled automatically by the Drizzle plugin
        }
      }
    },
  });
}
