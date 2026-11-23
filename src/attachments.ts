// Huriye Kayadelen, 2200005795
import { and, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import type { Env } from "./auth.ts";
import type { Db } from "./db.ts";
import { tasks } from "./schema.ts";
export function attachmentRoutes(app: Hono<Env>, { db }: Db, folder: string) {
  const own = (id: string, userId: number) =>
    and(
      eq(tasks.id, /^\d+$/.test(id) ? Number(id) : -1),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
    );
  app.post("/api/tasks/:id/attachment", async (c) => {
    const filter = own(c.req.param("id"), c.get("userId"));
    const task = await db.query.tasks.findFirst({ where: filter });
    if (!task) return c.json({ error: "not found", issues: [] }, 404);
    const fields = await c.req.parseBody().catch(() => ({ file: undefined }));
    const file = fields.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file required", issues: [] }, 400);
    }
    if (file.size > 1000000) return c.json({ error: "file too large", issues: [] }, 413);
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      return c.json({ error: "unsupported image type", issues: [] }, 415);
    }
    const name = crypto.randomUUID() + (file.type === "image/png" ? ".png" : ".jpg");
    const path = folder + "/" + name;
    await Deno.mkdir(folder, { recursive: true });
    await Deno.writeFile(path, new Uint8Array(await file.arrayBuffer()), {
      createNew: true,
    });
    try {
      const [changed] = await db.update(tasks).set({ attachment: name })
        .where(
          and(
            filter,
            task.attachment
              ? eq(tasks.attachment, task.attachment)
              : isNull(tasks.attachment),
          ),
        ).returning({ id: tasks.id });
      if (!changed) {
        await Deno.remove(path);
        return c.json({ error: "task changed", issues: [] }, 409);
      }
    } catch (error) {
      await Deno.remove(path);
      throw error;
    }
    if (task.attachment) {
      await Deno.remove(folder + "/" + task.attachment).catch(() => {});
    }
    return c.json({ ok: true });
  });
  app.get("/api/tasks/:id/attachment", async (c) => {
    const task = await db.query.tasks.findFirst({
      where: own(c.req.param("id"), c.get("userId")),
    });
    if (!task?.attachment) return c.json({ error: "not found", issues: [] }, 404);
    const bytes = await Deno.readFile(folder + "/" + task.attachment);
    return new Response(bytes, {
      headers: {
        "Content-Type": task.attachment.endsWith(".png") ? "image/png" : "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
