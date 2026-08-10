# Classroom Backend

REST API for a classroom management platform — departments, subjects, classes, and student
enrollments, with email/password authentication and per-role rate limiting.

Built with Express 5, TypeScript (native ESM), Drizzle ORM on PostgreSQL, Better Auth, and Arcjet.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Request pipeline](#request-pipeline)
- [API reference](#api-reference)
- [Authentication](#authentication)
- [Security and rate limiting](#security-and-rate-limiting)
- [Database](#database)
- [Migrations](#migrations)
- [Troubleshooting](#troubleshooting)
- [Known issues](#known-issues)

---

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js (ESM — `"type": "module"`) |
| Language | TypeScript, `module: nodenext`, `strict` |
| HTTP | Express 5 |
| Database | PostgreSQL (Neon) |
| ORM / migrations | Drizzle ORM + Drizzle Kit |
| Auth | Better Auth (email + password) |
| Security | Arcjet — shield, bot detection, sliding-window rate limits |
| Dev runner | `tsx watch` |

Because the project is native ESM with `module: nodenext`, **every relative import must carry a
`.js` extension**, even when the file on disk is `.ts`:

```ts
import { db } from "../db/index.js";   // resolves src/db/index.ts
```

---

## Requirements

- Node.js 20+
- A PostgreSQL database (the project is developed against [Neon](https://neon.tech))
- An [Arcjet](https://arcjet.com) API key

---

## Quick start

```bash
git clone https://github.com/ZacharieMarie/classroom-backend.git
cd classroom-backend
npm install

cp .env.example .env        # then fill in the values — see below
npm run db:migrate          # apply migrations to your database
npm run dev                 # starts on http://localhost:8000
```

You should see:

```
Server is running at http://localhost:8000
```

Verify it responds:

```bash
curl http://localhost:8000/
# Hello, Welcome to the classroom API
```

### npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with `tsx watch` — reloads on file change |
| `npm run build` | Type-check and emit JavaScript with `tsc` |
| `npm start` | Run the compiled output (see [Known issues](#known-issues)) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |

---

## Environment variables

All are read from `.env` at the project root. `.env` is gitignored — never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string. The server throws at startup if missing. |
| `FRONTEND_URL` | **Yes** | Allowed CORS origin, and a Better Auth trusted origin. Throws at startup if missing. |
| `BETTER_AUTH_SECRET` | **Yes** | Signs sessions and tokens. Must be **at least 32 characters** — Better Auth warns below that. Generate with `openssl rand -base64 32`. |
| `ARCJET_KEY` | **Yes** | Arcjet API key. Throws at startup unless `NODE_ENV=test`. |
| `ARCJET_ENV` | Dev only | Set to `development` when running locally. See [Troubleshooting](#troubleshooting). |
| `BETTER_AUTH_URL` | Recommended | Public base URL of this API (e.g. `http://localhost:8000`). Without it Better Auth derives the origin per-request and logs a warning; callbacks and redirects may break. |
| `NODE_ENV` | No | When set to `test`, the security middleware and the Arcjet key check are both skipped. |

### `.env.example`

```dotenv
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
FRONTEND_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-me-with-32-plus-random-characters
BETTER_AUTH_URL=http://localhost:8000
ARCJET_KEY=ajkey_xxxxxxxxxxxxxxxxxxxxxxxx
ARCJET_ENV=development
```

---

## Project structure

```
src/
├── index.ts                # App entry — middleware order, route mounting, listen
├── config/
│   └── arcjet.ts           # Arcjet client: shield, bot detection, base rate limit
├── db/
│   ├── index.ts            # Drizzle client instance
│   └── schema/
│       ├── index.ts        # Barrel — re-exports app + auth schema
│       ├── app.ts          # departments, subjects, classes, enrollments
│       └── auth.ts         # user, session, account, verification (Better Auth)
├── lib/
│   └── auth.ts             # Better Auth configuration
├── middleware/
│   └── security.ts         # Role-aware Arcjet rate limiting
├── routes/
│   └── subjects.ts         # /api/subjects
├── express.d.ts            # Augments Express.Request with `user`
└── type.d.ts               # UserRoles, RateLimitRole

drizzle/                    # Generated migrations + snapshots
drizzle.config.ts           # Drizzle Kit config
```

---

## Request pipeline

Middleware order in `src/index.ts` is deliberate and **load-bearing**:

```
1. cors({ origin: FRONTEND_URL, credentials: true })
2. app.all('/api/auth/*splat', toNodeHandler(auth))   ← before express.json()
3. express.json()
4. securityMiddleware                                  ← Arcjet, applies to everything below
5. /api/subjects
6. GET /
```

Two constraints to preserve when adding routes:

- **The Better Auth handler must stay above `express.json()`.** Better Auth reads the raw request
  body itself; if `express.json()` consumes the stream first, auth requests hang or fail.
- **`app.use(securityMiddleware)` is mounted without a path**, so it runs for *every* request that
  reaches it — including paths that match no route, before the 404. Anything registered *above* it
  bypasses rate limiting entirely; anything below is protected.

---

## API reference

Base URL: `http://localhost:8000`

### `GET /`

Health/welcome endpoint. Returns plain text.

```
Hello, Welcome to the classroom API
```

### `GET /api/subjects`

Paginated, filterable list of subjects with their department joined in.

**Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | Case-insensitive match against subject `name` **or** `code` |
| `department` | string | — | Case-insensitive match against department `name` |
| `page` | integer | `1` | Clamped to a minimum of 1 |
| `limit` | integer | `10` | Clamped to the range 1–100 |

**Example**

```bash
curl "http://localhost:8000/api/subjects?search=math&page=1&limit=10"
```

**`200 OK`**

```json
{
  "data": [
    {
      "id": 1,
      "departmentId": 2,
      "name": "Linear Algebra",
      "code": "MATH201",
      "description": "Vectors, matrices, and linear transformations",
      "createdAt": "2026-08-01T14:06:46.000Z",
      "updatedAt": "2026-08-01T14:06:46.000Z",
      "department": {
        "id": 2,
        "code": "MATH",
        "name": "Mathematics",
        "description": "Department of Mathematics",
        "createdAt": "2026-08-01T14:06:46.000Z",
        "updatedAt": "2026-08-01T14:06:46.000Z"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Results are ordered by `createdAt` descending.

**`500 Internal Server Error`**

```json
{ "error": "failed to get subjects" }
```

### `ALL /api/auth/*`

Handled entirely by Better Auth. Common endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/sign-up/email` | `POST` | Register with email and password |
| `/api/auth/sign-in/email` | `POST` | Sign in, receive a session cookie |
| `/api/auth/sign-out` | `POST` | Invalidate the current session |
| `/api/auth/get-session` | `GET` | Return the current session, or `null` |

**Sign up**

```bash
curl -X POST http://localhost:8000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
        "email": "ada@example.com",
        "password": "a-strong-password",
        "name": "Ada Lovelace",
        "role": "student"
      }'
```

**Sign in**

```bash
curl -X POST http://localhost:8000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "ada@example.com", "password": "a-strong-password" }'
```

**Current session**

```bash
curl http://localhost:8000/api/auth/get-session -b cookies.txt
```

### Error responses

| Status | Body | Cause |
|---|---|---|
| `403` | `{ "error": "Forbidden", "message": "Automated requests are not allowed." }` | Arcjet bot detection |
| `403` | `{ "error": "Forbidden", "message": "Request blocked by security policy." }` | Arcjet shield (SQLi and similar) |
| `429` | `{ "error": "Too many requests.", "message": "…" }` | Rate limit exceeded — message names the role's limit |
| `500` | `{ "error": "Arcjet middleware error", … }` | Security middleware threw |

---

## Authentication

Configured in `src/lib/auth.ts` using the Drizzle adapter against the `pg` provider, with the
schema from `src/db/schema/auth.ts`.

- **Method:** email and password (`emailAndPassword.enabled`)
- **Trusted origins:** `FRONTEND_URL`
- **Sessions:** cookie-based — browser clients must send `credentials: 'include'`, and CORS is
  already configured with `credentials: true`

### Custom user fields

Beyond the standard Better Auth user model, two fields are declared as `additionalFields`:

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `role` | string | yes | `student` | Accepted at sign-up (`input: true`). Backed by a Postgres enum: `student`, `teacher`, `admin`. |
| `imageCldPubId` | string | no | — | Cloudinary public ID for the user's avatar |

> **Note:** `role` is accepted from client input at registration. Anything that grants elevated
> access should not trust it without a server-side check — a client can currently self-assign
> `teacher` or `admin` at sign-up.

---

## Security and rate limiting

`src/config/arcjet.ts` configures three always-on rules:

- **Shield** (`LIVE`) — blocks common attacks such as SQL injection
- **Bot detection** (`LIVE`) — blocks bots, allowing `CATEGORY:SEARCH_ENGINE`
- **Sliding window** — a baseline of 5 requests per 2 seconds

`src/middleware/security.ts` layers a **role-aware** sliding window on top, resolved from
`req.user?.role` and defaulting to `guest`:

| Role | Limit | Window |
|---|---|---|
| `admin` | 20 requests | 1 minute |
| `teacher` | 10 requests | 1 minute |
| `student` | 10 requests | 1 minute |
| `guest` (unauthenticated) | 5 requests | 1 minute |

The middleware short-circuits entirely when `NODE_ENV=test`.

> **Note:** `req.user` is declared in `src/express.d.ts` but nothing currently populates it, so
> every request is presently rate-limited as `guest`. Wiring the Better Auth session onto
> `req.user` — in middleware mounted above `securityMiddleware` — is what will activate the
> per-role tiers.

---

## Database

PostgreSQL accessed through Drizzle ORM. Schema lives in `src/db/schema/` and is split in two:
`auth.ts` holds the Better Auth tables, `app.ts` the domain tables.

### Auth tables

| Table | Purpose |
|---|---|
| `user` | Accounts. `id` (text PK), `email` (unique), `emailVerified`, `image`, `role` enum, `imageCldPubId` |
| `session` | Active sessions. `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `userId` → `user.id` cascade |
| `account` | Credentials and OAuth links. Holds the hashed `password` for email/password auth |
| `verification` | Email verification and password reset tokens |

### Domain tables

| Table | Purpose |
|---|---|
| `departments` | `id` identity PK, `code` (unique, ≤50), `name`, `description` |
| `subjects` | `departmentId` → `departments.id` (`restrict`), `code` (unique), `name`, `description` |
| `classes` | `subjectId` → `subjects.id` (`cascade`), `teacherId` → `user.id` (`restrict`), `inviteCode` (unique), `capacity` (default 50), `status` enum, `schedules` jsonb |
| `enrollments` | Join table — composite PK `(studentId, classId)`, both cascade on delete |

### Relations

```
departments 1─┬─* subjects 1─┬─* classes ─┬─1 user (teacher)
              │              │            │
              │              │            └─* enrollments *─1 user (student)
```

Every table carries `createdAt` and `updatedAt`; `updatedAt` auto-updates on write via
Drizzle's `$onUpdate`.

Drizzle infers types for each table — import them rather than hand-writing shapes:

```ts
import type { Subject, NewSubject, Class, User } from "./db/schema/index.js";
```

---

## Migrations

Migrations and their snapshots are committed under `drizzle/`.

```bash
# 1. Edit the schema in src/db/schema/
# 2. Generate a migration from the diff
npm run db:generate

# 3. Review the generated SQL in drizzle/<timestamp>_<name>/migration.sql
# 4. Apply it
npm run db:migrate
```

`drizzle.config.ts` reads `DATABASE_URL` and points at `src/db/schema/index.ts` — so a new schema
file is only picked up once it is re-exported from that barrel.

Always read the generated SQL before applying it. Renames in particular are often emitted as
drop-and-recreate, which discards data.

---

## Troubleshooting

### The server accepts connections but never responds

Requests hang with `Operation timed out … 0 bytes received`, and `curl -v` shows `Connected`
followed by nothing. Usually a **stale process still holding port 8000** — your new server then
fails to bind with `EADDRINUSE` (easy to miss in scrollback) while every request hits the old,
wedged one.

```bash
lsof -i :8000        # look for a node process in LISTEN state
kill -9 <PID>        # pkill -f tsx will NOT match a plain `node` process
lsof -i :8000        # confirm empty
npm run dev
```

Close any Postman or browser tabs pointed at `:8000` first — they reconnect on their own and
muddy the output.

### Every request 500s or hangs in the security middleware

Arcjet logs one of:

```
Client IP address is missing. If this is a dev environment set the ARCJET_ENV env var to "development"
Failed to build fingerprint … requested `ip` characteristic but the `ip` value was empty
```

On localhost the client address is `::1`, which Arcjet rejects in `LIVE` mode. Add to `.env`:

```dotenv
ARCJET_ENV=development
```

To confirm Arcjet is the culprit, comment out `app.use(securityMiddleware);` in `src/index.ts` and
restart — if everything responds, that's it. (Note that requests to unmatched paths also pass
through this middleware, so even a 404 can hang.)

### `npm install` fails with `ERESOLVE`

```
Conflicting peer dependency: drizzle-kit@0.31.10
peerOptional drizzle-kit@">=0.31.4" from better-auth
```

`better-auth` requires `drizzle-kit >= 0.31.4`, and npm does not treat a **prerelease** such as
`1.0.0-rc.4` as satisfying a plain `>=` range. Keep `drizzle-kit` and `drizzle-orm` on stable
releases (`^0.31.x` / `^0.45.x`). Prefer that over `--legacy-peer-deps`, which papers over the
conflict and leaves the next `npm ci` to fail again.

### `ERR_PACKAGE_PATH_NOT_EXPORTED: ./_relations`

```ts
import { relations } from "drizzle-orm/_relations";   // ✗ internal path, not exported
import { relations } from "drizzle-orm";              // ✓
```

### Auth requests hang

Check that `app.all('/api/auth/*splat', toNodeHandler(auth))` is still mounted **above**
`app.use(express.json())` in `src/index.ts`.

### `BETTER_AUTH_SECRET` warnings

```
your BETTER_AUTH_SECRET should be at least 32 characters long
your BETTER_AUTH_SECRET appears low-entropy
```

Generate a real one: `openssl rand -base64 32`.

---

## Known issues

Open items in the current codebase, listed so they are not mistaken for intended behaviour:

- **`npm start` is broken.** The script runs `node dist/server.js`, but the entry point is
  `src/index.ts` and `tsconfig.json` has both `rootDir` and `outDir` commented out — so `tsc`
  emits `.js` files beside their sources instead of into `dist/`. Fix by setting `rootDir: "./src"`
  and `outDir: "./dist"`, then pointing the script at `dist/index.js`.
- **`PORT` is hardcoded** to `8000` in `src/index.ts` rather than read from the environment, which
  will not work on hosts that assign a port.
- **Dead Neon client in `src/db/index.ts`.** A `neon()` HTTP client is created and assigned to an
  unused `sql` variable; the Drizzle instance is built separately from `drizzle-orm/node-postgres`
  over TCP. The unused import can go.
- **`req.user` is never populated,** so the per-role rate limits in
  [Security and rate limiting](#security-and-rate-limiting) never engage — see the note there.
- **`role` is client-supplied at sign-up** — see the note under
  [Authentication](#authentication).
- **`classes.schedules` is typed `any[]`,** giving up type safety on a structured column.
- **Only `GET /api/subjects` is implemented.** Departments, classes, and enrollments have schema
  and migrations but no routes yet.