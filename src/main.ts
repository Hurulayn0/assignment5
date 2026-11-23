// Huriye Kayadelen, 2200005795
import { purgeOldDone } from "./purge.ts";
import { createApp } from "./app.ts";
import { createDb, migrate } from "./db.ts";
import { configuration } from "./config.ts";
import { TaskCache } from "./cache.ts";
import { LiveUpdates } from "./live.ts";
import { Pool } from "./pool.ts";
const config = configuration(Deno.env.toObject());
const open = () => createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
const first = open();
await migrate(first);
const local = config.DATABASE_URL.startsWith("file:");
const connections = local ? [first, open(), open()] : [first];
const kv = await Deno.openKv(config.KV_PATH);
const cache = new TaskCache(kv);
const live = new LiveUpdates();
for (const db of connections) {
  if (local) {
    await db.client.execute("PRAGMA journal_mode=WAL");
    await db.client.execute("PRAGMA busy_timeout=5000");
  }
}
const pool = new Pool(connections.map((database) => ({
  database,
  app: createApp(
    database,
    config.AUTH_MODE === "jwt" ? config.JWT_SECRET : undefined,
    config.UPLOAD_DIR,
    cache,
    live,
  ),
})));
Deno.cron("purge old done tasks", "0 3 * * *", async () => {
  const removed = await pool.use(({ database }) => purgeOldDone(database, 30, cache));
  console.log(JSON.stringify({ job: "purge", removed }));
});
Deno.serve({ port: config.PORT }, (request) => pool.use(({ app }) => app.fetch(request)));
