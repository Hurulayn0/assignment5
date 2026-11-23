// Huriye Kayadelen, 2200005795
import type { MiddlewareHandler } from "hono";
import { jwtOwner } from "./jwt.ts";
import bcrypt from "bcryptjs";
import type { Db } from "./db.ts";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

const SESSION_SECONDS = 60 * 60; // a session lives for one hour

/** Log a user in: store a random token for them and return it. */
export async function createSession(db: Db, userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.client.execute({
    sql:
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, strftime('%s','now') + ?)",
    args: [token, userId, SESSION_SECONDS],
  });
  return token;
}

/** Return the user id that owns a valid, unexpired token, or null. */
export async function userIdFromToken(db: Db, token: string): Promise<number | null> {
  const res = await db.client.execute({
    sql:
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > strftime('%s','now')",
    args: [token],
  });
  const id = res.rows[0]?.user_id;
  return id === undefined ? null : Number(id);
}

export type Env = { Variables: { userId: number } };

export const requireAuth =
  (db: Db, jwtSecret?: string): MiddlewareHandler<Env> => async (c, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
    const id = token
      ? (jwtSecret ? await jwtOwner(token, jwtSecret) : await userIdFromToken(db, token))
      : null;
    if (id === null) return c.json({ error: "unauthorized", issues: [] }, 401);
    c.set("userId", id);
    await next();
  };
