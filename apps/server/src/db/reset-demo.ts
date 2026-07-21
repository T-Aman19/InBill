/**
 * Demo reset — wipes and re-seeds the demo database. Meant to run on a
 * schedule (Railway cron) against the isolated demo Neon DB only; safe
 * because that DB never holds anything but demo data. Also doubles as the
 * first-run bootstrap since truncating an empty table is a no-op.
 *
 * Run: bun run src/db/reset-demo.ts
 */
import { sql } from "drizzle-orm"
import { db } from "./index.js"
import { runSeed } from "./seed-demo.js"

console.log("Resetting demo data...")
// owners/outlets cascade through every FK-linked child table (users, menu,
// orders, bills, ...) — the whole schema lives under one of these two roots.
await db.execute(sql`TRUNCATE TABLE owners, outlets RESTART IDENTITY CASCADE`)
console.log("Truncated.")

await runSeed()
process.exit(0)
