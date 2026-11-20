// STUDENT NAME, STUDENT NUMBER
import { deepStrictEqual, ok } from "node:assert";
import { checkPassword } from "../src/auth.ts";
import { freshApp } from "./helpers.ts";

const credentials = { email: "deniz@example.com", password: "sample-1234" };

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

Deno.test("register returns public fields and stores a bcrypt hash", async () => {
  using app = await freshApp();
  const response = await app.request("/auth/register", post(credentials));
  deepStrictEqual(response.status, 201);
  deepStrictEqual(await response.json(), { id: 1, email: credentials.email });
  const user = await app.database.db.query.users.findFirst();
  ok(user);
  ok(user.passwordHash !== credentials.password);
  ok(await checkPassword(credentials.password, user.passwordHash));
});

Deno.test("duplicate email returns 409 even with different capitalization", async () => {
  using app = await freshApp();
  const first = await app.request("/auth/register", post(credentials));
  const second = await app.request(
    "/auth/register",
    post({ ...credentials, email: credentials.email.toUpperCase() }),
  );
  deepStrictEqual(first.status, 201);
  deepStrictEqual(second.status, 409);
  deepStrictEqual(await second.json(), { error: "email already registered", issues: [] });
});

Deno.test("registration rejects an invalid email and a short password", async () => {
  using app = await freshApp();
  const response = await app.request(
    "/auth/register",
    post({ email: "invalid", password: "short" }),
  );
  deepStrictEqual(response.status, 400);
  const body = await response.json();
  deepStrictEqual(body.error, "validation failed");
  deepStrictEqual(body.issues.map((issue: { path: string[] }) => issue.path), [
    ["email"],
    ["password"],
  ]);
});

Deno.test("malformed JSON returns a validation error", async () => {
  using app = await freshApp();
  const response = await app.request("/auth/login", { ...post({}), body: "{" });
  deepStrictEqual(response.status, 400);
  const body = await response.json();
  deepStrictEqual(body.error, "validation failed");
  ok(body.issues.length > 0);
});

Deno.test("wrong password and unknown email return the same 401 body", async () => {
  using app = await freshApp();
  await app.request("/auth/register", post(credentials));
  const wrong = await app.request(
    "/auth/login",
    post({ ...credentials, password: "wrong-123" }),
  );
  const missing = await app.request(
    "/auth/login",
    post({ ...credentials, email: "other@example.com" }),
  );
  deepStrictEqual(wrong.status, 401);
  deepStrictEqual(missing.status, 401);
  const error = { error: "invalid email or password", issues: [] };
  deepStrictEqual(await wrong.json(), error);
  deepStrictEqual(await missing.json(), error);
});

Deno.test("login token authenticates its owner and fails after expiry", async () => {
  using app = await freshApp();
  app.get("/api/test-owner", (c) => c.json({ userId: c.get("userId") }));
  await app.request("/auth/register", post(credentials));
  const login = await app.request("/auth/login", post(credentials));
  deepStrictEqual(login.status, 200);
  const { token } = await login.json();
  ok(typeof token === "string" && token.length > 0);

  const options = { headers: { Authorization: `Bearer ${token}` } };
  const authenticated = await app.request("/api/test-owner", options);
  deepStrictEqual(authenticated.status, 200);
  deepStrictEqual(await authenticated.json(), { userId: 1 });

  await app.database.client.execute("UPDATE sessions SET expires_at = 0");
  const expired = await app.request("/api/test-owner", options);
  deepStrictEqual(expired.status, 401);
});

Deno.test("protected routes reject missing and unknown bearer tokens", async () => {
  using app = await freshApp();
  app.get("/api/test-owner", (c) => c.json({ userId: c.get("userId") }));
  for (
    const headers of [new Headers(), new Headers({ Authorization: "Bearer unknown" })]
  ) {
    const response = await app.request("/api/test-owner", { headers });
    deepStrictEqual(response.status, 401);
    deepStrictEqual(await response.json(), { error: "unauthorized", issues: [] });
  }
});
