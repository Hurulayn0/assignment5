// Huriye Kayadelen, 2200005795
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { clearFailures, recordFailure, retryAfter } from "./login_limits.ts";
import { attachmentRoutes } from "./attachments.ts";
import { LiveUpdates } from "./live.ts";
import { userIdFromToken } from "./auth.ts";
import { jwtOwner, signToken } from "./jwt.ts";
import { taskSummary } from "./summary.ts";
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
const publicTask = {
  id: tasks.id,
  userId: tasks.userId,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  createdAt: tasks.createdAt,
};
const ownedTask = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt));

export function createApp(database: Db, jwtSecret?: string, uploadFolder = "uploads") {
  const { db } = database;
  const app = new Hono<Env>();
  app.use("/api/*", requireAuth(database, jwtSecret));
  const live = new LiveUpdates();
  attachmentRoutes(app, database, uploadFolder);
  app.get("/ws", async (c) => {
    const query = z.strictObject({ token: z.tuple([z.string().min(1)]) }).safeParse(
      c.req.queries(),
    );
    if (!query.success) return c.json({ error: "unauthorized", issues: [] }, 401);
    const token = query.data.token[0];
    const userId = jwtSecret
      ? await jwtOwner(token, jwtSecret)
      : await userIdFromToken(database, token);
    if (!userId) return c.json({ error: "unauthorized", issues: [] }, 401);
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ error: "WebSocket upgrade required", issues: [] }, 400);
    }
    return live.connect(c.req.raw, userId);
  });
  app.get("/healthz", noQuery, (c) => c.json({ ok: true }));
  app.get("/readyz", noQuery, async (c) => {
    try {
      await database.client.execute("SELECT 1");
      return c.json({ ready: true });
    } catch {
      return c.json({ ready: false, error: "database unavailable", issues: [] }, 503);
    }
  });
  app.get("/health", noQuery, (c) => c.json({ ok: true }));

  app.post("/auth/register", noQuery, async (c) => {
    const parsed = credentials.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const { email, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    const user = await db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({ email, passwordHash })
        .onConflictDoNothing({ target: users.email }).returning({
          id: users.id,
          email: users.email,
        });
      if (created) {
        await tx.insert(tasks).values({
          userId: created.id,
          title: "Welcome! Plan your first task.",
        });
      }
      return created;
    });
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
    const wait = await retryAfter(database, email);
    if (wait) {
      c.header("Retry-After", String(wait));
      return c.json({ error: "too many login attempts", issues: [] }, 429);
    }
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || !(await checkPassword(password, user.passwordHash))) {
      await recordFailure(database, email);
      return c.json({ error: "invalid email or password", issues: [] }, 401);
    }
    await clearFailures(database, email);
    return c.json({
      token: jwtSecret
        ? await signToken(user.id, jwtSecret)
        : await createSession(database, user.id),
    });
  });

  app.get(
    "/api/me/summary",
    noQuery,
    async (c) => c.json(await taskSummary(database, c.get("userId"))),
  );
  app.get("/api/tasks", async (c) => {
    const parsed = listQuery.safeParse(c.req.queries());
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
    }
    const { page, limit, status } = parsed.data;
    const owner = and(eq(tasks.userId, c.get("userId")), isNull(tasks.deletedAt));
    const filter = status === undefined ? owner : and(owner, eq(tasks.status, status));
    const [{ total }] = await db.select({ total: count() }).from(tasks).where(filter);
    const offset = (page - 1) * limit;
    // An empty page needs no SQLite offset, even for very large page numbers.
    const items = offset >= total
      ? []
      : await db.select(publicTask).from(tasks).where(filter)
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
      .values({
        ...parsed.data,
        userId: c.get("userId"),
        doneAt: parsed.data.status === "done" ? Math.floor(Date.now() / 1000) : null,
      }).returning(publicTask);
    live.send(c.get("userId"), "created", task);
    return c.json(task, 201);
  });

  app.get("/api/tasks/:id", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [task] = await db.select(publicTask).from(tasks).where(
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
    const [task] = await db.update(tasks).set({
      ...parsed.data,
      doneAt: parsed.data.status === "done"
        ? sql`coalesce(${tasks.doneAt},unixepoch())`
        : null,
    })
      .where(ownedTask(id.data, c.get("userId"))).returning(publicTask);
    if (task) live.send(c.get("userId"), "updated", task);
    return task ? c.json(task) : c.json(notFound, 404);
  });

  app.delete("/api/tasks/:id", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [task] = await db.update(tasks).set({
      deletedAt: Math.floor(Date.now() / 1000),
    }).where(ownedTask(id.data, c.get("userId")))
      .returning({ id: tasks.id });
    if (task) live.send(c.get("userId"), "deleted", task);
    return task ? c.json({ ok: true }) : c.json(notFound, 404);
  });

  app.post("/api/tasks/:id/restore", noQuery, async (c) => {
    const id = positiveInteger.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [row] = await db.update(tasks).set({ deletedAt: null }).where(
      and(
        eq(tasks.id, id.data),
        eq(tasks.userId, c.get("userId")),
        isNotNull(tasks.deletedAt),
      ),
    ).returning(publicTask);
    return row ? c.json(row) : c.json(notFound, 404);
  });
  app.get("/api/admin/users", noQuery, async (c) => {
    const account = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId")),
      columns: { role: true },
    });
    if (account?.role !== "admin") return c.json({ error: "forbidden", issues: [] }, 403);
    return c.json(
      await db.select({ id: users.id, email: users.email, role: users.role }).from(users)
        .orderBy(users.id),
    );
  });
  app.notFound((c) => c.json(notFound, 404));
  app.onError((error, c) => {
    console.error(error.name);
    return c.json({ error: "internal server error", issues: [] }, 500);
  });
  return app;
}
