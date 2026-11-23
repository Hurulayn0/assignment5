// Huriye Kayadelen, 2200005795
import { ok, strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
Deno.test("login locks the sixth attempt and accepts a correct password after expiry", async () => {
  using app = await freshApp();
  const email = "rate@example.com";
  const request = (path: string, password: string) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  strictEqual((await request("/auth/register", "password123")).status, 201);
  for (let i = 0; i < 5; i++) {
    strictEqual((await request("/auth/login", "incorrect123")).status, 401);
  }
  const locked = await request("/auth/login", "password123");
  strictEqual(locked.status, 429);
  ok(Number(locked.headers.get("Retry-After")) > 0);
  await app.database.client.execute("UPDATE login_failures SET reset_at=0");
  strictEqual((await request("/auth/login", "password123")).status, 200);
});
