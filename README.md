# Manager Library - demo seeder (`tool`)

Node.js command line tool that fills a running Manager Library API with demo data. It talks to the HTTP API only
(never to the database): 40 books, 10 members and 15 loans, some of them partially returned.

Spec: https://github.com/mauro-1508/test-manager-library-3145556-docs/tree/develop/spec-laravel

## Requirements

- Node.js 20 or newer (uses the built-in `fetch`; no dependencies to install).
- A running API with its admin user created.

## Environment variables

| Variable | Required | Default |
|---|---|---|
| `API_URL` | no | `http://localhost:8000/api/v1` |
| `ADMIN_USERNAME` | yes | - |
| `ADMIN_PASSWORD` | yes | - |

`.env.example` lists them with placeholders. The seeder does not read `.env` files by itself; export the variables
or use `node --env-file=.env seed.mjs`.

## Usage

```
export ADMIN_USERNAME=... ADMIN_PASSWORD=...
npm run seed
```

Books and members that already exist (409 `ISBN_TAKEN` / `DOCUMENT_TAKEN`) are looked up and reused. A loan the API
rejects is reported and skipped.

Optional argument: `--phase=all|overdue|rest` (default `all`), explained below.

## What gets created

- 40 books with unique, valid ISBN-13 values, spread over the five categories, 1 to 4 copies each.
- 10 members.
- 15 loans of 1 to 3 lines. The first three loans, to three distinct members with one line each, are printed as
  "the 3 that will be overdue". Some lines of the other loans are returned.

At the end it prints the counts, the lines currently returned by `GET /loans/overdue` and the rows of
`GET /reports/most-borrowed` for the current month.

## The overdue note

The API sets `loaned_at` from its own clock and `due_at = loaned_at + 14 days`. The seeder cannot backdate a loan
through the API, so those three loans are overdue only if they are created while the API clock is at least 15 days
behind the real date, or after 14 days have passed.

- Plain run: `npm run seed` creates everything; `/loans/overdue` returns 0 lines until the due date passes, then
  returns the 3 lines.
- With a shifted clock: run `npm run seed -- --phase=overdue` while the API runs with its clock 15 days behind (for
  example by shifting the system time of the API container), restore the clock, then run
  `npm run seed -- --phase=rest`. Afterwards `/loans/overdue` returns exactly 3 lines.
