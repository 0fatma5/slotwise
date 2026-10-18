# SlotWise API

Base URL: `http://127.0.0.1:3000`. Mutation bodies use `application/json`. Authentication uses the `slotwise_session` cookie. All date inputs must include an explicit timezone.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Health and demo-mode indicator |
| POST | `/api/auth/register` | Public | Create a member and start a session |
| POST | `/api/auth/login` | Public | Start a session |
| GET | `/api/auth/me` | Signed in | Current safe user profile |
| POST | `/api/auth/logout` | Signed in | Revoke current session |
| GET | `/api/catalog` | Signed in | Branch and service catalog |
| GET | `/api/bookings` | Signed in | Permission-scoped appointments |
| POST | `/api/bookings` | Signed in | Create own appointment |
| POST | `/api/bookings/:id/cancel` | Owner or admin | Cancel an appointment |
| GET | `/api/stats` | Signed in | Statistics for visible appointments |
| GET | `/api/admin/stats` | Admin | Global statistics |

## Examples

```bash
curl -c cookies.txt http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nour@example.test","password":"DemoOnly!2026"}'

curl -b cookies.txt http://127.0.0.1:3000/api/catalog

curl -b cookies.txt 'http://127.0.0.1:3000/api/bookings?branch=1&status=confirmed&page=1'
```

Registration accepts `name`, `email`, and `password` (10–128 characters). Login accepts `email` and `password`. Role fields are ignored; users cannot self-promote.

Booking creation accepts:

```json
{
  "branch_id": 1,
  "service_id": 1,
  "starts_at": "2030-01-15T10:00:00Z"
}
```

Replace that example date with a time between one minute and 180 days from now. The server computes the end time from the service duration and assigns the current user as owner. `201` returns `{ "data": { ...booking } }`. A conflicting interval returns `409 SLOT_CONFLICT`.

Booking lists return `{ "data": [], "pagination": { "page": 1, "pageSize": 50, "total": 0 } }`. Members only see their own rows. Admins see all rows. Optional filters are `branch` and `status`; ordering is start time then ID.

Cancellation and logout accept `{}`. A member requesting another member's booking receives `404` rather than confirmation that it exists. Cancelling an already cancelled booking returns `409`.

## Error contract

```json
{
  "error": {
    "code": "SLOT_CONFLICT",
    "message": "This branch already has a booking during that time. Choose another slot.",
    "requestId": "request-specific UUID"
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON or non-object JSON |
| 401 | Missing/expired session or invalid login |
| 403 | Admin permission missing or rejected Origin |
| 404 | Missing or inaccessible resource |
| 409 | Slot overlap, duplicate email, or already cancelled |
| 413 | Request body exceeds 16 KB |
| 415 | Mutation does not use JSON |
| 422 | Validation failure |
| 429 | More than 15 authentication attempts per IP per minute |

Same-origin browser writes are enforced when an Origin is supplied. The API does not enable CORS. Rate limiting is in-process and resets on restart.
