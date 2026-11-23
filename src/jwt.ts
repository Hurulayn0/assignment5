// Huriye Kayadelen, 2200005795
import { sign, verify } from "npm:hono@^4/jwt";
export async function signToken(userId: number, secret: string, ttl = 3600) {
  return await sign(
    { sub: String(userId), exp: Math.floor(Date.now() / 1000) + ttl },
    secret,
    "HS256",
  );
}
export async function jwtOwner(token: string, secret: string) {
  try {
    const claims = await verify(token, secret, "HS256");
    const id = Number(claims.sub);
    if (typeof claims.exp !== "number" || !Number.isSafeInteger(id) || id < 1) {
      return null;
    }
    return id;
  } catch {
    return null;
  }
}
