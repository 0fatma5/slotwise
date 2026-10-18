# Engineering decisions

## Request flow

HTTP request → body/origin validation → session lookup → role/owner scope → parameterized SQL → consistent JSON response.

The same Node server serves a small static frontend. There is no build step or external runtime dependency. The browser uses Fetch and native HTML dialogs.

## Why SQLite?

An evaluator can clone and run this demo with Node alone. Node 24 provides `node:sqlite`; foreign keys, WAL mode, constraints, and an overlap trigger protect the data. Synchronous SQLite work is intentionally small. A multi-instance or high-throughput service would need a different deployment/data-access design; this repository does not claim PostgreSQL support.

## Why a database trigger for overlaps?

An application-only "check then insert" can race. An insert trigger rejects any confirmed booking whose start is before the new end and whose end is after the new start. The trigger runs in the same database statement, preserving the invariant even if another writer inserts a conflicting booking. SQLite serializes writes. The integration test submits two simultaneous HTTP requests and requires exactly one winner. The app has no reschedule/reactivate endpoint; adding one also requires an UPDATE trigger or equivalent transactional protection.

## Why server-side sessions?

Random 256-bit session tokens are sent in HttpOnly, SameSite=Strict cookies; only token hashes are stored. Sessions expire after 24 hours and are deleted on logout. This keeps revocation simple. Passwords use scrypt with random salts and constant-time hash comparison. There is no token in localStorage and no hardcoded signing secret.

SameSite=Strict, JSON-only mutation requests, and same-origin checks protect browser writes. HTTPS deployments must set `COOKIE_SECURE=true`. The sample is loopback-only by default.

## Authorization rules

- Public registration always creates members.
- A member's identity comes from the server session, never request-body `user_id`.
- Member listing and statistics queries include an ownership condition.
- Cancellation is permitted only to the owner or an administrator.
- Admin statistics explicitly check the admin role.
- User-supplied SQL values use prepared statements.

## Time and money

Inputs require ISO 8601 with a timezone, are normalized to UTC, and derive duration from the selected service. UI dates render locally. Services have integer EGP prices. Booked value includes confirmed bookings and does not represent payments. A real payment flow would use minor currency units, a payment provider, and separate payment states.

## Interview walkthrough

1. Explain the difference between authentication and authorization using member/admin endpoints.
2. Show why owner IDs and end times are computed on the server.
3. Walk through half-open overlap logic and the concurrent-request test.
4. Explain hashing versus encryption, scrypt salts, and session revocation.
5. Describe what changes when moving to PostgreSQL: exclusion constraints, migrations, connection pooling, transactions, and driver abstraction.
6. Discuss SQLite's synchronous/event-loop tradeoff and why it suits this small demo.
7. Identify missing production work honestly: account recovery, verification, monitoring, opening hours, browser QA, distributed limiting, backups, and deployment security.
