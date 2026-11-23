// Huriye Kayadelen, 2200005795
import { createDb, migrate } from "../src/db.ts";
import { taskSummary } from "../src/summary.ts";
import { tasks, taskStatuses, users } from "../src/schema.ts";
import { eq } from "drizzle-orm";
const database = createDb("file::memory:");
try {
  await migrate(database);
  const { db, client } = database;
  for (let u = 1; u <= 20; u++) {
    const [owner] = await db.insert(users).values({
      email: "bench" + u + "@example.com",
      passwordHash: "benchmark",
    }).returning();
    for (let batch = 0; batch < 10; batch++) {
      await db.insert(tasks).values(
        Array.from(
          { length: 100 },
          (_, i) => ({
            userId: owner.id,
            title: "Benchmark " + i,
            status: taskStatuses[(batch * 100 + i) % 3],
          }),
        ),
      );
    }
  }
  await client.execute("DROP INDEX IF EXISTS idx_tasks_user_status");
  const query = "SELECT * FROM tasks WHERE user_id = ? AND status = ?";
  for (const label of ["before", "after"]) {
    if (label === "after") {
      await client.execute("CREATE INDEX idx_tasks_user_status ON tasks(user_id,status)");
    }
    const plan = await client.execute({
      sql: "EXPLAIN QUERY PLAN " + query,
      args: [2, "done"],
    });
    const start = performance.now();
    for (let i = 0; i < 20; i++) await client.execute({ sql: query, args: [2, "done"] });
    console.log(
      label,
      plan.rows[0].detail,
      ((performance.now() - start) / 20).toFixed(3),
      "ms per query",
    );
  }
  const ids = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, 2));
  const totals = { todo: 0, "in-progress": 0, done: 0 };
  for (const { id } of ids) {
    const [row] = await db.select({ status: tasks.status }).from(tasks).where(
      eq(tasks.id, id),
    );
    totals[row.status]++;
  }
  console.log("Naive:", 1 + ids.length, "queries; totals", JSON.stringify(totals));
  console.log(
    "GROUP BY:",
    1,
    "query; totals",
    JSON.stringify(await taskSummary(database, 2)),
  );
} finally {
  database.client.close();
}
