// Huriye Kayadelen, 2200005795
import { createDb, migrate } from "../src/db.ts";
import { purgeOldDone } from "../src/purge.ts";
import { tasks, users } from "../src/schema.ts";
const db = createDb("file::memory:");
await migrate(db);
const [user] = await db.db.insert(users).values({
  email: "cron@example.com",
  passwordHash: "fixture",
}).returning();
await db.db.insert(tasks).values({
  title: "Old task",
  userId: user.id,
  status: "done",
  doneAt: 1,
});
const stop = new AbortController();
await Deno.cron("purge demonstration", "* * * * *", { signal: stop.signal }, async () => {
  console.log(JSON.stringify({ job: "purge", removed: await purgeOldDone(db) }));
  stop.abort();
});
db.client.close();
