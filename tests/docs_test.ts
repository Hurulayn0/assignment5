// Huriye Kayadelen, 2200005795
import { ok, strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
Deno.test("documentation describes authenticated routes, task body and errors", async () => {
  using app = await freshApp();
  const res = await app.request("/openapi.json");
  strictEqual(res.status, 200);
  const doc = await res.json();
  const post = doc.paths["/api/tasks"].post;
  ok(post.requestBody.content["application/json"].schema);
  ok(post.responses["201"]);
  ok(post.responses["400"]);
  ok(post.security[0].Bearer);
  ok(doc.paths["/api/tasks/{id}"].put.responses["404"]);
  ok((await (await app.request("/docs")).text()).includes("/openapi.json"));
});
