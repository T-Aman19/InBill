use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

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
        timeout: Some(Duration::from_secs(60)),
        migration_dir: None,
    };

    let fetch_settings = PgFetchSettings {
        version: PG_V15,
        ..Default::default()
    };

    let mut pg = PgEmbed::new(pg_settings, fetch_settings).await?;
    pg.setup().await?;

    // If postgres is already running (unclean quit from a previous session), skip start.
    let already_up = std::net::TcpStream::connect("127.0.0.1:5433").is_ok();
    if !already_up {
        pg.start_db().await?;
    }

    if let Err(e) = pg.create_database("inbill").await {
        if !e.to_string().contains("42P04") && !e.to_string().contains("already exists") {
            return Err(Box::new(e));
        }
    }

    Ok(pg)
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

        match start_postgres(data_dir).await {
            Ok(pg) => {
                let db_url = "postgresql://inbill:inbill_local@localhost:5433/inbill".to_string();
                *pg_handle.lock().unwrap() = Some(pg);

                // Kill anything already on port 3000 just before binding it
                let _ = std::process::Command::new("sh")
                    .args(["-c", "lsof -ti :3000 | xargs kill -9 2>/dev/null"])
                    .output();

                let result = app
                    .shell()
                    .sidecar("inbill-server")
                    .expect("inbill-server sidecar not bundled")
                    .env("PORT", "3000")
                    .env("DEPLOYMENT_MODE", "local")
                    .env("DATABASE_URL", &db_url)
                    .spawn();

                match result {
                    Ok((_rx, child)) => {
                        *server_handle.lock().unwrap() = Some(child);
                        for _ in 0..30 {
                            tokio::time::sleep(Duration::from_millis(500)).await;
                            if std::net::TcpStream::connect("127.0.0.1:3000").is_ok() {
                                break;
                            }
                        }
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    Err(e) => eprintln!("[inbill] failed to start server: {e}"),
                }
            }
            Err(e) => eprintln!("[inbill] failed to start postgres: {e}"),
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
            let _ = pg.stop_db().await;
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

    // Clones for each consumer: setup closure, tray event handler
    #[cfg(not(debug_assertions))]
    let (server_for_setup, server_for_tray) =
        (server_handle.clone(), server_handle.clone());
    #[cfg(not(debug_assertions))]
    let (pg_for_setup, pg_for_tray) =
        (pg_handle.clone(), pg_handle.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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

            #[cfg(not(debug_assertions))]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
                spawn_server(app.handle(), server_for_setup, pg_for_setup);
            }

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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running InBill desktop");
}
