import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { jwtVerify, SignJWT } from "jose"
import type { TokenPayload } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { config } from "../config.js"

const secret = new TextEncoder().encode(config.jwt.secret)

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.jwt.accessExpiresIn)
    .sign(secret)
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as TokenPayload
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing token" })
  }
  try {
    const token = header.slice(7)
    const payload = await verifyToken(token)
    c.set("user", payload)
    await next()
  } catch {
    throw new HTTPException(401, { message: "Invalid token" })
  }
})

export const requireRole = (...roles: TokenPayload["role"][]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user")
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: "Insufficient permissions" })
    }
    await next()
  })
