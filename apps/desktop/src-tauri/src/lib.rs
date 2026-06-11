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
    std::path::PathBuf,
    std::sync::{Arc, Mutex},
    std::time::Duration,
    tauri::AppHandle,
    tauri_plugin_shell::ShellExt,
};

#[cfg(not(debug_assertions))]
type ServerHandle = Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>;
#[cfg(not(debug_assertions))]
type PgHandle = Arc<Mutex<Option<PgEmbed>>>;

// Update the status text shown in the loading splash.
#[cfg(not(debug_assertions))]
fn set_status(app: &AppHandle, msg: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let js = format!(
            "var el=document.getElementById('status');if(el)el.textContent={:?};",
            msg
        );
        let _ = win.eval(&js);
    }
}

#[cfg(not(debug_assertions))]
async fn start_postgres(
    data_dir: PathBuf,
) -> Result<PgEmbed, Box<dyn std::error::Error + Send + Sync>> {
    let pg_settings = PgSettings {
        database_dir: data_dir,
        port: 5433,
        user: "inbill".to_string(),
        password: "inbill_local".to_string(),
        auth_method: PgAuthMethod::Plain,
        persistent: true,
        timeout: Some(Duration::from_secs(120)),
        migration_dir: None,
    };

    let fetch_settings = PgFetchSettings {
        version: PG_V15,
        ..Default::default()
    };

    let mut pg = PgEmbed::new(pg_settings, fetch_settings).await?;
    pg.setup().await?;

    // If postgres is already running (unclean quit), skip re-start.
    let already_up = std::net::TcpStream::connect("127.0.0.1:5433").is_ok();
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
fn http_health_check() -> bool {
    use std::io::{Read, Write};
    let addr: std::net::SocketAddr = "127.0.0.1:3000".parse().unwrap();
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

#[cfg(not(debug_assertions))]
fn spawn_server(app: &AppHandle, server_handle: ServerHandle, pg_handle: PgHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let data_dir = app
            .path()
            .app_data_dir()
            .expect("failed to get app data dir")
            .join("pgdata");

        // Resolve bundled dist paths so both the POS (webview) and captain
        // mobile app (/mobile on LAN) are served by the local server.
        let resource_dir = app.path().resource_dir().unwrap_or_default();
        let pos_dist    = resource_dir.join("pos");
        let mobile_dist = resource_dir.join("mobile");

        // Give the webview ~300 ms to finish loading its initial page before
        // we redirect it to the splash. Fails silently if the window isn't
        // ready yet — the POS error state is acceptable in that edge case.
        tokio::time::sleep(Duration::from_millis(300)).await;
        if let Some(win) = app.get_webview_window("main") {
            // Tauri v2 uses tauri:// on macOS/Linux but https://tauri.localhost/ on Windows (WebView2).
            #[cfg(target_os = "windows")]
            let loading_url = "https://tauri.localhost/loading.html";
            #[cfg(not(target_os = "windows"))]
            let loading_url = "tauri://localhost/loading.html";
            let _ = win.eval(&format!("window.location.href = '{loading_url}'"));
        }

        set_status(&app, "Downloading database engine…");

        match start_postgres(data_dir).await {
            Ok(pg) => {
                let db_url = "postgresql://inbill:inbill_local@localhost:5433/inbill".to_string();
                *pg_handle.lock().unwrap() = Some(pg);

                set_status(&app, "Starting server…");

                // Kill anything already on port 3000 before binding.
                #[cfg(not(target_os = "windows"))]
                let _ = std::process::Command::new("sh")
                    .args(["-c", "lsof -ti :3000 | xargs kill -9 2>/dev/null"])
                    .output();
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %a"])
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                        .output();
                }

                let result = app
                    .shell()
                    .sidecar("inbill-server")
                    .expect("inbill-server sidecar not bundled")
                    .env("PORT", "3000")
                    .env("DEPLOYMENT_MODE", "local")
                    .env("DATABASE_URL", &db_url)
                    .env("POS_DIST_PATH",    pos_dist.to_string_lossy().as_ref())
                    .env("MOBILE_DIST_PATH", mobile_dist.to_string_lossy().as_ref())
                    .spawn();

                match result {
                    Ok((_rx, child)) => {
                        *server_handle.lock().unwrap() = Some(child);

                        // Poll up to 60 s (120 × 500 ms) — first run includes
                        // migrations which can take a few seconds.
                        // Use an HTTP GET rather than a bare TCP connect so we only
                        // navigate once the server is actually serving responses.
                        let mut ready = false;
                        for _ in 0..120 {
                            tokio::time::sleep(Duration::from_millis(500)).await;
                            if http_health_check() {
                                ready = true;
                                break;
                            }
                        }

                        if ready {
                            if let Some(win) = app.get_webview_window("main") {
                                // Navigate the webview to the local server.
                                // From http://localhost:3000 the POS api.ts uses
                                // relative paths which resolve correctly.
                                let _ = win.eval("window.location.href = 'http://localhost:3000'");
                                let _ = win.set_focus();
                            }
                        } else {
                            // Server didn't come up in time — show an error in the splash.
                            set_status(&app, "Failed to start. Check logs and relaunch.");
                            eprintln!("[inbill] server did not respond within 60 s");
                        }
                    }
                    Err(e) => {
                        set_status(&app, "Failed to launch server. Please relaunch.");
                        eprintln!("[inbill] failed to start server: {e}");
                    }
                }
            }
            Err(e) => {
                set_status(&app, "Failed to start database. Please relaunch.");
                eprintln!("[inbill] failed to start postgres: {e}");
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn shutdown(app: &tauri::AppHandle, server_handle: ServerHandle, pg_handle: PgHandle) {
    if let Some(child) = server_handle.lock().unwrap().take() {
        let _ = child.kill();
    }
    let pg = pg_handle.lock().unwrap().take();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(debug_assertions))]
    let server_handle: ServerHandle = Arc::new(Mutex::new(None));
    #[cfg(not(debug_assertions))]
    let pg_handle: PgHandle = Arc::new(Mutex::new(None));

    #[cfg(not(debug_assertions))]
    let (server_for_setup, server_for_tray) = (server_handle.clone(), server_handle.clone());
    #[cfg(not(debug_assertions))]
    let (pg_for_setup, pg_for_tray) = (pg_handle.clone(), pg_handle.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![print_window])
        .setup(move |app| {
            let show = MenuItem::with_id(app, "show", "Open InBill", true, None::<&str>)?;
            let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event({
                    #[cfg(not(debug_assertions))]
                    let server_handle = server_for_tray.clone();
                    #[cfg(not(debug_assertions))]
                    let pg_handle = pg_for_tray.clone();
                    move |app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            #[cfg(not(debug_assertions))]
                            shutdown(app, server_handle.clone(), pg_handle.clone());
                            #[cfg(debug_assertions)]
                            app.exit(0);
                        }
                        _ => {}
                    }
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
            // each stage completes, then the webview navigates to localhost:3000.
            #[cfg(not(debug_assertions))]
            spawn_server(app.handle(), server_for_setup, pg_for_setup);

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
