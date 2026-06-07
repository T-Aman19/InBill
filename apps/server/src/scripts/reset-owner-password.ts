/**
 * Local-mode password reset utility.
 * Run from apps/server:  bun run src/scripts/reset-owner-password.ts
 */
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { owners } from "../db/schema/index.js"

const readline = (prompt: string): Promise<string> =>
  new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.setEncoding("utf8")
    process.stdin.once("data", (chunk) => {
      process.stdin.pause()
      resolve((chunk as string).trim())
    })
  })

const email = await readline("Owner email: ")
const newPassword = await readline("New password (min 8 chars): ")

if (!email || newPassword.length < 8) {
  console.error("Error: email required and password must be at least 8 characters.")
  process.exit(1)
}

const owner = await db.query.owners.findFirst({ where: eq(owners.email, email) })
if (!owner) {
  console.error(`No owner found with email: ${email}`)
  process.exit(1)
}

const passwordHash = await Bun.password.hash(newPassword)
await db.update(owners).set({ passwordHash }).where(eq(owners.id, owner.id))

console.log(`Password updated for ${owner.name} (${owner.email}).`)
process.exit(0)
