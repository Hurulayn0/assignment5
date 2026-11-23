// Huriye Kayadelen, 2200005795
import { strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
import { createApp } from "../src/app.ts";
import { signToken } from "../src/jwt.ts";
Deno.test("JWT login works without session rows and rejects three invalid tokens", async () => {
  using fixture = await freshApp();
  const secret = "01234567890123456789012345678901";
  const app = createApp(fixture.database, secret);
  const request = {
    method: "POST",
    body: JSON.stringify({ email: "jwt@example.com", password: "unique-test-123" }),
  };
  strictEqual((await app.request("/auth/register", request)).status, 201);
  const { token } = await (await app.request("/auth/login", request)).json();
  const get = (value: string) =>
    app.request("/api/tasks", { headers: { Authorization: "Bearer " + value } });
  strictEqual((await get(token)).status, 200);
  strictEqual((await fixture.database.db.query.sessions.findMany()).length, 0);
  const parts = token.split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  for (
    const bad of [
      parts.join("."),
      await signToken(1, secret, -1),
      await signToken(1, secret + "x"),
    ]
  ) strictEqual((await get(bad)).status, 401);
});
