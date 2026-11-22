// Huriye Kayadelen, 2200005795
import { and, asc, count, eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  checkPassword,
  createSession,
  type Env,
  hashPassword,
  requireAuth,
} from "./auth.ts";
import type { Db } from "./db.ts";
import { taskPriorities, tasks, taskStatuses, users } from "./schema.ts";

const credentials = z.strictObject({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    {
      message: "Password must fit within 72 UTF-8 bytes",
    },
  ),
});

const taskInput = z.strictObject({
  title: z.string().trim().min(1).max(100),
  status: z.enum(taskStatuses).default("todo"),
  priority: z.enum(taskPriorities).default("medium"),
});

const positiveInteger = z.string().regex(/^\d+$/, "Expected a positive integer")
  .transform(Number).pipe(z.int().min(1));

const listQuery = z.strictObject({
  page: z.tuple([positiveInteger]).transform(([page]) => page).default(1),
  limit: z.tuple([positiveInteger.pipe(z.int().max(100))])
    .transform(([limit]) => limit).default(20),
  status: z.tuple([z.enum(taskStatuses)]).transform(([status]) => status).optional(),
});

const emptyQuery = z.strictObject({});
const noQuery: MiddlewareHandler<Env> = async (c, next) => {
  const parsed = emptyQuery.safeParse(c.req.queries());
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
  }
  await next();
};

const notFound = { error: "not found", issues: [] };
const ownedTask = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId));

export function createApp(database: Db) {
  const { db } = database;
  const app = new Hono<Env>();
  app.use("/api/*", requireAuth(database));
  app.get("/health", noQuery, (c) => c.json({ ok: true }));

  app.post("/auth/register", noQuery, async (c) => {
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

  app.post("/auth/login", noQuery, async (c) => {
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

  app.get("/api/tasks", async (c) => {
    const parsed = listQuery.safeParse(c.req.queries());
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const { page, limit, status } = parsed.data;
    const owner = eq(tasks.userId, c.get("userId"));
    const filter = status === undefined ? owner : and(owner, eq(tasks.status, status));
    const [{ total }] = await db.select({ total: count() }).from(tasks).where(filter);
    const offset = (page - 1) * limit;
    // An empty page needs no SQLite offset, even for very large page numbers.
    const items = offset >= total ? [] : await db.select().from(tasks).where(filter)
      .orderBy(asc(tasks.id)).limit(limit).offset(offset);
    return c.json({ items, page, limit, total });
  });

  app.post("/api/tasks", noQuery, async (c) => {
    const parsed = taskInput.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const [task] = await db.insert(tasks)
      .values({ ...parsed.data, userId: c.get("userId") }).returning();
    return c.json(task, 201);
  });

  app.get("/api/tasks/:id", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [task] = await db.select().from(tasks).where(
      ownedTask(id.data, c.get("userId")),
    );
    return task ? c.json(task) : c.json(notFound, 404);
  });

  app.put("/api/tasks/:id", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const parsed = taskInput.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const [task] = await db.update(tasks).set(parsed.data)
      .where(ownedTask(id.data, c.get("userId"))).returning();
    return task ? c.json(task) : c.json(notFound, 404);
  });

  app.delete("/api/tasks/:id", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [task] = await db.delete(tasks).where(ownedTask(id.data, c.get("userId")))
      .returning({ id: tasks.id });
    return task ? c.json({ ok: true }) : c.json(notFound, 404);
  });

  app.notFound((c) => c.json(notFound, 404));
  app.onError((error, c) => {
    console.error(error.name);
    return c.json({ error: "internal server error", issues: [] }, 500);
  });
  return app;
}
