// Migration SQL files are embedded at compile time via Bun's text import.
// `bun build --compile` bundles these strings into the binary so the
// migrations folder does not need to exist at runtime.
import m0000 from "./migrations/0000_abandoned_darkhawk.sql" with { type: "text" }
import m0001 from "./migrations/0001_strong_speed.sql" with { type: "text" }
import m0002 from "./migrations/0002_tense_genesis.sql" with { type: "text" }
import m0003 from "./migrations/0003_lumpy_ogun.sql" with { type: "text" }
import m0004 from "./migrations/0004_elite_lilith.sql" with { type: "text" }
import m0005 from "./migrations/0005_owner_user_pin_nullable.sql" with { type: "text" }
import m0006 from "./migrations/0006_outlet_setup_code.sql" with { type: "text" }
import m0007 from "./migrations/0007_outlet_fssai.sql" with { type: "text" }
import m0008 from "./migrations/0008_voided_items_bills_staff.sql" with { type: "text" }
import m0009 from "./migrations/0009_order_source.sql" with { type: "text" }
import m0010 from "./migrations/0010_loyalty.sql" with { type: "text" }
import m0011 from "./migrations/0011_outlet_settings.sql" with { type: "text" }
import m0012 from "./migrations/0012_queue.sql" with { type: "text" }
import m0013 from "./migrations/0013_owner_password_resets.sql" with { type: "text" }
import m0014 from "./migrations/0014_host_role.sql" with { type: "text" }
import m0015 from "./migrations/0015_queue_customer_id.sql" with { type: "text" }
import postgres from "postgres"
import { config } from "../config.js"

const MIGRATIONS = [
  { name: "0000_abandoned_darkhawk",      sql: m0000 },
  { name: "0001_strong_speed",            sql: m0001 },
  { name: "0002_tense_genesis",           sql: m0002 },
  { name: "0003_lumpy_ogun",              sql: m0003 },
  { name: "0004_elite_lilith",            sql: m0004 },
  { name: "0005_owner_user_pin_nullable", sql: m0005 },
  { name: "0006_outlet_setup_code",       sql: m0006 },
  { name: "0007_outlet_fssai",            sql: m0007 },
  { name: "0008_voided_items_bills_staff",sql: m0008 },
  { name: "0009_order_source",            sql: m0009 },
  { name: "0010_loyalty",                 sql: m0010 },
  { name: "0011_outlet_settings",         sql: m0011 },
  { name: "0012_queue",                   sql: m0012 },
  { name: "0013_owner_password_resets",   sql: m0013 },
  { name: "0014_host_role",              sql: m0014 },
  { name: "0015_queue_customer_id",      sql: m0015 },
]

export async function runEmbeddedMigrations(): Promise<void> {
  const client = postgres(config.db.url, { max: 1 })
  try {
    // Tracking table — separate from drizzle's own table to avoid format conflicts
    await client`
      CREATE TABLE IF NOT EXISTS __inbill_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    const rows = await client`SELECT name FROM __inbill_migrations`
    const applied = new Set(rows.map((r) => r.name as string))

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue

      console.log(`[migrate] ${migration.name}`)
      // Drizzle separates statements with "--> statement-breakpoint"
      const statements = migration.sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)

      for (const stmt of statements) {
        try {
          await client.unsafe(stmt)
        } catch (err: any) {
          // 42710 = duplicate_object (type already exists)
          // 42P07 = duplicate_table (relation already exists)
          // 42701 = duplicate_column
          if (!["42710", "42P07", "42701"].includes(err?.code)) throw err
        }
      }

      await client`INSERT INTO __inbill_migrations (name) VALUES (${migration.name})`
    }

    console.log("[migrate] up to date")
  } finally {
    await client.end()
  }
}
