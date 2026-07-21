// Staff PINs are hashed at rest (argon2id via Bun). Legacy rows may still hold a
// plaintext PIN — verifyPin transparently accepts those so existing logins keep
// working, and callers upgrade them to a hash on the next successful login.

export function isHashed(stored: string): boolean {
  return stored.startsWith("$")
}

export async function hashPin(pin: string): Promise<string> {
  return Bun.password.hash(pin, { algorithm: "argon2id" })
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  if (isHashed(stored)) {
    try {
      return await Bun.password.verify(pin, stored)
    } catch {
      return false
    }
  }
  return stored === pin // legacy plaintext
}
