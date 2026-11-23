// Huriye Kayadelen, 2200005795
import { deepStrictEqual, ok } from "node:assert";
import { freshApp } from "./helpers.ts";

const route = "/api/tasks";
const notFound = { error: "not found", issues: [] };

async function signIn(app: Awaited<ReturnType<typeof freshApp>>, email: string) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "tasks-test-123" }),
  };
  const registered = await app.request("/auth/register", options);
  deepStrictEqual(registered.status, 201);
  const user = await registered.json();
  const login = await app.request("/auth/login", options);
  deepStrictEqual(login.status, 200);
  const { token } = await login.json();
  ok(typeof token === "string" && token.length > 0);
  return {
    id: user.id,
    request(path: string, method = "GET", body?: unknown) {
      return app.request(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

async function createTask(user: Awaited<ReturnType<typeof signIn>>, body: unknown) {
  const response = await user.request(route, "POST", body);
  deepStrictEqual(response.status, 201);
  return await response.json();
}

Deno.test("a user creates, reads, updates and deletes a task", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  const task = await createTask(owner, { title: "  Review API contract  " });
  deepStrictEqual(task, {
    id: 2,
    userId: owner.id,
    title: "Review API contract",
    status: "todo",
    priority: "medium",
    createdAt: task.createdAt,
  });
  ok(Number.isInteger(task.createdAt));
  const path = `${route}/${task.id}`;

  const read = await owner.request(path);
  deepStrictEqual(read.status, 200);
  deepStrictEqual(await read.json(), task);

  const replacement = { title: "Approve API contract", status: "done", priority: "high" };
  const update = await owner.request(path, "PUT", replacement);
  deepStrictEqual(update.status, 200);
  deepStrictEqual(await update.json(), { ...task, ...replacement });

  const remove = await owner.request(path, "DELETE");
  deepStrictEqual(remove.status, 200);
  deepStrictEqual(await remove.json(), { ok: true });
  for (const [method, body] of [["GET"], ["PUT", replacement], ["DELETE"]] as const) {
    const missing = await owner.request(path, method, body);
    deepStrictEqual(missing.status, 404);
    deepStrictEqual(await missing.json(), {
      ...notFound,
      requestId: missing.headers.get("x-request-id"),
    });
  }
});

Deno.test("PUT applies the same defaults as POST", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  const task = await createTask(owner, {
    title: "First draft",
    status: "done",
    priority: "high",
  });
  const update = await owner.request(`${route}/${task.id}`, "PUT", {
    title: "New draft",
  });
  deepStrictEqual(update.status, 200);
  deepStrictEqual(await update.json(), {
    ...task,
    title: "New draft",
    status: "todo",
    priority: "medium",
  });
});

Deno.test("every task route requires authentication", async () => {
  using app = await freshApp();
  for (
    const [method, path] of [
      ["GET", route],
      ["POST", route],
      ["GET", route + "/1"],
      ["PUT", route + "/1"],
      ["DELETE", route + "/1"],
    ]
  ) {
    const response = await app.request(path, { method });
    deepStrictEqual(response.status, 401);
    deepStrictEqual(await response.json(), { error: "unauthorized", issues: [] });
  }
});

Deno.test("another user's task is absent from list, read, update and delete", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  const other = await signIn(app, "other@example.com");
  const task = await createTask(owner, { title: "Owner's private task", status: "done" });
  const ownTask = await createTask(other, { title: "Other user's task", status: "done" });
  const path = `${route}/${task.id}`;

  for (
    const [method, body] of [["GET"], ["PUT", { title: "Changed" }], ["DELETE"]] as const
  ) {
    const response = await other.request(path, method, body);
    deepStrictEqual(response.status, 404);
    deepStrictEqual(await response.json(), {
      ...notFound,
      requestId: response.headers.get("x-request-id"),
    });
  }
  const list = await other.request(route + "?status=done");
  deepStrictEqual(list.status, 200);
  deepStrictEqual(await list.json(), { items: [ownTask], page: 1, limit: 20, total: 1 });
  deepStrictEqual(await (await owner.request(path)).json(), task);
});

Deno.test("create and update reject invalid task bodies", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  const task = await createTask(owner, { title: "Original" });
  const path = `${route}/${task.id}`;
  for (const [method, endpoint] of [["POST", route], ["PUT", path]]) {
    for (
      const body of [
        {},
        { title: " " },
        { title: "a".repeat(101) },
        { title: "Valid", status: "invalid" },
        { title: "Valid", priority: "urgent" },
        { title: "Valid", userId: 999 },
      ]
    ) {
      const response = await owner.request(endpoint, method, body);
      deepStrictEqual(response.status, 400);
      const fault = await response.json();
      deepStrictEqual(fault.error, "validation failed");
      ok(Array.isArray(fault.issues) && fault.issues.length > 0);
    }
  }
  deepStrictEqual(await (await owner.request(path)).json(), task);
});

Deno.test("page two returns the correct task and filtered count", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  await createTask(owner, { title: "Prepare notes", status: "done" });
  await createTask(owner, { title: "Open task" });
  await createTask(owner, { title: "Send notes", status: "done" });
  const last = await createTask(owner, { title: "Archive notes", status: "done" });

  const page = await owner.request(route + "?status=done&page=2&limit=2");
  deepStrictEqual(page.status, 200);
  deepStrictEqual(await page.json(), { items: [last], page: 2, limit: 2, total: 3 });
  const empty = await owner.request(
    route + "?status=done&page=9007199254740991&limit=100",
  );
  deepStrictEqual(empty.status, 200);
  deepStrictEqual(await empty.json(), {
    items: [],
    page: 9007199254740991,
    limit: 100,
    total: 3,
  });
});

Deno.test("list rejects invalid, repeated and unknown query parameters", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  for (
    const query of [
      "page=0",
      "page=1.5",
      "page=abc",
      "page=",
      "page=9007199254740992",
      "page=1&page=2",
      "limit=0",
      "limit=101",
      "status=unknown",
      "other=value",
    ]
  ) {
    const response = await owner.request(`${route}?${query}`);
    deepStrictEqual(response.status, 400, query);
    deepStrictEqual((await response.json()).error, "validation failed");
  }
  const unsupported = await owner.request(route + "/1?status=todo");
  deepStrictEqual(unsupported.status, 400);
  const health = await app.request("/health?unexpected=1");
  deepStrictEqual(health.status, 400);
});

Deno.test("an invalid task identifier returns the same 404 as a missing task", async () => {
  using app = await freshApp();
  const owner = await signIn(app, "owner@example.com");
  for (const id of ["xyz", "1.5", "0", "9007199254740992"]) {
    const response = await owner.request(`${route}/${id}`);
    deepStrictEqual(response.status, 404);
    deepStrictEqual(await response.json(), {
      ...notFound,
      requestId: response.headers.get("x-request-id"),
    });
  }
});
