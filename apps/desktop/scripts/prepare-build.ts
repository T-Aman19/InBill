#!/usr/bin/env bun
/**
 * Prepares everything the Tauri desktop build needs. Cross-platform (no bash) —
 * runs automatically as `beforeBuildCommand`, or manually:
 *
 *   bun run scripts/prepare-build.ts                 # everything, for this machine
 *   bun run scripts/prepare-build.ts --apps-only     # just pos/mobile/host web builds
 *   bun run scripts/prepare-build.ts --sidecar-only  # just the Bun server binary
 *   bun run scripts/prepare-build.ts --jar-only      # just the offline Postgres archive
 *   bun run scripts/prepare-build.ts --target x86_64-pc-windows-msvc   # cross-target sidecar+jar
 *   bun run scripts/prepare-build.ts --sidecar-only --target all       # sidecars for every platform
 *
 * Steps:
 *  1. Builds the pos / mobile / host web apps (bundled as Tauri resources).
 *  2. Compiles the server into a standalone sidecar binary
 *     (binaries/inbill-server-<rust-triple>[.exe] — Tauri externalBin naming).
 *  3. Downloads the zonky embedded-Postgres archive into resources/pg/ so the
 *     installer works fully offline on first run (no Maven download at launch).
 */
import { $ } from "bun"
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..", "..", "..")
const SRC_TAURI = path.join(ROOT, "apps", "desktop", "src-tauri")
const PG_DIR = path.join(SRC_TAURI, "resources", "pg")
const BIN_DIR = path.join(SRC_TAURI, "binaries")

// Must match PG_V15 used in src-tauri/src/lib.rs (pg-embed's PG_V15 = "15.1.0").
const PG_VERSION = "15.1.0"

type TripleInfo = { bun: string; zonky: string; exe: string }
const TRIPLES: Record<string, TripleInfo> = {
  "aarch64-apple-darwin":      { bun: "bun-darwin-arm64", zonky: "darwin-arm64v8", exe: "" },
  "x86_64-apple-darwin":       { bun: "bun-darwin-x64",   zonky: "darwin-amd64",   exe: "" },
  "x86_64-pc-windows-msvc":    { bun: "bun-windows-x64",  zonky: "windows-amd64",  exe: ".exe" },
  "x86_64-unknown-linux-gnu":  { bun: "bun-linux-x64",    zonky: "linux-amd64",    exe: "" },
  "aarch64-unknown-linux-gnu": { bun: "bun-linux-arm64",  zonky: "linux-arm64v8",  exe: "" },
}

function hostTriple(): string {
  // Set by `tauri build` / `tauri dev`, including `--target` cross-arch builds.
  const fromTauri = process.env["TAURI_ENV_TARGET_TRIPLE"]
  if (fromTauri) return fromTauri
  const { platform, arch } = process
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported build platform: ${platform}/${arch}`)
}

async function buildApps() {
  for (const app of ["pos", "mobile", "host"]) {
    const dir = path.join(ROOT, "apps", app)
    if (!existsSync(dir)) {
      console.warn(`==> skipping apps/${app} (not found)`)
      continue
    }
    console.log(`==> building apps/${app}`)
    await $`bun run build`.cwd(dir)
  }
}

async function buildSidecar(triple: string) {
  const info = TRIPLES[triple]
  if (!info) throw new Error(`Unknown target triple: ${triple}\nKnown: ${Object.keys(TRIPLES).join(", ")}`)
  mkdirSync(BIN_DIR, { recursive: true })
  const out = path.join(BIN_DIR, `inbill-server-${triple}${info.exe}`)
  console.log(`==> compiling server sidecar for ${triple}`)
  await $`bun build apps/server/src/index.ts --compile --target=${info.bun} --outfile ${out}`.cwd(ROOT)
  console.log(`==> sidecar ready: ${out}`)
}

async function fetchJar(triple: string, keepExtra: boolean) {
  const info = TRIPLES[triple]
  if (!info) throw new Error(`Unknown target triple: ${triple}`)
  mkdirSync(PG_DIR, { recursive: true })

  const name = `embedded-postgres-binaries-${info.zonky}-${PG_VERSION}.jar`
  const dest = path.join(PG_DIR, name)

  // Every jar in resources/pg/ gets bundled into the installer — drop archives
  // for other platforms so they don't silently add ~35 MB each of dead weight.
  if (!keepExtra) {
    for (const f of readdirSync(PG_DIR)) {
      if (f.endsWith(".jar") && f !== name) {
        console.log(`==> removing other-platform archive ${f} (use --keep-extra-jars to keep)`)
        unlinkSync(path.join(PG_DIR, f))
      }
    }
  }

  if (existsSync(dest)) {
    console.log(`==> postgres archive already present: ${name}`)
    return
  }

  const url = `https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-${info.zonky}/${PG_VERSION}/${name}`
  console.log(`==> downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Postgres archive download failed: HTTP ${res.status} for ${url}`)
  // Download to a temp name then rename, so an interrupted fetch never leaves a
  // partial file that looks complete to the existsSync check above.
  const part = `${dest}.part`
  await Bun.write(part, res)
  const { renameSync } = await import("node:fs")
  renameSync(part, dest)
  console.log(`==> postgres archive ready: ${dest}`)
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (f: string) => args.includes(f)
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : undefined
const only = has("--apps-only") ? "apps" : has("--sidecar-only") ? "sidecar" : has("--jar-only") ? "jar" : "all"
const keepExtra = has("--keep-extra-jars") || targetArg === "all"

const targets = targetArg === "all" ? Object.keys(TRIPLES) : [targetArg ?? hostTriple()]

if (only === "all" || only === "apps") await buildApps()
for (const triple of targets) {
  if (only === "all" || only === "sidecar") await buildSidecar(triple)
  if (only === "all" || only === "jar") await fetchJar(triple, keepExtra)
}
console.log("==> prepare-build done")
