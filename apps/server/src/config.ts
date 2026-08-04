const mode = (process.env["DEPLOYMENT_MODE"] ?? "local") as "local" | "cloud"

export const config = {
  mode,
  isCloud: mode === "cloud",
  isLocal: mode === "local",

  port: Number(process.env["PORT"] ?? 3005),

  // Business timezone used for report/date-range day boundaries (bills are stored in UTC)
  timezone: process.env["APP_TIMEZONE"] ?? "Asia/Kolkata",

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

  // Razorpay Subscriptions — managed cloud only. Plan ids come from the Razorpay
  // dashboard (one Plan per tier × cycle). Empty in local mode / when unset.
  razorpay: {
    keyId: process.env["RAZORPAY_KEY_ID"] ?? "",
    keySecret: process.env["RAZORPAY_KEY_SECRET"] ?? "",
    webhookSecret: process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "",
    // (tier, cycle) → Razorpay plan_id, built from every
    // RAZORPAY_PLAN_<TIER>_<MONTHLY|ANNUAL> env var — so adding a tier/cycle is
    // just an env var, no code change. Key format: `${tier}_${cycle}` (lowercased).
    // Tier names must be a single token (letters/digits, no underscore).
    planIds: Object.fromEntries(
      Object.entries(process.env).flatMap(([k, v]) => {
        const m = /^RAZORPAY_PLAN_([A-Z0-9]+)_(MONTHLY|ANNUAL)$/.exec(k)
        const tier = m?.[1]
        const cyc = m?.[2]
        return tier && cyc && v ? [[`${tier.toLowerCase()}_${cyc.toLowerCase()}`, v] as [string, string]] : []
      }),
    ) as Record<string, string>,
  },

  ai: {
    geminiApiKey: process.env["GEMINI_API_KEY"] ?? "",
    // Fast/cheap tier — menu descriptions, menu-import vision extraction
    geminiModel: process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash",
    // Deeper-reasoning tier — reports Q&A over a data snapshot
    geminiProModel: process.env["GEMINI_PRO_MODEL"] ?? "gemini-2.5-pro",
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
    host: process.env["HOST_DIST_PATH"] ?? "../host/dist",
  },
} as const

// Never ship the built-in dev secret to a cloud deployment — anyone could forge tokens.
if (config.isCloud && config.jwt.secret === "dev-secret-change-in-production") {
  throw new Error("JWT_SECRET must be set to a strong secret when DEPLOYMENT_MODE=cloud")
}
