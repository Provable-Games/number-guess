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

    // Query pg_trigger directly (information_schema.triggers may miss some)
    const allTriggers = await client.query(`
      SELECT t.tgname AS trigger_name, c.relname AS table_name, n.nspname AS schema_name
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE NOT t.tgisinternal
    `);
    console.log(`[Cleanup] Total user triggers in DB: ${allTriggers.rows.length}`);
    for (const row of allTriggers.rows) {
      console.log(`[Cleanup]   - ${row.trigger_name} on ${row.schema_name}.${row.table_name}`);
    }

    // Filter reorg triggers
    const reorgTriggers = allTriggers.rows.filter(
      (row) => row.trigger_name.includes("reorg")
    );

    if (reorgTriggers.length === 0) {
      console.log("[Cleanup] No reorg triggers found");
      return;
    }

    console.log(`[Cleanup] Found ${reorgTriggers.length} reorg triggers to drop`);

    for (const row of reorgTriggers) {
      const { trigger_name, schema_name, table_name } = row;
      const qualifiedTable = `"${schema_name}"."${table_name}"`;
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
