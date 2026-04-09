# Code Audit

**Date:** 2026-04-09
**Scope:** All ~57 TS/TSX source files, `app/globals.css`

This document records findings from a full code audit. Each finding includes a risk level and implementation status. Changes are applied conservatively — one at a time with build verification.

---

## Status legend

- **Implemented** — change applied and verified with `npm run build`
- **Deferred** — valid finding but too risky or low priority for this pass
- **Won't fix** — intentional design or not worth the trade-off

---

## 1. Duplicate logic

### AUDIT-001: Repeated auth/session guard pattern across API routes

- **Files:** `app/api/reserve/route.ts`, `app/api/cancel/route.ts`, `app/api/holds/create/route.ts`, `app/api/holds/release/route.ts`, `app/api/support/*.ts`
- **Issue:** Same pattern repeated: `auth()`, `session?.user?.email`, `.toLowerCase()`, return 401 JSON.
- **Proposed:** Extract `requireSessionEmail()` helper returning email or Response.
- **Risk:** Low
- **Status:** Deferred — touches many files; would need thorough testing of all API routes. Good candidate for a future refactor pass.

### AUDIT-002: Inline event start/end extraction in events route

- **Files:** `app/api/events/route.ts`, `lib/calendar-helpers.ts`
- **Issue:** `mapGoogleEventToApiEvent` reads `event.start?.dateTime || event.start?.date` inline, while `getEventStart`/`getEventEnd` in calendar-helpers do the same thing.
- **Proposed:** Use the existing helpers in the mapper.
- **Risk:** Low
- **Status:** Deferred — low impact, would verify on next events route change.

### AUDIT-003: Repeated env checks for calendar IDs

- **Files:** `app/api/events/route.ts`, `app/api/reserve/route.ts`, `app/api/holds/create/route.ts`
- **Issue:** Same `PRACTICE_CALENDAR_ID`/`JAM_CALENDAR_ID` env validation repeated.
- **Proposed:** Shared `assertCalendarIds()` helper.
- **Risk:** Low
- **Status:** Deferred — same reasoning as AUDIT-001.

### AUDIT-004: Duplicated message normalization in support routes

- **Files:** `app/api/support/contact/route.ts`, `app/api/support/reply/route.ts`
- **Issue:** Nearly identical `\r\n` → `\n` + trim logic.
- **Proposed:** `normalizeMultilineMessage()` in `lib/support.ts`.
- **Risk:** Low
- **Status:** Deferred — minimal duplication.

### AUDIT-005: Booking duration constants defined twice

- **Files:** `lib/calendar-helpers.ts`, `lib/timeGridDragSelect.ts`
- **Issue:** `MIN_BOOKING_MS` / `MAX_BOOKING_MS` (30 min / 6 hours) defined in both files.
- **Proposed:** Single definition, imported where needed.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-006: `sameLocalCalendarDay` implemented twice

- **Files:** `lib/formatting.ts`, `lib/timeGridDragSelect.ts`
- **Issue:** Same function in two files.
- **Proposed:** Single definition, imported where needed.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-007: `isTypingTarget` duplicated in CalendarView

- **File:** `components/CalendarView.tsx` (lines ~245 and ~284)
- **Issue:** Same function copy-pasted in two `useEffect` blocks.
- **Proposed:** Hoist to module-level.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-008: `ThreadSummary` type duplicated

- **Files:** `components/SupportInbox.tsx`, `app/api/support/threads/route.ts`
- **Issue:** Thread summary shape defined in both files independently.
- **Proposed:** Move to `lib/types.ts`.
- **Risk:** Medium (must verify both use sites match exactly)
- **Status:** Implemented

### AUDIT-009: Telegram duplicate-check pattern repeated

- **File:** `app/api/support/telegram-webhook/route.ts`
- **Issue:** Same `telegram_update_id` dedup query appears twice (for close and reply).
- **Proposed:** Extract helper function within the same file.
- **Risk:** Low
- **Status:** Deferred — single-file duplication, low priority.

---

## 2. Dead exports

### AUDIT-010: Unused exports in calendar-helpers

- **File:** `lib/calendar-helpers.ts`
- **Issue:** `getEventStart`, `hasOverlap`, `BookingTimeValidation` exported but only used within the same file.
- **Proposed:** Remove `export` keyword.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-011: Unused exports in timeGridDragSelect

- **File:** `lib/timeGridDragSelect.ts`
- **Issue:** Multiple symbols exported but only used within the same file: `MIN_BOOKING_MS`, `MAX_BOOKING_MS`, `lastSnappedMinuteBeforeSlotMax`, `clampEndToGridDay`, `snapMinutes`, `startOfLocalCalendarDay`, etc.
- **Proposed:** Remove `export` from purely internal symbols.
- **Risk:** Low
- **Status:** Implemented

---

## 3. API route efficiency

### AUDIT-012: Sequential Supabase hold query in events route

- **File:** `app/api/events/route.ts`
- **Issue:** Google Calendar `Promise.all` runs first, then Supabase hold query runs sequentially.
- **Proposed:** Include hold query in the same `Promise.all`.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-013: Sequential overlap checks in holds/create

- **File:** `app/api/holds/create/route.ts`
- **Issue:** Google Calendar overlap check completes before Supabase hold overlap query.
- **Proposed:** Run both in parallel with `Promise.all`.
- **Risk:** Low-medium (runs both on error paths)
- **Status:** Deferred — marginal gain, slightly more complex error handling.

---

## 4. Re-render patterns

### AUDIT-014: SupportInbox loadThreads/loadThread could run in parallel

- **File:** `components/SupportInbox.tsx`
- **Issue:** Polling interval calls `loadThreads()` then `loadThread()` sequentially.
- **Proposed:** `Promise.all([loadThreads(), loadThread()])`.
- **Risk:** Low
- **Status:** Implemented

### AUDIT-015: SupportInbox loadThreads depends on selectedThreadId

- **File:** `components/SupportInbox.tsx`
- **Issue:** `loadThreads` callback includes `selectedThreadId` in deps, causing effect re-setup on selection change.
- **Proposed:** Use ref for selected thread ID in callback.
- **Risk:** Medium (could change selection sync behavior)
- **Status:** Deferred — behavior-sensitive, needs careful testing.

---

## 5. CSS patterns

### AUDIT-016: Repeated font-family stack

- **File:** `app/globals.css`
- **Issue:** `font-family` stack repeated on `body` and `.fc-custom-event`.
- **Proposed:** Use `font-family: inherit` on `.fc-custom-event`.
- **Risk:** Low (must verify FullCalendar doesn't override)
- **Status:** Deferred — cosmetic only, FullCalendar override verification needed.

### AUDIT-017: Shared mirror/hold styles

- **File:** `app/globals.css`
- **Issue:** `.fc-event-mirror` and `.pending-hold-event` share nearly identical dashed/frosted styles.
- **Proposed:** Shared selector group.
- **Risk:** Low (must preserve any intentional differences)
- **Status:** Deferred — CSS changes need visual verification.

### AUDIT-018: Time-axis width repeated

- **File:** `app/globals.css`
- **Issue:** `132px` / `104px` axis width values repeated across many selectors.
- **Proposed:** CSS custom property `--fc-axis-width`.
- **Risk:** Low
- **Status:** Deferred — purely cosmetic refactor.

---

## 6. Bundle size

### AUDIT-019: CalendarView could be dynamically imported

- **File:** `app/jam/page.tsx`
- **Issue:** FullCalendar + all plugins load on initial route. Dynamic import would defer to `/jam` visits.
- **Proposed:** `next/dynamic` with `ssr: false` for CalendarView.
- **Risk:** Medium (changes loading experience on jam page)
- **Status:** Deferred — would change the loading UX, needs product decision.
