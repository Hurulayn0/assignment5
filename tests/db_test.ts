// STUDENT NAME, STUDENT NUMBER
import { deepStrictEqual, ok } from "node:assert";
import { tasks, users } from "../src/schema.ts";
import { freshApp } from "./helpers.ts";

Deno.test("Drizzle can insert and read a task with SQLite defaults", async () => {
  using app = await freshApp();
  const { db } = app.database;
  const [owner] = await db.insert(users)
    .values({ email: "owner@example.com", passwordHash: "test-fixture" })
    .returning({ id: users.id });

  await db.insert(tasks).values({ userId: owner.id, title: "Review lecture notes" });
  const task = await db.query.tasks.findFirst();
  ok(task);
  deepStrictEqual(task.userId, owner.id);
  deepStrictEqual(task.title, "Review lecture notes");
  deepStrictEqual(task.status, "todo");
  deepStrictEqual(task.priority, "medium");
  ok(Math.abs(task.createdAt - Math.floor(Date.now() / 1000)) <= 5);
});
