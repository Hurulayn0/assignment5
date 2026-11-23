// Huriye Kayadelen, 2200005795
import { strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
import { createSession } from "../src/auth.ts";
import { tasks, users } from "../src/schema.ts";
import { purgeOldDone } from "../src/purge.ts";
Deno.test("admin list distinguishes anonymous, member and admin", async () => {
  using app = await freshApp();
  strictEqual((await app.request("/api/admin/users")).status, 401);
  for (const role of ["user", "admin"] as const) {
    const [account] = await app.database.db.insert(users).values({
      role,
      email: role + "@example.com",
      passwordHash: "fixture",
    }).returning();
    const token = await createSession(app.database, account.id);
    strictEqual(
      (await app.request("/api/admin/users", {
        headers: { Authorization: "Bearer " + token },
      })).status,
      role === "admin" ? 200 : 403,
    );
  }
});
Deno.test("registration rolls back when the welcome task insert fails", async () => {
  using app = await freshApp();
  await app.database.client.execute(
    "CREATE TRIGGER stop_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'test rollback'); END",
  );
  const response = await app.request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: "rollback@example.com", password: "rollback123" }),
  });
  strictEqual(response.status, 500);
  strictEqual((await app.database.db.query.users.findMany()).length, 0);
});
Deno.test("deletion hides a task until its owner restores it", async () => {
  using app = await freshApp();
  const [user] = await app.database.db.insert(users).values({
    email: "restore@example.com",
    passwordHash: "fixture",
  }).returning();
  const token = await createSession(app.database, user.id);
  const [task] = await app.database.db.insert(tasks).values({
    title: "Restore",
    userId: user.id,
  }).returning();
  const headers = { Authorization: "Bearer " + token };
  const path = "/api/tasks/" + task.id;
  strictEqual((await app.request(path, { method: "DELETE", headers })).status, 200);
  strictEqual((await (await app.request("/api/tasks", { headers })).json()).total, 0);
  strictEqual(
    (await app.request(path + "/restore", { method: "POST", headers })).status,
    200,
  );
  strictEqual(
    (await app.request(path + "/restore", { method: "POST", headers })).status,
    404,
  );
  strictEqual((await (await app.request("/api/tasks", { headers })).json()).total, 1);
});
Deno.test("purge removes only long-completed tasks and is idempotent", async () => {
  using app = await freshApp();
  const [user] = await app.database.db.insert(users).values({
    email: "purge@example.com",
    passwordHash: "fixture",
  }).returning();
  for (
    const [status, doneAt] of [["done", 1], ["done", Math.floor(Date.now() / 1000)], [
      "todo",
      null,
    ]] as const
  ) {
    await app.database.db.insert(tasks).values({
      title: "Fixture",
      userId: user.id,
      status,
      doneAt,
    });
  }
  strictEqual(await purgeOldDone(app.database), 1);
  strictEqual(await purgeOldDone(app.database), 0);
  strictEqual((await app.database.db.query.tasks.findMany()).length, 2);
});
