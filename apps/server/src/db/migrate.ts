import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { config } from "../config.js"

const client = postgres(config.db.url, { max: 1 })
const db = drizzle(client)

console.log("Running migrations...")
await migrate(db, { migrationsFolder: "./src/db/migrations" })
console.log("Migrations complete.")
await client.end()
