# Error Log

This file documents **errors encountered during development and production**, their root causes, how they were fixed, and how to prevent them from recurring. It serves as both a historical record and a troubleshooting reference.

---

## How to maintain this file (Cursor agents)

**When to append:** After fixing a bug, resolving a build/deploy error, or working around an integration issue, add a new entry to the appropriate category below.

**Entry format:**

```markdown
### ERR-NNN: Short description

- **Date:** YYYY-MM-DD
- **Category:** Build | Runtime | Deploy | Integration | UI/UX
- **Severity:** Critical | High | Medium | Low
- **Commit(s):** `abc1234` (if applicable)
- **Symptom:** What the user or developer saw.
- **Root cause:** Why it happened.
- **Fix applied:** What was changed to resolve it.
- **Prevention:** How to avoid this in the future.
```

**Numbering:** Use the next sequential ERR number. Check the last entry in any category to find the current highest number.

**Also update:** If the error relates to a known anti-regression issue, update the "Issues encountered and fixes" table in `docs/change-log.md`.

---

## Build errors

### ERR-001: Google Calendar event type mismatch blocked production build

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Build
- **Severity:** Critical
- **Commit(s):** `7ddd6f1` (old repo)
- **Symptom:** `next build` failed with TypeScript errors related to Google Calendar event shapes.
- **Root cause:** The types used in `EventDetailsModal` and `CalendarView` did not align with the actual Google Calendar API response shape. Optional fields (`id`, `summary`, `start`, `end`) were not properly typed as nullable.
- **Fix applied:** Created aligned types (`GoogleApiEvent` in `lib/types.ts`) with proper nullable fields. Ensured all components and API routes use the shared type.
- **Prevention:** Always use the shared `lib/types.ts` types for Google Calendar event shapes. Run `npm run build` before committing to catch type errors early.

### ERR-002: Deploy error on Vercel

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Deploy
- **Severity:** High
- **Commit(s):** `40930f4` (old repo)
- **Symptom:** Vercel build/deploy failed.
- **Root cause:** Environment variable mismatch between local and Vercel settings, combined with build-time vs runtime availability of certain env vars.
- **Fix applied:** Ensured env parity between `.env.local` and Vercel project settings.
- **Prevention:** Use `.env.example` as a checklist. Before deploying, verify all required env vars are set in the Vercel dashboard (both Production and Preview environments if using previews).

### ERR-010: Vercel build failed — Edge Function `/api/pwa-icon` over 1 MB

- **Date:** 2026-04-19
- **Category:** Deploy
- **Severity:** High
- **Commit(s):** `e0e4b5d`
- **Symptom:** Vercel reported: “The Edge Function `api/pwa-icon` size is 1.05 MB and your plan size limit is 1 MB.” Production build failed.
- **Root cause:** The route used `export const runtime = "edge"`. `next/og` `ImageResponse` pulls in Satori and Resvg, which push the compiled Edge bundle over Vercel’s **1 MB** Edge limit on Hobby.
- **Fix applied:** Set `export const runtime = "nodejs"` in `app/api/pwa-icon/route.tsx` so the handler deploys as a Node.js Serverless Function (higher size limit).
- **Prevention:** Avoid Edge for routes that depend on `next/og` / heavy WASM unless bundle size is verified. Prefer Node for OG/image generation, or serve static icons from `public/`.

---

## Runtime errors

### ERR-003: Google service account JWT authentication failure

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Integration
- **Severity:** Critical
- **Commit(s):** `414fd36`, `06893e6`, `770201b` (old repo)
- **Symptom:** API routes that call Google Calendar returned authentication errors. Calendar events could not be loaded or created.
- **Root cause:** The `GOOGLE_PRIVATE_KEY` environment variable had extra quoting or incorrect newline encoding. Vercel's env var UI sometimes double-quotes values, and `.env.local` lines were formatted as `KEY="value"` instead of `KEY=value`.
- **Fix applied:** 
  1. Removed extra quotation marks from env values (`414fd36`, `06893e6`).
  2. `lib/google.ts` applies `.replace(/\\n/g, "\n")` to normalize escaped newlines.
  3. Documented the correct format: one `NAME=value` per line, no wrapping quotes.
- **Prevention:** 
  - In `.env.local`: use `GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...` (no wrapping quotes).
  - In Vercel dashboard: paste the raw key value; do not add quotes.
  - If auth fails after an env change, check for double-quoting first.

### ERR-004: Double-booking race condition

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Runtime
- **Severity:** High
- **Commit(s):** `65f2549`, `7b0fda9` (old repo)
- **Symptom:** Two users could book the same time slot simultaneously, resulting in overlapping jam reservations.
- **Root cause:** No server-side locking or hold mechanism. The overlap check and event creation were not atomic — a gap between check and insert allowed concurrent bookings.
- **Fix applied:** Added Supabase temporary holds (`reservation_holds` table) with 30-second TTL. The flow is now: check overlap → create hold → show modal → confirm booking. Server-side overlap check runs again at reserve time.
- **Prevention:** Never remove the hold-based flow without replacing it with an equivalent concurrency guard. The `ENABLE_TEMP_HOLDS` flag can disable holds, but the server-side overlap check in `/api/reserve` still runs.

### ERR-005: Mobile touch drag unreliable

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** UI/UX
- **Severity:** Medium
- **Commit(s):** `d300dee` (old repo)
- **Symptom:** Drag-select on mobile devices was unreliable — sometimes it would not register, and sometimes scrolling would interfere.
- **Root cause:** FullCalendar's built-in selection relies on pointer events, which conflict with touch scrolling on mobile browsers (especially iOS Safari). The browser cannot distinguish between a scroll gesture and a selection gesture.
- **Fix applied:** Implemented a dedicated touch listener system with long-press arming (220ms delay). Movement >10px before arming cancels the drag and allows normal scrolling. Once armed, `touch-action: none` prevents scroll interference.
- **Prevention:** Any changes to `useDragSelect.ts` must be tested on both iOS Safari and Android Chrome. The long-press threshold (220ms) and cancel distance (10px) are tuned — do not change without mobile testing.

### ERR-006: Drag selection could overlap busy blocks (upward drag)

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** UI/UX
- **Severity:** Medium
- **Commit(s):** `f20cf8a` (old repo)
- **Symptom:** When dragging upward on the calendar, the selection mirror could visually overlap with existing practice bookings.
- **Root cause:** `mergeSelectionRange` only clipped the selection end against busy blocks, not the start. An upward drag set the start below a busy block but the visual mirror extended above it.
- **Fix applied:** Added `clipSelectionStart` to `mergeSelectionRange` in `lib/timeGridDragSelect.ts`, ensuring both start and end are clipped against blockers.
- **Prevention:** When modifying drag-select logic, test all four drag directions (down, up, short, long) with busy blocks above and below the selection point.

### ERR-007: Duplicate temporary holds on mobile

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Runtime
- **Severity:** Medium
- **Commit(s):** `f20cf8a` (old repo)
- **Symptom:** On mobile, completing a drag-select sometimes created two temporary holds for the same time slot.
- **Root cause:** Both the pointer event path and the touch event path were active on mobile — the touch gesture completed through both code paths.
- **Fix applied:** Added an early return in `onPointerDown` when `pointerType === "touch"`, ensuring touch gestures only go through the dedicated touch listeners.
- **Prevention:** The pointer and touch paths in `useDragSelect.ts` must remain mutually exclusive. Do not remove the touch-type guard in `onPointerDown`.

---

## Integration errors

### ERR-008: Notion API failures blocking bookings

- **Date:** Pre-2026-04-08 (old jam reservation app)
- **Category:** Integration
- **Severity:** Medium
- **Commit(s):** N/A (design decision)
- **Symptom:** When the Notion API was down or misconfigured, jam reservations would fail entirely even though the Google Calendar event was created successfully.
- **Root cause:** Early implementation awaited the Notion API call and threw on failure, blocking the entire reserve flow.
- **Fix applied:** Made Notion logging best-effort: Google Calendar insert runs first; if it succeeds, the reservation is confirmed. Notion insert/update is wrapped in a try-catch and errors are logged but do not fail the response.
- **Prevention:** Notion is a **log/mirror**, not the source of truth. Never make Notion a blocking dependency in the booking or cancellation flow.

---

## UI/UX errors

### ERR-009: Support page stuck on loading during client-side navigation

- **Date:** 2026-04-09
- **Category:** UI/UX
- **Severity:** High
- **Commit(s):** `339c36e`
- **Symptom:** Navigating to `/support` via client-side routing (clicking the nav link) showed an infinite loading spinner. Hard refresh worked correctly.
- **Root cause:** The `SupportInbox` component's session-status effect only ran on initial mount with the correct `status` value during a hard refresh. During client-side navigation, the session status was already `authenticated` when the component mounted, but the loading state was not properly initialized for that path.
- **Fix applied:** Ensured the loading/thread-fetch logic runs correctly regardless of whether the component mounts with an already-authenticated session or transitions to authenticated.
- **Prevention:** When building components that depend on `useSession()`, test both hard refresh and client-side navigation to the page. The `status` value may differ between these two entry points.

---

## Template for new entries

Copy this template when adding a new error:

```markdown
### ERR-NNN: Short description

- **Date:** YYYY-MM-DD
- **Category:** Build | Runtime | Deploy | Integration | UI/UX
- **Severity:** Critical | High | Medium | Low
- **Commit(s):** `abc1234`
- **Symptom:** What the user or developer saw.
- **Root cause:** Why it happened.
- **Fix applied:** What was changed to resolve it.
- **Prevention:** How to avoid this in the future.
```
