// Huriye Kayadelen, 2200005795
import { strictEqual, throws } from "node:assert";
import { configuration } from "../src/config.ts";
import { freshApp } from "./helpers.ts";
import { jwtOwner, signToken } from "../src/jwt.ts";
Deno.test("configuration rejects bad ports and default production secrets", () => {
  throws(() => configuration({ PORT: "-1" }));
  throws(() => configuration({ APP_ENV: "production" }));
  strictEqual(configuration({}).PORT, 8000);
});
Deno.test("health and readiness distinguish process and database availability", async () => {
  using app = await freshApp();
  strictEqual((await app.request("/healthz")).status, 200);
  strictEqual((await app.request("/readyz")).status, 200);
  app.database.client.close();
  strictEqual((await app.request("/readyz")).status, 503);
  strictEqual((await app.request("/healthz")).status, 200);
});
Deno.test("JWT verifies owner, signature and expiry", async () => {
  const secret = "01234567890123456789012345678901";
  const token = await signToken(12, secret);
  strictEqual(await jwtOwner(token, secret), 12);
  strictEqual(await jwtOwner(token, secret + "x"), null);
  strictEqual(await jwtOwner(await signToken(12, secret, -1), secret), null);
});
