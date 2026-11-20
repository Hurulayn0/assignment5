// STUDENT NAME, STUDENT NUMBER
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  checkPassword,
  createSession,
  type Env,
  hashPassword,
  requireAuth,
} from "./auth.ts";
import type { Db } from "./db.ts";
import { users } from "./schema.ts";

const credentials = z.strictObject({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    {
      message: "Password must fit within 72 UTF-8 bytes",
    },
  ),
});

export function createApp(database: Db) {
  const { db } = database;
  const app = new Hono<Env>();
  app.use("/api/*", requireAuth(database));
  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/auth/register", async (c) => {
    const parsed = credentials.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const { email, password } = parsed.data;
    const [user] = await db.insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });
    if (!user) return c.json({ error: "email already registered", issues: [] }, 409);
    return c.json(user, 201);
  });

  app.post("/auth/login", async (c) => {
    const parsed = credentials.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const { email, password } = parsed.data;
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || !(await checkPassword(password, user.passwordHash))) {
      return c.json({ error: "invalid email or password", issues: [] }, 401);
    }
    return c.json({ token: await createSession(database, user.id) });
  });

  app.notFound((c) => c.json({ error: "not found", issues: [] }, 404));
  app.onError((error, c) => {
    console.error(error.name);
    return c.json({ error: "internal server error", issues: [] }, 500);
  });
  return app;
}
