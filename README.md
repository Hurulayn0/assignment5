# Tasks API — STUDENT NAME, STUDENT NUMBER

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

## API with curl

These responses came from a local run with `PORT=18005` and an empty demo database. The
token in the login response is redacted. With the default port, replace 18005 with 8000.
These examples use a POSIX shell.

```sh
curl -sS -w '\n%{http_code}\n' http://localhost:18005/health
# {"ok":true}
# 200

curl -sS -w '\n%{http_code}\n' http://localhost:18005/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"email":"day1@example.com","password":"demo-pass-123"}'
# {"id":1,"email":"day1@example.com"}
# 201

curl -sS -w '\n%{http_code}\n' http://localhost:18005/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"day1@example.com","password":"demo-pass-123"}'
# {"token":"[redacted]"}
# 200
```

## My own log

Development notes from the day-one run.

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
