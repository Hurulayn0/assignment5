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

These JSON responses and HTTP status codes were captured with curl against a local server
backed by a fresh database. The examples use the default port and a POSIX shell. The login
response has its token redacted.

```sh
curl -sS -w '\n%{http_code}\n' http://localhost:8000/health
# {"ok":true}
# 200

curl -sS -w '\n%{http_code}\n' http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"email":"day1@example.com","password":"demo-pass-123"}'
# {"id":1,"email":"day1@example.com"}
# 201

curl -sS -w '\n%{http_code}\n' http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"day1@example.com","password":"demo-pass-123"}'
# {"token":"[redacted]"}
# 200
```

Use the token returned by login for all task requests. The examples assume a fresh
database where the first task has ID 1.

```sh
export TOKEN='<token from /auth/login>'

curl -sS -w '\n%{http_code}\n' http://localhost:8000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"title":"Review API contract"}'
# {"id":1,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795258758}
# 201

curl -sS -w '\n%{http_code}\n' 'http://localhost:8000/api/tasks?status=todo&page=1&limit=2' \
  -H "Authorization: Bearer $TOKEN"
# {"items":[{"id":1,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795258758}],"page":1,"limit":2,"total":1}
# 200

curl -sS -w '\n%{http_code}\n' http://localhost:8000/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN"
# {"id":1,"userId":1,"title":"Review API contract","status":"todo","priority":"medium","createdAt":1795258758}
# 200

curl -sS -w '\n%{http_code}\n' -X PUT http://localhost:8000/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"title":"Approve API contract","status":"done","priority":"high"}'
# {"id":1,"userId":1,"title":"Approve API contract","status":"done","priority":"high","createdAt":1795258758}
# 200

curl -sS -w '\n%{http_code}\n' -X DELETE http://localhost:8000/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN"
# {"ok":true}
# 200
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
