const mode = (process.env["DEPLOYMENT_MODE"] ?? "local") as "local" | "cloud"

export const config = {
  mode,
  isCloud: mode === "cloud",
  isLocal: mode === "local",

  port: Number(process.env["PORT"] ?? 3005),

  db: {
    url: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5433/inbill",
  },

  jwt: {
    secret: process.env["JWT_SECRET"] ?? "dev-secret-change-in-production",
    accessExpiresIn: "8h",
    refreshExpiresIn: "30d",
  },

  // Cloud sync endpoint (local mode only)
  cloud: {
    apiUrl: process.env["CLOUD_API_URL"] ?? "https://api.inbill.app",
    syncIntervalMs: 10_000,
  },

  ai: {
    anthropicApiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
  },

  email: {
    resendApiKey: process.env["RESEND_API_KEY"] ?? "",
    fromEmail: process.env["FROM_EMAIL"] ?? "noreply@inbill.app",
    appUrl: process.env["APP_URL"] ?? "http://localhost:5173",
  },

  // Static file paths served by this server
  static: {
    pos: process.env["POS_DIST_PATH"] ?? "../pos/dist",
    mobile: process.env["MOBILE_DIST_PATH"] ?? "../mobile/dist",
  },
} as const
