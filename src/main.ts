// Huriye Kayadelen, 2200005795
import { purgeOldDone } from "./purge.ts";
import { createApp } from "./app.ts";
import { createDb, migrate } from "./db.ts";
import { configuration } from "./config.ts";
const config = configuration(Deno.env.toObject());
const database = createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
await migrate(database);
Deno.cron("purge old done tasks", "0 3 * * *", async () => {
  console.log(JSON.stringify({ job: "purge", removed: await purgeOldDone(database) }));
});
Deno.serve(
  { port: config.PORT },
  createApp(database, config.AUTH_MODE === "jwt" ? config.JWT_SECRET : undefined).fetch,
);
