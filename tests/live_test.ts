// Huriye Kayadelen, 2200005795
import { deepStrictEqual, strictEqual } from "node:assert";
import { freshApp } from "./helpers.ts";
import { createSession } from "../src/auth.ts";
import { users } from "../src/schema.ts";
Deno.test("two owner clients see the same live change; another owner sees none", async () => {
  using app = await freshApp();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, app.fetch);
  const sockets: WebSocket[] = [];
  async function connect(token: string) {
    const socket = new WebSocket(
      "ws://127.0.0.1:" + server.addr.port + "/ws?token=" + token,
    );
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(Error("upgrade failed"));
    });
    return socket;
  }
  try {
    const [first, second] = await app.database.db.insert(users).values(
      ["a", "b"].map((n) => ({ email: n + "@example.com", passwordHash: "fixture" })),
    ).returning();
    const token = await createSession(app.database, first.id);
    const left = await connect(token),
      right = await connect(token),
      other = await connect(await createSession(app.database, second.id));
    let otherEvents = 0;
    other.onmessage = () => otherEvents++;
    const observe = (socket: WebSocket) =>
      new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error("missing owner event")), 3000);
        socket.onmessage = (e) => {
          clearTimeout(timeout);
          resolve(JSON.parse(e.data));
        };
      });
    const events = Promise.all([observe(left), observe(right)]);
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ title: "Live check" }),
    });
    const expected = { type: "created", task: await response.json() };
    deepStrictEqual(await events, [expected, expected]);
    strictEqual(otherEvents, 0);
  } finally {
    await Promise.all(sockets.map((socket) =>
      new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve();
        socket.addEventListener("close", () => resolve(), { once: true });
        socket.close();
      })
    ));
    await server.shutdown();
  }
});
