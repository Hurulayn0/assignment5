// Huriye Kayadelen, 2200005795
import { deepStrictEqual, strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
import { createSession } from "../src/auth.ts";
import { seed } from "../scripts/seed.ts";
Deno.test("summary counts each status for the authenticated owner", async () => {
  using app = await freshApp();
  await seed(app.database, "test");
  const owner = await app.database.db.query.users.findFirst();
  if (!owner) throw Error("seed missing");
  const token = await createSession(app.database, owner.id);
  const response = await app.request("/api/me/summary", {
    headers: { Authorization: "Bearer " + token },
  });
  strictEqual(response.status, 200);
  deepStrictEqual(await response.json(), { todo: 4, "in-progress": 3, done: 3 });
});
