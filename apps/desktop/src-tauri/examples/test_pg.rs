use pg_embed::pg_enums::PgAuthMethod;
use pg_embed::pg_fetch::{PgFetchSettings, PG_V15};
use pg_embed::postgres::{PgEmbed, PgSettings};
use std::net::TcpStream;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let data_dir = std::env::temp_dir().join("inbill_pg_test");
    println!("Data dir: {}", data_dir.display());

    println!("Starting postgres (will download ~100MB on first run)...");

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

    let mut pg = PgEmbed::new(pg_settings, fetch_settings)
        .await
        .expect("failed to create PgEmbed");

    pg.setup().await.expect("setup failed");
    println!("Setup done");

    pg.start_db().await.expect("failed to start postgres");
    println!("Postgres started");

    pg.create_database("inbill").await.expect("failed to create database");
    println!("Database 'inbill' created");

    // Verify it actually accepts connections
    match TcpStream::connect("127.0.0.1:5433") {
        Ok(_) => println!("Port 5433 is open — postgres is accepting connections"),
        Err(e) => println!("Could not connect to port 5433: {e}"),
    }

    println!("\nConnection string: postgresql://inbill:inbill_local@localhost:5433/inbill");
    println!("Stopping postgres...");

    pg.stop_db().await.expect("failed to stop postgres");
    println!("Done.");
}
