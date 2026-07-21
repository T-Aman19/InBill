use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// WKWebView on macOS does not route window.print() to the OS print dialog
// unless the app implements WKUIDelegate. Tauri's WebviewWindow::print()
// calls the correct platform API, so we expose it as an invoke command and
// call it from the frontend instead of window.print() when running in Tauri.
#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg(not(debug_assertions))]
use {
    pg_embed::pg_enums::PgAuthMethod,
    pg_embed::pg_fetch::{PgFetchSettings, PG_V15},
    pg_embed::postgres::{PgEmbed, PgSettings},
    std::io::Write as _,
    std::path::{Path, PathBuf},
    std::sync::atomic::{AtomicBool, Ordering},
    std::sync::Mutex,
    std::time::Duration,
    tauri::AppHandle,
    tauri_plugin_shell::process::CommandEvent,
    tauri_plugin_shell::ShellExt,
};

/// Runtime state for the embedded database + server (release builds only).
#[cfg(not(debug_assertions))]
#[derive(Default)]
struct Runtime {
    server: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
    pg: Mutex<Option<PgEmbed>>,
    /// True while a startup attempt is running (or has succeeded) — prevents
    /// double-starts from the splash Retry button.
    starting: AtomicBool,
    /// Set during shutdown so the sidecar-exit watcher doesn't report an error.
    quitting: AtomicBool,
}

// ── Splash helpers ───────────────────────────────────────────────────────────
// loading.html defines window.__inbillStatus / window.__inbillError; the `&&`
// guard makes these evals harmless if the splash hasn't loaded yet.

#[cfg(not(debug_assertions))]
fn splash_eval(app: &AppHandle, js: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval(js);
    }
}

#[cfg(not(debug_assertions))]
fn set_status(app: &AppHandle, msg: &str) {
    splash_eval(
        app,
        &format!("window.__inbillStatus && window.__inbillStatus({msg:?});"),
    );
}

#[cfg(not(debug_assertions))]
fn set_error(app: &AppHandle, msg: &str, log_path: &str) {
    splash_eval(
        app,
        &format!("window.__inbillError && window.__inbillError({msg:?}, {log_path:?});"),
    );
}

// ── Logging ──────────────────────────────────────────────────────────────────

#[cfg(not(debug_assertions))]
fn log_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("inbill.log"))
}

/// Keep one previous run's log around (`inbill.log.old`) and start fresh.
#[cfg(not(debug_assertions))]
fn rotate_logs(app: &AppHandle) {
    if let Some(path) = log_path(app) {
        if path.exists() {
            let _ = std::fs::rename(&path, path.with_extension("log.old"));
        }
    }
}

#[cfg(not(debug_assertions))]
fn open_log_append(app: &AppHandle) -> Option<std::fs::File> {
    let path = log_path(app)?;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}

#[cfg(not(debug_assertions))]
fn log_line(app: &AppHandle, line: &str) {
    eprintln!("[inbill] {line}");
    if let Some(mut f) = open_log_append(app) {
        let _ = writeln!(f, "[inbill] {line}");
    }
}

// ── Port helpers ─────────────────────────────────────────────────────────────

/// The server binds 0.0.0.0 (POS + LAN captain/host apps), so test that address.
#[cfg(not(debug_assertions))]
fn port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("0.0.0.0", port)).is_ok()
}

#[cfg(not(debug_assertions))]
fn pick_free_port(preferred: u16, tries: u16) -> Option<u16> {
    (preferred..preferred.saturating_add(tries)).find(|p| port_free(*p))
}

/// Decide which port Postgres should use, and whether our own instance from a
/// previous (uncleanly exited) run is still serving this data directory.
///
/// Reads `postmaster.pid` (line 4 = port) instead of blindly assuming that
/// anything on 5433 is ours — a foreign Postgres on 5433 previously caused
/// authentication failures. If the recorded port no longer answers, the pid
/// file is stale and Postgres cleans it up on the next start.
#[cfg(not(debug_assertions))]
fn resolve_pg(data_dir: &Path) -> (u16, bool) {
    const DEFAULT_PG_PORT: u16 = 5433;
    let pid_file = data_dir.join("postmaster.pid");
    if let Ok(content) = std::fs::read_to_string(&pid_file) {
        if let Some(port) = content
            .lines()
            .nth(3)
            .and_then(|l| l.trim().parse::<u16>().ok())
        {
            if let Ok(addr) = format!("127.0.0.1:{port}").parse() {
                if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
                {
                    return (port, true);
                }
            }
        }
    }
    let port = pick_free_port(DEFAULT_PG_PORT, 10).unwrap_or(DEFAULT_PG_PORT);
    (port, false)
}

// ── Postgres ─────────────────────────────────────────────────────────────────

#[cfg(not(debug_assertions))]
async fn start_postgres(
    data_dir: PathBuf,
    port: u16,
    already_up: bool,
    bundled_jar: Option<PathBuf>,
) -> Result<PgEmbed, Box<dyn std::error::Error + Send + Sync>> {
    let pg_settings = PgSettings {
        database_dir: data_dir,
        port,
        user: "inbill".to_string(),
        password: "inbill_local".to_string(),
        auth_method: PgAuthMethod::Plain,
        persistent: true,
        timeout: Some(Duration::from_secs(120)),
        migration_dir: None,
    };

    let fetch_settings = PgFetchSettings {
        version: PG_V15,
        bundled_jar,
        ..Default::default()
    };

    let mut pg = PgEmbed::new(pg_settings, fetch_settings).await?;
    pg.setup().await?;

    if !already_up {
        pg.start_db().await?;
    }

    if let Err(e) = pg.create_database("inbill").await {
        let msg = e.to_string();
        if !msg.contains("42P04") && !msg.contains("already exists") {
            return Err(Box::new(e));
        }
    }

    Ok(pg)
}

// Returns true only when the local server replies with an HTTP 200 on /health,
// confirming that Hono and migrations have finished — a bare TCP connect can
// succeed while the server is still starting up, causing a stale Edge error page.
#[cfg(not(debug_assertions))]
fn http_health_check(port: u16) -> bool {
    use std::io::{Read, Write};
    let addr: std::net::SocketAddr = match format!("127.0.0.1:{port}").parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let timeout = std::time::Duration::from_millis(400);
    if let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, timeout) {
        let _ = stream.set_read_timeout(Some(timeout));
        let req = b"GET /health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        if stream.write_all(req).is_ok() {
            let mut buf = [0u8; 32];
            if let Ok(n) = stream.read(&mut buf) {
                let s = &buf[..n];
                return s.starts_with(b"HTTP/1.1 200") || s.starts_with(b"HTTP/1.0 200");
            }
        }
    }
    false
}

// ── Startup orchestration ────────────────────────────────────────────────────

#[cfg(not(debug_assertions))]
fn spawn_server(app: &AppHandle) {
    let state = app.state::<Runtime>();
    // Already starting (or started) — ignore double-triggers from Retry.
    if state.starting.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let ok = run_startup(&app).await;
        if !ok {
            // Failed — allow the splash Retry button to run startup again.
            app.state::<Runtime>().starting.store(false, Ordering::SeqCst);
        }
    });
}

#[cfg(not(debug_assertions))]
async fn run_startup(app: &AppHandle) -> bool {
    let log_display = log_path(app)
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    // A previous failed attempt may have left a sick server child behind.
    if let Some(old) = app.state::<Runtime>().server.lock().unwrap().take() {
        let _ = old.kill();
    }

    // Resolve bundled dist paths so the POS (webview), captain mobile app
    // (/mobile) and host app (/host) are all served by the local server.
    let resource_dir = app.path().resource_dir().unwrap_or_default();
    let pos_dist = resource_dir.join("pos");
    let mobile_dist = resource_dir.join("mobile");
    let host_dist = resource_dir.join("host");

    // Give the webview ~300 ms to finish loading its initial page before we
    // redirect it to the splash (an eval that lands mid-load gets overwritten).
    // The __inbillSplash guard keeps a Retry run from reloading the splash.
    tokio::time::sleep(Duration::from_millis(300)).await;
    if let Some(win) = app.get_webview_window("main") {
        // Tauri v2 uses tauri:// on macOS/Linux but https://tauri.localhost/ on Windows (WebView2).
        #[cfg(target_os = "windows")]
        let loading_url = "https://tauri.localhost/loading.html";
        #[cfg(not(target_os = "windows"))]
        let loading_url = "tauri://localhost/loading.html";
        let _ = win.eval(&format!(
            "if (!window.__inbillSplash) window.location.href = '{loading_url}';"
        ));
    }
    tokio::time::sleep(Duration::from_millis(300)).await;

    // ── Postgres ────────────────────────────────────────────────────────────
    // If a previous attempt already brought Postgres up (e.g. the server phase
    // failed and the user hit Retry), reuse it instead of starting again —
    // replacing the stored PgEmbed would drop (and stop) the running instance.
    let existing_pg_port = {
        let state = app.state::<Runtime>();
        let guard = state.pg.lock().unwrap();
        guard.as_ref().map(|pg| pg.pg_settings.port)
    };

    let pg_port = if let Some(port) = existing_pg_port {
        port
    } else {
        let data_dir = match app.path().app_data_dir() {
            Ok(d) => d.join("pgdata"),
            Err(e) => {
                log_line(app, &format!("cannot resolve app data dir: {e}"));
                set_error(app, "Could not resolve the application data folder.", &log_display);
                return false;
            }
        };

        let (pg_port, pg_already_up) = resolve_pg(&data_dir);

        // Prefer the Postgres archive bundled with the installer (offline-first);
        // fall back to downloading from Maven Central if it's missing.
        let fetch_defaults = PgFetchSettings {
            version: PG_V15,
            ..Default::default()
        };
        let jar_name = format!(
            "embedded-postgres-binaries-{}-{}.jar",
            fetch_defaults.platform(),
            fetch_defaults.version.0
        );
        let bundled = resource_dir.join("pg").join(&jar_name);
        let bundled_jar = bundled.is_file().then(|| bundled.clone());

        if bundled_jar.is_some() {
            log_line(app, &format!("using bundled postgres archive: {jar_name}"));
            set_status(app, "Preparing database engine…");
        } else {
            log_line(
                app,
                &format!("bundled postgres archive not found ({jar_name}); may download on first run"),
            );
            set_status(app, "Preparing database engine (first run may download)…");
        }

        match start_postgres(data_dir, pg_port, pg_already_up, bundled_jar).await {
            Ok(pg) => {
                *app.state::<Runtime>().pg.lock().unwrap() = Some(pg);
                pg_port
            }
            Err(e) => {
                log_line(app, &format!("failed to start postgres: {e}"));
                set_error(
                    app,
                    "The database engine failed to start. If this is the first run, check the internet connection and try again.",
                    &log_display,
                );
                return false;
            }
        }
    };

    // ── Server sidecar ──────────────────────────────────────────────────────
    set_status(app, "Starting server…");

    // Pick a free port instead of force-killing whatever holds 3000 (the old
    // lsof/netstat kill could take out an unrelated process and doesn't exist
    // on every Linux install). LAN URLs and QR codes derive the port at
    // runtime from the request, so a non-3000 port propagates everywhere.
    let server_port = match pick_free_port(3000, 20) {
        Some(p) => p,
        None => {
            log_line(app, "no free port in 3000-3019");
            set_error(app, "No free network port found (3000–3019 all in use).", &log_display);
            return false;
        }
    };
    if server_port != 3000 {
        log_line(app, &format!("port 3000 busy — using {server_port}"));
    }

    let db_url = format!("postgresql://inbill:inbill_local@localhost:{pg_port}/inbill");

    let sidecar = match app.shell().sidecar("inbill-server") {
        Ok(c) => c,
        Err(e) => {
            // Previously an .expect() — a missing sidecar crashed the app with
            // no UI. Surface it in the splash instead.
            log_line(app, &format!("inbill-server sidecar not bundled: {e}"));
            set_error(app, "This build is missing the server component. Please reinstall InBill.", &log_display);
            return false;
        }
    };

    let spawn_result = sidecar
        .env("PORT", server_port.to_string())
        .env("DEPLOYMENT_MODE", "local")
        .env("DATABASE_URL", &db_url)
        .env("POS_DIST_PATH", pos_dist.to_string_lossy().as_ref())
        .env("MOBILE_DIST_PATH", mobile_dist.to_string_lossy().as_ref())
        .env("HOST_DIST_PATH", host_dist.to_string_lossy().as_ref())
        .spawn();

    let (mut rx, child) = match spawn_result {
        Ok(pair) => pair,
        Err(e) => {
            log_line(app, &format!("failed to start server: {e}"));
            set_error(app, "Failed to launch the server. See the log for details.", &log_display);
            return false;
        }
    };
    *app.state::<Runtime>().server.lock().unwrap() = Some(child);

    // Forward the server's output to the log file so failures are diagnosable,
    // and surface an unexpected exit in the splash (unless we're quitting).
    {
        let app = app.clone();
        let log_display = log_display.clone();
        tauri::async_runtime::spawn(async move {
            let mut file = open_log_append(&app);
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                        if let Some(f) = file.as_mut() {
                            let _ = f.write_all(&bytes);
                            let _ = f.write_all(b"\n");
                        }
                    }
                    CommandEvent::Terminated(status) => {
                        let state = app.state::<Runtime>();
                        if !state.quitting.load(Ordering::SeqCst) {
                            log_line(&app, &format!("server exited unexpectedly: {:?}", status.code));
                            state.starting.store(false, Ordering::SeqCst);
                            set_error(
                                &app,
                                "The server stopped unexpectedly. See the log for details.",
                                &log_display,
                            );
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });
    }

    // Poll up to 60 s (120 × 500 ms) — first run includes migrations which can
    // take a few seconds. Use an HTTP GET rather than a bare TCP connect so we
    // only navigate once the server is actually serving responses.
    let mut ready = false;
    for _ in 0..120 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if http_health_check(server_port) {
            ready = true;
            break;
        }
    }

    if !ready {
        log_line(app, "server did not respond within 60 s");
        set_error(app, "The server did not start in time. See the log for details.", &log_display);
        return false;
    }

    if let Some(win) = app.get_webview_window("main") {
        // Navigate the webview to the local server. From http://localhost:{port}
        // the POS api.ts uses relative paths which resolve correctly.
        let _ = win.eval(&format!("window.location.href = 'http://localhost:{server_port}'"));
        let _ = win.set_focus();
    }
    log_line(app, &format!("ready on http://localhost:{server_port}"));
    true
}

#[cfg(not(debug_assertions))]
fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<Runtime>();
    state.quitting.store(true, Ordering::SeqCst);
    if let Some(child) = state.server.lock().unwrap().take() {
        let _ = child.kill();
    }
    let pg = state.pg.lock().unwrap().take();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(mut pg) = pg {
            if let Err(e) = pg.stop_db().await {
                eprintln!("[inbill] pg_ctl stop failed: {e}");
            }
        }
        app.exit(0);
    });
}

// Invoked by the splash Retry button after a failed startup.
#[cfg(not(debug_assertions))]
#[tauri::command]
fn retry_startup(app: tauri::AppHandle) {
    spawn_server(&app);
}

#[cfg(debug_assertions)]
#[tauri::command]
fn retry_startup(_app: tauri::AppHandle) {}

// ── Auto-update ──────────────────────────────────────────────────────────────
// Release builds check GitHub Releases on startup. Updates are signed with the
// key whose pubkey lives in tauri.conf.json, downloaded and staged silently;
// the user picks when to restart. Failures only log — an offline restaurant
// must never be blocked by the updater.

#[cfg(not(debug_assertions))]
async fn check_for_updates(app: AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    // Let the embedded DB + server finish starting before touching the network
    tokio::time::sleep(Duration::from_secs(20)).await;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log_line(&app, &format!("updater: init failed: {e}"));
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => {
            log_line(&app, "updater: already up to date");
            return;
        }
        Err(e) => {
            log_line(&app, &format!("updater: check failed: {e}"));
            return;
        }
    };

    let version = update.version.clone();
    log_line(&app, &format!("updater: downloading v{version}"));
    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        log_line(&app, &format!("updater: install failed: {e}"));
        return;
    }
    log_line(&app, &format!("updater: v{version} staged — applies on restart"));

    let handle = app.clone();
    app.dialog()
        .message(format!(
            "InBill {version} has been downloaded.\nRestart now to finish updating?"
        ))
        .title("Update ready")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Restart now".to_string(),
            "Later".to_string(),
        ))
        .show(move |restart| {
            if restart {
                shutdown_for_restart(&handle);
            }
        });
}

/// Like `shutdown`, but relaunches the (now updated) app instead of exiting.
/// Postgres must be stopped cleanly before the restart replaces the process.
#[cfg(not(debug_assertions))]
fn shutdown_for_restart(app: &AppHandle) {
    let state = app.state::<Runtime>();
    state.quitting.store(true, Ordering::SeqCst);
    if let Some(child) = state.server.lock().unwrap().take() {
        let _ = child.kill();
    }
    let pg = state.pg.lock().unwrap().take();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(mut pg) = pg {
            if let Err(e) = pg.stop_db().await {
                eprintln!("[inbill] pg_ctl stop failed: {e}");
            }
        }
        app.restart();
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must be the first plugin registered. A second launch (double-click while
    // running) focuses the existing window instead of spawning a second app —
    // two instances would fight over the ports and the Postgres data directory.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }));

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init());

    builder
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![print_window, retry_startup])
        .setup(move |app| {
            #[cfg(not(debug_assertions))]
            app.manage(Runtime::default());

            let show = MenuItem::with_id(app, "show", "Open InBill", true, None::<&str>)?;
            let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        #[cfg(not(debug_assertions))]
                        shutdown(app);
                        #[cfg(debug_assertions)]
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // In release: window is already visible (shows loading.html splash).
            // Kick off the async startup — the splash status text updates as
            // each stage completes, then the webview navigates to the server.
            #[cfg(not(debug_assertions))]
            {
                rotate_logs(app.handle());
                spawn_server(app.handle());
                let update_handle = app.handle().clone();
                tauri::async_runtime::spawn(check_for_updates(update_handle));
            }

            // In dev: the window loads the Vite dev server directly.
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button minimises to tray instead of quitting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running InBill desktop");
}
