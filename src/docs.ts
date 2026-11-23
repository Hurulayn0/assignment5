// Huriye Kayadelen, 2200005795
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "./auth.ts";
import { taskPriorities, taskStatuses } from "./schema.ts";
const message = z.object({
  error: z.string(),
  issues: z.array(z.unknown()),
  requestId: z.string().optional(),
});
const ok = z.object({ ok: z.boolean() });
const id = z.number().int();
const account = z.object({ id, email: z.email() });
const task = z.object({
  estimateMinutes: z.number().int().nullable(),
  id,
  userId: id,
  title: z.string(),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  createdAt: id,
});
const json = (schema: z.ZodType) => ({ "application/json": { schema } });
export function configureDocs(
  app: OpenAPIHono<Env>,
  credentials: z.ZodType,
  taskInput: z.ZodType,
) {
  app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
    type: "http",
    scheme: "bearer",
  });
  function operation(
    method: "get" | "post" | "put" | "delete",
    path: string,
    success: z.ZodType,
    errors: number[],
    body?: z.ZodType,
    status = 200,
  ) {
    const responses: Record<
      number,
      { description: string; content: ReturnType<typeof json> }
    > = {
      [status]: { description: "Success", content: json(success) },
    };
    for (const code of errors) {
      responses[code] = { description: "Request failed", content: json(message) };
    }
    const route = createRoute({
      method,
      path,
      responses,
      security: path.startsWith("/api/") ? [{ Bearer: [] }] : [],
      request: {
        ...(body ? { body: { required: true, content: json(body) } } : {}),
        ...(path.includes("{id}")
          ? { params: z.object({ id: z.string().regex(/^\d+$/) }) }
          : {}),
        ...(path === "/api/tasks" && method === "get"
          ? {
            query: z.object({
              page: z.coerce.number().int().min(1).default(1),
              limit: z.coerce.number().int().min(1).max(100).default(20),
              status: z.enum(taskStatuses).optional(),
            }),
          }
          : {}),
      },
    });
    app.openAPIRegistry.registerPath(route);
  }
  operation("get", "/health", ok, [400]);
  operation("get", "/healthz", ok, [400]);
  operation("get", "/readyz", z.object({ ready: z.boolean() }), [400, 503]);
  operation("post", "/auth/register", account, [400, 409], credentials, 201);
  operation(
    "post",
    "/auth/login",
    z.object({ token: z.string() }),
    [400, 401, 429],
    credentials,
  );
  operation(
    "get",
    "/api/tasks",
    z.object({ items: z.array(task), page: id, limit: id, total: id }),
    [400, 401],
  );
  operation("post", "/api/tasks", task, [400, 401], taskInput, 201);
  operation("get", "/api/tasks/{id}", task, [400, 401, 404]);
  operation("put", "/api/tasks/{id}", task, [400, 401, 404], taskInput);
  operation("delete", "/api/tasks/{id}", ok, [400, 401, 404]);
  operation("post", "/api/tasks/{id}/restore", task, [400, 401, 404]);
  operation(
    "get",
    "/api/me/summary",
    z.object({ todo: id, "in-progress": id, done: id }),
    [400, 401],
  );
  operation(
    "get",
    "/api/admin/users",
    z.array(account.extend({ role: z.enum(["user", "admin"]) })),
    [400, 401, 403],
  );
  const attachment = "/api/tasks/{id}/attachment", params = z.object({ id: z.string() });
  const failures = Object.fromEntries(
    [400, 401, 404, 409, 413, 415].map(
      (n) => [n, { description: "Request failed", content: json(message) }],
    ),
  );
  app.openAPIRegistry.registerPath(createRoute({
    method: "post",
    path: attachment,
    security: [{ Bearer: [] }],
    request: {
      params,
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({ file: z.string().openapi({ format: "binary" }) }),
          },
        },
      },
    },
    responses: { 200: { description: "Stored", content: json(ok) }, ...failures },
  }));
  app.openAPIRegistry.registerPath(createRoute({
    method: "get",
    path: attachment,
    security: [{ Bearer: [] }],
    request: { params },
    responses: {
      200: {
        description: "Image bytes",
        content: {
          "image/png": { schema: z.string().openapi({ format: "binary" }) },
          "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
        },
      },
      ...failures,
    },
  }));
  app.openAPIRegistry.registerPath(createRoute({
    method: "get",
    path: "/ws",
    request: { query: z.object({ token: z.string() }) },
    responses: {
      101: { description: "WebSocket connection" },
      400: { description: "Upgrade required" },
      401: { description: "Invalid token" },
    },
  }));
  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "Assignment 5 Tasks API", version: "1.0.0" },
  });
  app.get(
    "/docs",
    (c) =>
      c.html(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tasks API</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head><body><main id="docs"></main><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:"/openapi.json",dom_id:"#docs"})</script></body></html>',
      ),
  );
}
