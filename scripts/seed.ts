// Huriye Kayadelen, 2200005795
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/auth.ts";
import { createDb, type Db, migrate } from "../src/db.ts";
import { tasks, taskStatuses, users } from "../src/schema.ts";

export async function seed({ db }: Db, environment: string) {
  if (environment === "production") throw new Error("Demo seed disabled in production");
  for (const email of ["planner@example.com", "reviewer@example.com"]) {
    const passwordHash = await hashPassword("demo-only-123");
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ email, passwordHash }).onConflictDoNothing();
      const [user] = await tx.select().from(users).where(eq(users.email, email));
      const existing = await tx.select({ id: tasks.id }).from(tasks).where(
        eq(tasks.userId, user.id),
      ).limit(1);
      if (!existing.length) {
        await tx.insert(tasks).values(Array.from({ length: 10 }, (_, i) => ({
          userId: user.id,
          title: "Review item " + (i + 1),
          status: taskStatuses[i % 3],
        })));
      }
    });
  }
}
if (import.meta.main) {
  const environment = Deno.env.get("APP_ENV") ?? "development";
  if (environment === "production") throw new Error("Demo seed disabled in production");
  const database = createDb(Deno.env.get("DATABASE_URL") ?? "file:./tasks.db");
  try {
    await migrate(database);
    await seed(database, environment);
  } finally {
    database.client.close();
  }
}
