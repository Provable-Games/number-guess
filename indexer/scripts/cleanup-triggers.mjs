/**
 * Cleanup Apibara reorg triggers
 *
 * The @apibara/plugin-drizzle creates triggers for handling chain reorganizations.
 * When the indexer restarts, it tries to create them again, causing an error.
 * This script drops existing triggers before the indexer starts.
 *
 * Plain ESM JS — no tsx/ts-node required, works in production builds.
 */

import pg from "pg";

const { Client } = pg;

async function cleanupTriggers() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/number_guess";

  // Log which DB we're connecting to (mask password)
  const safeUrl = databaseUrl.replace(/:([^@]+)@/, ":***@");
  console.log(`[Cleanup] Connecting to: ${safeUrl}`);

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("[Cleanup] Connected to database");

    // First: list ALL triggers in the database for diagnosis
    const allTriggers = await client.query(`
      SELECT trigger_name, event_object_schema, event_object_table
      FROM information_schema.triggers
      GROUP BY trigger_name, event_object_schema, event_object_table
    `);
    console.log(`[Cleanup] Total triggers in DB: ${allTriggers.rows.length}`);
    for (const row of allTriggers.rows) {
      console.log(`[Cleanup]   - ${row.trigger_name} on ${row.event_object_schema}.${row.event_object_table}`);
    }

    // Find ALL reorg triggers
    const result = allTriggers.rows.filter(
      (row) => row.trigger_name.includes("reorg")
    );

    if (result.length === 0) {
      console.log("[Cleanup] No reorg triggers found");
      return;
    }

    console.log(`[Cleanup] Found ${result.length} reorg triggers to drop`);

    for (const row of result) {
      const { trigger_name, event_object_schema, event_object_table } = row;
      const qualifiedTable =
        event_object_schema === "public"
          ? `"${event_object_table}"`
          : `"${event_object_schema}"."${event_object_table}"`;
      console.log(`[Cleanup] Dropping trigger ${trigger_name} on ${qualifiedTable}`);
      await client.query(
        `DROP TRIGGER IF EXISTS "${trigger_name}" ON ${qualifiedTable}`
      );
    }

    console.log("[Cleanup] All reorg triggers dropped successfully");
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanupTriggers();
