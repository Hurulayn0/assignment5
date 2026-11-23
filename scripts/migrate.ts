// Huriye Kayadelen, 2200005795
import { createDb, migrate } from "../src/db.ts";
import { configuration } from "../src/config.ts";
const config = configuration(Deno.env.toObject());
const database = createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
try {
  await migrate(database);
} finally {
  database.client.close();
}
