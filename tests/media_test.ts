// Huriye Kayadelen, 2200005795
import { deepStrictEqual, strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
import { createSession } from "../src/auth.ts";
import { createApp } from "../src/app.ts";
import { tasks, users } from "../src/schema.ts";
Deno.test("attachments enforce owner, size and type and preserve bytes", async () => {
  using fixture = await freshApp();
  const folder = await Deno.makeTempDir();
  try {
    const app = createApp(fixture.database, undefined, folder);
    const [owner, other] = await fixture.database.db.insert(users).values(
      ["one", "two"].map((n) => ({ email: n + "@example.com", passwordHash: "fixture" })),
    ).returning();
    const [task] = await fixture.database.db.insert(tasks).values({
      title: "Photo",
      userId: owner.id,
    }).returning();
    const headers = {
      Authorization: "Bearer " + await createSession(fixture.database, owner.id),
    };
    const path = "/api/tasks/" + task.id + "/attachment";
    for (
      const [file, status] of [
        [null, 400],
        [new File(["text"], "x", { type: "text/plain" }), 415],
        [new File([new Uint8Array(1000001)], "x", { type: "image/png" }), 413],
        [new File(["sample"], "original.png", { type: "image/png" }), 200],
      ] as const
    ) {
      const body = new FormData();
      if (file) body.set("file", file);
      strictEqual(
        (await app.request(path, { method: "POST", headers, body })).status,
        status,
      );
    }
    const result = await app.request(path, { headers });
    strictEqual(result.headers.get("content-type"), "image/png");
    deepStrictEqual(await result.text(), "sample");
    strictEqual(
      (await app.request(path, {
        headers: {
          Authorization: "Bearer " + await createSession(fixture.database, other.id),
        },
      })).status,
      404,
    );
  } finally {
    await Deno.remove(folder, { recursive: true });
  }
});
Deno.test("WebSocket handshake rejects a bad token", async () => {
  using app = await freshApp();
  strictEqual((await app.request("/ws?token=unknown")).status, 401);
});
