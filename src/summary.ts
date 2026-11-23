// Huriye Kayadelen, 2200005795
import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "./db.ts";
import { tasks } from "./schema.ts";
export async function taskSummary({ db }: Db, userId: number) {
  const totals = { todo: 0, "in-progress": 0, done: 0 };
  const rows = await db.select({ status: tasks.status, n: count() }).from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))).groupBy(tasks.status);
  for (const row of rows) totals[row.status] = row.n;
  return totals;
}
