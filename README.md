# Tasks API — Huriye Kayadelen, 2200005795

## Run locally

Install Deno 2 and run these commands from the project folder.

```sh
deno task dev
deno task test
deno task check
deno fmt --check
deno lint
```

The server defaults to port 8000 and the database file `tasks.db`. Override `PORT` and
`DATABASE_URL` in the environment to use different values.

## Design decisions

- `users` stores a unique lowercase email and a bcrypt password hash. Registration uses
  SQLite's unique constraint to handle duplicate submissions, including concurrent
  requests for the same email.
- `sessions` links an opaque random token to a user and an expiry time. The middleware
  checks the bearer token on every `/api/*` request and makes the user ID available to the
  route. Sessions expire after one hour.
- `tasks` references its owner in `users`. SQLite supplies the initial status and priority
  and records the creation time in Unix seconds. SQLite constraints enforce the allowed
  status and priority values.

- Task reads, updates and deletes match both the task ID and authenticated owner. A 404
  keeps the existence of another user's task private. List and count use the same owner
  and status filters, with ascending IDs giving a stable page order.
- The task list defaults to page 1 and limit 20. The maximum limit is 100. POST and PUT
  use the same schema: a trimmed title of 1 to 100 characters, status defaulting to
  `todo`, and priority defaulting to `medium`.

## API with curl

Commands below use a POSIX shell. Start with an empty database, set BASE to the running
API and set TOKEN to the login response's token. The upload uses a small local PNG named
sample.png. Download and documentation checks print the HTTP status.

```sh
BASE=http://localhost:8000

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/health"
# {"ok":true}
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/healthz"
# {"ok":true}
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/readyz"
# {"ready":true}
# 200

curl -sS -w '\n%{http_code}\n' -X POST "$BASE/auth/register" -H 'Content-Type: application/json' --data '{"email":"demo@example.com","password":"demo-pass-123"}'
# {"id":1,"email":"demo@example.com"}
# 201

curl -sS -w '\n%{http_code}\n' -X POST "$BASE/auth/login" -H 'Content-Type: application/json' --data '{"email":"demo@example.com","password":"demo-pass-123"}'
# {"token":"[redacted]"}
# 200

TOKEN='<token from login>'

curl -sS -w '\n%{http_code}\n' -X POST "$BASE/api/tasks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data '{"title":"Review API contract"}'
# {"estimateMinutes":null,"id":2,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795467320}
# 201

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/api/tasks?status=todo&page=1&limit=2" -H "Authorization: Bearer $TOKEN"
# {"items":[{"estimateMinutes":null,"id":1,"userId":1,"title":"Welcome! Plan your first task.","status":"todo","priority":"medium","createdAt":1795467320},{"estimateMinutes":null,"id":2,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795467320}],"page":1,"limit":2,"total":2}
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/api/tasks/2" -H "Authorization: Bearer $TOKEN"
# {"estimateMinutes":null,"id":2,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795467320}
# 200

curl -sS -w '\n%{http_code}\n' -X PUT "$BASE/api/tasks/2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data '{"title":"Approved contract","status":"done","priority":"high"}'
# {"estimateMinutes":null,"id":2,"userId":1,"title":"Approved contract","status":"done","priority":"high","createdAt":1795467320}
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/api/me/summary" -H "Authorization: Bearer $TOKEN"
# {"todo":1,"in-progress":0,"done":1}
# 200

curl -sS -w '\n%{http_code}\n' -X POST "$BASE/api/tasks/2/attachment" -H "Authorization: Bearer $TOKEN" -F 'file=@sample.png;type=image/png'
# {"ok":true}
# 200

curl -sS -o /dev/null -w '%{http_code}\n' -X GET "$BASE/api/tasks/2/attachment" -H "Authorization: Bearer $TOKEN"
# 200

curl -sS -w '\n%{http_code}\n' -X DELETE "$BASE/api/tasks/2" -H "Authorization: Bearer $TOKEN"
# {"ok":true}
# 200

curl -sS -w '\n%{http_code}\n' -X POST "$BASE/api/tasks/2/restore" -H "Authorization: Bearer $TOKEN"
# {"estimateMinutes":null,"id":2,"userId":1,"title":"Approved contract","status":"done","priority":"high","createdAt":1795467320}
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/api/admin/users" -H "Authorization: Bearer $TOKEN"
# {"error":"forbidden","issues":[]}
# 403

# After promoting the demo account in the test database

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/api/admin/users" -H "Authorization: Bearer $TOKEN"
# [{"id":1,"email":"demo@example.com","role":"admin"}]
# 200

curl -sS -o /dev/null -w '%{http_code}\n' -X GET "$BASE/docs"
# 200

curl -sS -o /dev/null -w '%{http_code}\n' -X GET "$BASE/openapi.json"
# 200

curl -sS -w '\n%{http_code}\n' -X GET "$BASE/ws?token=unknown"
# {"error":"unauthorized","issues":[]}
# 401
```

## My own log

Getting the first test to run took extra time. After resolving the certificate error, the
cache directory still refused writes. Checking task ownership also took extra time. With
two test accounts, removing the owner check made the API return 200 instead of 404.
Restoring the check brought all 18 tests back to green.

- Deno reported `invalid peer certificate: UnknownIssuer` when downloading from the npm
  registry. I populated a workspace-local cache in a one-time download scoped to that
  registry. The project tasks use standard certificate validation.
- The default Deno cache hit `Erişim engellendi. (os error 5)`. Using `DENO_DIR` in the
  writable workspace let Deno cache dependencies.
- Deno reported `JSR package manifest for '@std/assert' failed to load`. The tests now use
  the assertion module bundled with Deno's Node compatibility layer.
- Lint flagged the starter UI with `error[jsx-button-has-type]`. The add button now
  explicitly submits its form and the action buttons declare `type="button"`.
- The auth test's loop produced `Type 'undefined' is not assignable to type 'string'.`
  Using `Headers` objects expresses the difference between an absent header and a supplied
  header without a union of incompatible object types.
- Windows returned `os error 32` when the test fixture tried to unlink a database
  immediately after closing libSQL. The fixture closes the client and leaves the database
  file in the OS temp directory.

Day 3 took extra time because the container accepted a TCP connection before the API could
answer a readiness check. Polling /readyz made startup reproducible. Registering the same
account after replacing the container proved that the volume retained the data.

I added estimateMinutes because two tasks with the same priority can take very different
amounts of time. The API accepts null or an integer from 1 to 1440. The migration
preserves existing tasks with a null estimate.

## Bonus 1: Migrations with Drizzle Kit

Run `deno task db:migrate` from the project root. Startup also applies pending migrations.
The original schema, task lifecycle changes and estimate column have separate SQL files
and schema snapshots in drizzle/. For a new schema change, edit src/schema.ts, run
`deno task db:generate`, review the SQL and commit it with its snapshot.

## Bonus 2: Soft delete, restore and a transaction

DELETE timestamps a task. Lists, summaries and normal reads exclude it. Its owner can POST
to /api/tasks/:id/restore. Registration creates the user and welcome task together. The
rollback test forces the second insert to fail and checks that the user was never
committed.

## Bonus 3: Joins and the N+1 problem

Run `deno run -A scripts/query_plans.ts`. For one owner with 1,000 tasks, fetching IDs and
looking up each status issued 1,001 queries. Grouping by status issued one query and
returned the same counts (334 todo, 333 in-progress, 333 done). The API also excludes
deleted tasks and returns zero for absent groups.

## Bonus 4: Indexes and EXPLAIN

The same script measures twenty reads on 20,000 tasks across twenty owners. Before
indexing, SQLite reported SCAN tasks (5.160 ms per read). After indexing, it reported
SEARCH tasks USING INDEX idx_tasks_user_status (user_id=? AND status=?) (3.198 ms per
read). Timings vary by machine.

## Bonus 5: Seed data

Run `deno task seed` in development. Sign in with planner@example.com or
reviewer@example.com using the local demo password `demo-only-123`. Each account gets ten
tasks. A transaction skips task creation for an account that already has tasks. The seed
refuses production before opening the database.

## Bonus 15: Rate limit on login

Five failed logins for one normalized email start a one-minute lockout measured from the
first failure. A sixth request receives 429 and Retry-After in seconds, including when the
password is correct. Successful login clears the counter. Instances sharing the same
database share the counters. Separate databases and attempts distributed over many email
addresses need separate controls.

## Bonus 6: A connection pool (Postgres or SQLite)

Option B uses three local SQLite connections. WAL lets readers proceed alongside a writer.
Each connection waits up to five seconds for a busy database. A FIFO queue serves callers
when all connections are busy. A finally block releases the slot even when the handler
throws. The concurrency test schedules twenty jobs.

## Bonus 7: JWT instead of sessions

Set AUTH_MODE=jwt and supply JWT_SECRET through the environment. Login signs an expiring
HS256 token with JOSE. Protected routes verify its signature and expiry before trusting
its subject. Session mode remains available for the core assignment. Tests cover expired,
altered and differently signed tokens.

## Bonus 8: OpenAPI and a docs page

Open /docs for Swagger UI or /openapi.json for its machine-readable contract. The registry
reuses the task input schema. The documentation test checks paths, security and validation
constraints.

## Bonus 9: Roles (RBAC)

New registrations receive the user role. An administrator can promote an existing account
directly in the database. GET /api/admin/users checks its caller's stored role. The curl
transcript shows 403 before promotion and 200 afterward.

## Bonus 10: Logging and request ids

A request emits one JSON line. Route templates omit query values. The x-request-id
response header lets a client correlate a failure with server logs.

```json
{
  "method": "GET",
  "path": "/health",
  "status": 200,
  "ms": 3,
  "requestId": "90947da3-7955-4b9e-b415-ed8fbcdce714"
}
```

## Bonus 11: Health, readiness and configuration

GET /healthz checks liveness. GET /readyz queries the database and returns 503 when it is
unavailable. Configuration validation runs before startup. Use deno task start:test or
deno task start:production with the corresponding environment file and provide production
secrets separately.

## Bonus 12: File upload

Send a PNG or JPEG in the multipart file field to a task's attachment endpoint. The limit
is 1 MiB. The server generates a storage name and checks ownership on upload and download.
The tests cover missing, oversized and unsupported files, a successful round trip and
cross-user access.

## Bonus 13: WebSocket live updates

Open the starter UI in two tabs signed in as the same user. Editing a task in one tab
causes the second tab to fetch the updated list. An unrelated user receives no event. The
socket test exercises real connections and the HTTP transcript includes the rejected login
token.

## Bonus 14: A background job with Deno.cron

At 03:00 UTC the scheduler purges tasks completed over thirty days ago. The cutoff uses
completion time. Run the one-minute demonstration with deno run -A --unstable-cron
scripts/cron_demo.ts. Observed scheduler output:

```json
{ "job": "purge", "removed": 1 }
```

## Bonus 16: A cache with Deno KV

Individual task reads cache results for sixty seconds under an owner-specific key.
Mutations invalidate cached results. Version checks prevent an earlier database read from
repopulating a stale entry after invalidation. Tests exercise hits, invalidation and owner
isolation.

## Bonus 17: Docker

Run `bash scripts/docker_smoke.sh` to build the image and register an account in a
disposable container. The script recreates the container using the original volume and
repeats the curl request. GitHub's Linux runner recorded:

```text
{"ready":true}{"id":1,"email":"docker@example.com"}
201
{"ready":true}{"error":"email already registered","issues":[]}
409
Image size (bytes): 97044294
```

The process runs as deno. Network permission serves HTTP, read permission loads migration
files and runtime libraries, write permission is restricted to /data, environment
permission loads configuration, and FFI and system permissions support the native SQLite
driver.

## Bonus 18: Continuous integration

Every push runs formatting, lint, type checking, tests and a Docker persistence check. The
deliberately failing test ran on a separate proof branch.
[Red run](https://github.com/Hurulayn0/assignment5/actions/runs/45263470845) and
[green run](https://github.com/Hurulayn0/assignment5/actions/runs/45263761170).

## Bonus 19: Deploy

Pending. The configuration accepts a remote libSQL URL and database authentication token.
A verified deployment and public health URL still require a hosting project and
provisioned database.

## Bonus 20: Git repository

The private repository contains the development history. Instructor access is pending
identification of the GitHub account announced on CATS.
[Assignment 5 on GitHub](https://github.com/Hurulayn0/assignment5).
