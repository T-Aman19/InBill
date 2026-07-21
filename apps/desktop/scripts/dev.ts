#!/usr/bin/env bun
/**
 * Dev launcher for `tauri dev` (beforeDevCommand). Starts the server, mobile
 * and pos dev servers concurrently and keeps running until interrupted.
 *
 * Replaces the old `(cd ../server && bun run dev &) && …` shell one-liner,
 * which relied on POSIX `&` backgrounding and broke on Windows (cmd.exe).
 */
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..", "..", "..")
const APPS = ["server", "mobile", "pos"]

const procs = APPS.map((app) =>
  Bun.spawn(["bun", "run", "dev"], {
    cwd: path.join(ROOT, "apps", app),
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
)

function shutdown() {
  for (const p of procs) {
    try { p.kill() } catch { /* already gone */ }
  }
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

// If any dev server dies, keep the others running — tauri dev owns the lifetime.
await Promise.all(procs.map((p) => p.exited))
