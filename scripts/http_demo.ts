// Huriye Kayadelen, 2200005795
// Run from the repository root. Print a reproducible transcript using a fresh database.
import { freshApp } from "../tests/helpers.ts";
import { createApp } from "../src/app.ts";
import { users } from "../src/schema.ts";
import { eq } from "drizzle-orm";
using fixture = await freshApp();
const folder = await Deno.makeTempDir();
const app = createApp(fixture.database, undefined, folder);
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, app.fetch);
const output: string[] = [];
let token = "";
async function curl(
  path: string,
  method: string,
  status: number,
  options: { auth?: boolean; body?: object; file?: string; quiet?: boolean } = {},
) {
  const args = ["-sS", "-w", "\\n%{http_code}", "-X", method];
  const command = [
    "curl -sS -w '\\n%{http_code}\\n' -X",
    method,
    "'${BASE}" + path + "'",
  ];
  command[2] = '"$BASE' + path + '"';
  if (options.auth) {
    args.push("-H", "Authorization: Bearer " + token);
    command.push('-H "Authorization: Bearer $TOKEN"');
  }
  if (options.body) {
    args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
    command.push(
      "-H 'Content-Type: application/json' --data '" + JSON.stringify(options.body) + "'",
    );
  }
  if (options.file) {
    args.push("-F", "file=@" + options.file + ";type=image/png");
    command.push("-F 'file=@sample.png;type=image/png'");
  }
  args.push("http://127.0.0.1:" + server.addr.port + path);
  const process = new Deno.Command(Deno.build.os === "windows" ? "curl.exe" : "curl", {
    args,
    stdin: options.body ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  if (options.body) {
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(options.body)));
    await writer.close();
  }
  const result = await process.output();
  const data = new TextDecoder().decode(result.stdout);
  const end = data.lastIndexOf("\n");
  if (!result.success || Number(data.slice(end + 1)) !== status) {
    throw Error(method + " " + path + " failed: " + data);
  }
  const body = data.slice(0, end);
  if (options.quiet) {
    output.push(
      command.join(" ").replace(
        "-w '\\n%{http_code}\\n'",
        "-o /dev/null -w '%{http_code}\\n'",
      ),
      "# " + status,
      "",
    );
  } else {
    const display = path === "/auth/login" ? '{"token":"[redacted]"}' : body;
    output.push(command.join(" "), "# " + display, "# " + status, "");
  }
  return body;
}
try {
  output.push(
    "Commands below use a POSIX shell. Start with an empty database, set BASE to the running API and set TOKEN to the login response's token. The upload uses a small local PNG named sample.png. Download and documentation checks print the HTTP status.",
    "",
    "~~~sh",
    "BASE=http://localhost:8000",
    "",
  );
  await curl("/health", "GET", 200);
  await curl("/healthz", "GET", 200);
  await curl("/readyz", "GET", 200);
  const credentials = { email: "demo@example.com", password: "demo-pass-123" };
  await curl("/auth/register", "POST", 201, { body: credentials });
  token = JSON.parse(await curl("/auth/login", "POST", 200, { body: credentials })).token;
  output.push("TOKEN='<token from login>'", "");
  const task = JSON.parse(
    await curl("/api/tasks", "POST", 201, {
      auth: true,
      body: { title: "Review API contract" },
    }),
  );
  const path = "/api/tasks/" + task.id;
  await curl("/api/tasks?status=todo&page=1&limit=2", "GET", 200, { auth: true });
  await curl(path, "GET", 200, { auth: true });
  await curl(path, "PUT", 200, {
    auth: true,
    body: { title: "Approved contract", status: "done", priority: "high" },
  });
  await curl("/api/me/summary", "GET", 200, { auth: true });
  const file = folder + "/sample.png";
  await Deno.writeFile(
    file,
    Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2UAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    ),
  );
  await curl(path + "/attachment", "POST", 200, { auth: true, file });
  await curl(path + "/attachment", "GET", 200, { auth: true, quiet: true });
  await curl(path, "DELETE", 200, { auth: true });
  await curl(path + "/restore", "POST", 200, { auth: true });
  await curl("/api/admin/users", "GET", 403, { auth: true });
  await fixture.database.db.update(users).set({ role: "admin" }).where(
    eq(users.email, credentials.email),
  );
  output.push("# After promoting the demo account in the test database", "");
  await curl("/api/admin/users", "GET", 200, { auth: true });
  await curl("/docs", "GET", 200, { quiet: true });
  await curl("/openapi.json", "GET", 200, { quiet: true });
  await curl("/ws?token=unknown", "GET", 401);
  output.push("~~~", "");
  console.log("TRANSCRIPT_START\n" + output.join("\n") + "\nTRANSCRIPT_END");
} finally {
  await server.shutdown();
  await Deno.remove(folder, { recursive: true });
}
