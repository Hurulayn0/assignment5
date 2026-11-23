// Huriye Kayadelen, 2200005795
import { rejects, strictEqual } from "node:assert";
import { seed } from "../scripts/seed.ts";
import { freshApp } from "./helpers.ts";
Deno.test("seed refuses production and is idempotent for demo accounts", async () => {
  using app = await freshApp();
  await rejects(seed(app.database, "production"), /disabled/);
  strictEqual((await app.database.db.query.users.findMany()).length, 0);
  for (let run = 0; run < 2; run++) {
    await seed(app.database, "test");
    strictEqual((await app.database.db.query.users.findMany()).length, 2);
    strictEqual((await app.database.db.query.tasks.findMany()).length, 20);
  }
});
