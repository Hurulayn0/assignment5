// Huriye Kayadelen, 2200005795
import { deepStrictEqual as assertEquals } from "node:assert";
import { freshApp } from "./helpers.ts";

Deno.test("GET /health answers 200 and { ok: true }", async () => {
  using app = await freshApp();
  const res = await app.request("/health");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test("unknown routes use the shared error shape", async () => {
  using app = await freshApp();
  const response = await app.request("/missing");
  assertEquals(response.status, 404);
  const requestId = response.headers.get("x-request-id");
  assertEquals(typeof requestId, "string");
  assertEquals(await response.json(), { error: "not found", issues: [], requestId });
});
