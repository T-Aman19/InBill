// SHA-256 hex hashing for opaque secrets (API keys, OAuth codes/tokens) — same
// pattern as owner_password_resets/owner_email_verifications in routes/auth.ts.
// Raw secrets are never persisted, only their hash.
export async function hashToken(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function generateRawToken(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map((b) => b.toString(16).padStart(2, "0")).join("")
}
