# Verification

Verified on 18 October 2026 using Node.js v24.19.0.

- `npm test`: **16/16 integration tests passed** against the actual HTTP server and isolated SQLite database.
- `node --check src/server.js` and `node --check public/app.js`: passed.
- `node demo/capture.mjs`: captured nine real HTTP interactions, including `201` creation, `409` overlap rejection, `403` authorization rejection, cancellation, and successful rebooking.
- The video uses the saved response trace. It is an edited API demonstration, not a screen capture of browser interactions.
- No real customer data, environment secrets, API keys, or session cookies are included in the repository or trace.
- The dashboard has responsive CSS, semantic form controls, focus styles, and native dialogs. Browser rendering, mobile interactions, and assistive-technology behavior were not executed in this environment; they remain manual verification items.

## Manual browser checklist

1. `npm run demo`, then open `http://127.0.0.1:3000`.
2. Try the admin view; inspect all appointments and global totals.
3. Create an appointment ten days ahead. Repeat the same service/branch/time and confirm conflict feedback.
4. Cancel the appointment and book the same time again.
5. Sign out, try the member view, and verify only that member's rows and totals appear.
6. Check branch/status filters, current-page search, empty states, and keyboard navigation.
7. Repeat at a mobile viewport; verify horizontal table scrolling and booking-dialog usability.
