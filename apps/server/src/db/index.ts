import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index.js"
import { config } from "../config.js"

const client = postgres(config.db.url, {
  max: config.isLocal ? 5 : 20,
  idle_timeout: 30,
})

export const db = drizzle(client, { schema })
export type Db = typeof db
