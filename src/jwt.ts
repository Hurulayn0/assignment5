// Huriye Kayadelen, 2200005795
import { jwtVerify, SignJWT } from "jose";
const encode = (secret: string) => new TextEncoder().encode(secret);
export function signToken(userId: number, secret: string, ttl = 3600) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(encode(secret));
}
export async function jwtOwner(token: string, secret: string) {
  try {
    const { payload } = await jwtVerify(token, encode(secret), {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub"],
    });
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
