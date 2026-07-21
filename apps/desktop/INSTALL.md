# InBill Desktop — Building, Installing & Troubleshooting

The desktop app is a Tauri shell that runs everything locally:

```
InBill.app / InBill.exe / inbill.AppImage|.deb|.rpm
 ├─ webview            → POS UI (bundled apps/pos/dist)
 ├─ inbill-server      → Bun server sidecar (API + serves /mobile and /host on LAN)
 └─ embedded Postgres  → data in the per-user app-data dir, port 5433 (auto-fallback)
```

First launch initialises the database and runs migrations, then the window
navigates to `http://localhost:3000` (or the next free port up to 3019 if 3000
is taken). Captain/host devices connect over Wi-Fi via the QR codes in
Manager → Devices.

---

## 1. Building an installer

Build on the OS you're shipping for (Tauri cannot cross-bundle installers).

### Prerequisites (all platforms)

| Tool | Install |
|---|---|
| Bun ≥ 1.1 | https://bun.sh |
| Rust (stable) | https://rustup.rs |
| Platform toolchain | see per-OS notes below |

Then from the repo root: `bun install`.

### Build

```sh
cd apps/desktop
bun run tauri build
```

That's it. `beforeBuildCommand` runs `scripts/prepare-build.ts`, which:

1. builds the **pos**, **mobile**, and **host** web apps,
2. compiles the **server sidecar** for the current target
   (`src-tauri/binaries/inbill-server-<triple>[.exe]`),
3. downloads the **offline Postgres archive** for the current target into
   `src-tauri/resources/pg/` (~35 MB, cached — only downloaded once).

Steps can also be run manually / selectively:

```sh
bun run scripts/prepare-build.ts --sidecar-only --target x86_64-pc-windows-msvc
bun run scripts/prepare-build.ts --jar-only
bun run scripts/prepare-build.ts --sidecar-only --target all   # every platform (sidecars cross-compile)
```

> Sidecars and Postgres archives **can** be produced for any platform from any
> machine, but the final `tauri build` (installer/bundle) must run on the
> target OS.

### Per-OS notes

**macOS**
- Xcode Command Line Tools: `xcode-select --install`.
- Output: `src-tauri/target/release/bundle/dmg/*.dmg` and `macos/InBill.app`.
- DMG creation drives Finder via AppleScript to lay out the volume icons. From
  a session without Finder-automation permission (SSH, CI, some terminals) it
  fails with `error running bundle_dmg.sh` — **the `.app` still builds fine**.
  Either grant the one-time "Terminal wants to control Finder" prompt and
  rebuild, or create the DMG without the icon styling (verified equivalent):

  ```sh
  cd src-tauri/target/release/bundle/dmg
  bash bundle_dmg.sh --volname InBill --icon InBill.app 180 170 \
    --app-drop-link 480 170 --window-size 660 400 \
    --hide-extension InBill.app --volicon icon.icns --skip-jenkins \
    InBill_0.1.0_aarch64.dmg ../macos
  ```
- Universal/Intel: `bun run tauri build --target x86_64-apple-darwin`
  (prepare-build picks the triple up automatically via `TAURI_ENV_TARGET_TRIPLE`).
- Minimum supported macOS: **12.0** (set in `tauri.conf.json`; the Bun sidecar
  does not support older).

**Windows**
- Visual Studio Build Tools with "Desktop development with C++", plus the
  Windows 10/11 SDK.
- Build from PowerShell or cmd — no bash needed (`prepare-build.ts` is a Bun script).
- Output: `src-tauri/target/release/bundle/nsis/*-setup.exe` (and `msi/*.msi`).
- The NSIS installer bundles the **offline WebView2 installer** (config:
  `webviewInstallMode: offlineInstaller`) so machines without WebView2 and
  without internet still install. This adds ~150 MB; if your customers'
  machines are Win 11 (WebView2 preinstalled) or online, you can switch to
  `"downloadBootstrapper"` for a small installer.
- Install mode is `both` — the installer asks per-user (no admin) or per-machine (admin).

**Linux**
- Debian/Ubuntu build deps:
  `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- Output: `.deb`, `.rpm`, and `.AppImage` under `src-tauri/target/release/bundle/`.
- The tray icon requires an AppIndicator implementation
  (`libayatana-appindicator3-1`) — the `.deb` declares it; AppImage bundles it.
- GNOME users may need the *AppIndicator* shell extension for the tray icon to show.

---

## 2. Code signing (not configured yet)

Unsigned builds work but trip OS gatekeepers — see §4 for the end-user
workarounds. When certificates are available:

- **macOS**: set `bundle.macOS.signingIdentity` + notarize (Apple Developer ID,
  `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` env vars for `tauri build`).
- **Windows**: set `bundle.windows.certificateThumbprint` /
  `signCommand` (EV or OV cert; EV removes SmartScreen instantly, OV builds
  reputation over weeks).
- **Linux**: no signing needed; optionally publish a checksum/GPG signature.

---

## 2b. Auto-updates (configured)

Release builds check GitHub Releases ~20s after startup, download + stage the
update in the background, then offer a "Restart now / Later" dialog. Offline
machines are unaffected (failures only log to `inbill.log`). Debug/dev builds
never check.

**How it's wired**

- `tauri-plugin-updater` + `tauri-plugin-dialog` (`src/lib.rs → check_for_updates`)
- Endpoint: `https://github.com/T-Aman19/InBill/releases/latest/download/latest.json`
- Update signature pubkey: `plugins.updater.pubkey` in `tauri.conf.json`
- `bundle.createUpdaterArtifacts: true` makes `tauri build` emit `.sig` files
  next to each installer.

**Signing key** (separate from OS code-signing above)

The private key lives at `~/.tauri/inbill-updater.key` (no password) on the
machine that generated it. **Back it up somewhere safe** — if it's lost, shipped
apps can never verify another update and users must reinstall manually. Never
commit it.

**Cutting a release**

1. Bump `version` in `tauri.conf.json` (and `Cargo.toml` to keep them aligned).
2. Build on each target OS with the signing key in the environment:
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/inbill-updater.key
   bun run build          # emits installer + matching .sig per target
   ```
3. Create a GitHub release tagged `vX.Y.Z`; upload every installer and its
   `.sig`.
4. Add a `latest.json` asset to the same release (the updater fetches
   `releases/latest/download/latest.json`):
   ```json
   {
     "version": "X.Y.Z",
     "pub_date": "2026-07-14T00:00:00Z",
     "notes": "What changed",
     "platforms": {
       "darwin-aarch64":  { "signature": "<contents of .app.tar.gz.sig>", "url": "https://github.com/T-Aman19/InBill/releases/download/vX.Y.Z/InBill_aarch64.app.tar.gz" },
       "windows-x86_64":  { "signature": "<contents of .exe.sig>",        "url": "https://github.com/T-Aman19/InBill/releases/download/vX.Y.Z/InBill_X.Y.Z_x64-setup.exe" },
       "linux-x86_64":    { "signature": "<contents of .AppImage.sig>",   "url": "https://github.com/T-Aman19/InBill/releases/download/vX.Y.Z/inbill_X.Y.Z_amd64.AppImage" }
     }
   }
   ```
   The `signature` value is the *contents* of the `.sig` file, not a path.
   (If you later add CI, `tauri-apps/tauri-action` generates `latest.json`
   automatically.)

---

## 3. What happens on first launch (and where things live)

| Thing | macOS | Windows | Linux |
|---|---|---|---|
| Database (`pgdata`) | `~/Library/Application Support/app.inbill.desktop/` | `%APPDATA%\app.inbill.desktop\` | `~/.local/share/app.inbill.desktop/` |
| Postgres binaries cache | `~/Library/Caches/pg-embed/` | `%LOCALAPPDATA%\pg-embed\` | `~/.cache/pg-embed/` |
| Logs (`inbill.log`, `.log.old`) | `~/Library/Logs/app.inbill.desktop/` | `%LOCALAPPDATA%\app.inbill.desktop\logs\` | `~/.local/share/app.inbill.desktop/logs\` |

Startup order: splash → Postgres (bundled archive → unpack on first run) →
server sidecar (migrations) → navigate to the POS. If any step fails, the
splash shows the error, the **log file path**, and a **Retry** button.

- **Offline first run works**: the Postgres archive is inside the installer.
  The Maven download only happens if the bundled archive is missing (e.g. a
  build made without running prepare-build).
- **Ports**: server prefers 3000, walks up to 3019 if busy; Postgres prefers
  5433, walks up to 5442 if a *foreign* process holds it. An InBill Postgres
  left over from a crash is detected via `postmaster.pid` and reused.
- **Second launch** of the app focuses the existing window (single-instance).
- **Closing the window** minimises to the tray; *Quit* from the tray menu stops
  the server and Postgres cleanly.

---

## 4. End-user install notes & edge cases

### macOS
- **Unsigned build**: right-click → Open (once), or if macOS says the app "is
  damaged", clear quarantine: `xattr -cr /Applications/InBill.app`.
- **Local-network permission** (macOS 15+): allow when prompted, otherwise
  captain phones can't reach the server.

### Windows
- **SmartScreen** (unsigned build): "More info" → "Run anyway".
- **Firewall prompt** on first run: tick **Private networks** and Allow —
  otherwise LAN devices (captain app, host tablet, QR menu) can't connect.
- **Antivirus**: the server sidecar is a self-contained Bun binary; some AVs
  sandbox unknown EXEs on first run, which can slow the first start. If
  startup exceeds 60 s the splash shows Retry — a retry after AV scan passes
  normally succeeds.
- Per-user install needs no admin; per-machine does.

### Linux
- **AppImage**: `chmod +x InBill_*.AppImage` then run. Needs FUSE 2
  (`sudo apt install libfuse2` on Ubuntu 22.04+). If FUSE can't be installed:
  `./InBill_*.AppImage --appimage-extract-and-run`.
- **.deb/.rpm** pull in WebKitGTK + AppIndicator dependencies automatically.
- Wayland + tray: install the GNOME AppIndicator extension if the tray icon is missing.

### All platforms
- **"The database engine failed to start"** on first run usually means a
  half-completed previous init. Quit, delete the `pgdata` folder (see table
  above — only if there's no data to keep!), and relaunch.
- **Something already on port 5433/3000**: handled automatically (port walk).
- **LAN features** need the POS machine and phones on the same network, with
  client isolation disabled on the router/AP.
- Uninstalling never deletes data: remove the app-data folder manually if you
  want a truly clean slate.

---

## 5. Development

```sh
cd apps/desktop
bun run tauri dev      # starts server+mobile+pos dev servers (scripts/dev.ts) + the Tauri window
```

Dev mode skips the embedded Postgres/sidecar entirely — the window loads the
Vite dev server (`http://localhost:5173`), and the API dev server (port 3005)
uses your local `DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5433/inbill`).
