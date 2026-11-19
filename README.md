# Sweety

Small glucose tracker for up to four daily readings and daily, month-to-date, and previous-month reports.

## Run locally

Requires Node 24+, npm, and PostgreSQL.

```bash
createdb sweety
cp server/.env.example server/.env
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Open http://localhost:5173. API health: http://localhost:4000/api/health. Tests: `npm test`.

The server creates the `users` and `readings` tables on startup. Set `DATABASE_URL` in `server/.env` if needed. `bcryptjs` is pure JavaScript and avoids native build issues.

## Notes

- Signup returns a token immediately.
- Every reading query includes the authenticated `user_id`, including updates and deletes.
- Monthly means the complete calendar month immediately before the selected month.
- The frontend supports adding, editing, cancelling edits, and deleting readings.
- Calendar dates are kept as `YYYY-MM-DD` strings so local time zones cannot move them to an adjacent day.
- The test suite uses a separate `sweety_test` database; it does not reset the development database.
- With more time: migrations, stronger password policy, accessibility review, and broader automated coverage.
