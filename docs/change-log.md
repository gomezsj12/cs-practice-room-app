# Change log

This file (`docs/change-log.md`) is the **running record** for this repo:

- **Product and planning intent** distilled from an old ChatGPT conversation (pre-Cursor).
- **What shipped in git**, with attribution (ChatGPT-assisted build vs Cursor vs you).
- **Issues and fixes** you should not accidentally undo.

**Code map (routes, env vars, behavior):** [`ARCHITECTURE.md`](./ARCHITECTURE.md) — if this file disagrees with the code, trust `ARCHITECTURE.md`.

---

## How to maintain this file (Cursor agents)

**When to append:** After you complete work that is saved as a **new git commit** (or the user commits your changes), add **one row** to [Git commit log](#git-commit-log) **only if** the commit is **substantive** — e.g. user-facing behavior, APIs, auth/calendar/env, deploy, security, or architectural refactors. **Do not** add a row for purely mechanical churn (format-only, single typo, dependency bump with no behavior change) unless the user asks.

**What to write:** Short **subject** (or first line of commit message), **`abc1234` hash**, **one optional sentence** if the subject is vague, and **Attribution** = `Cursor agent`, `Human`, or `ChatGPT-era` (use `ChatGPT-era` for commits from before Cursor was used, if you know; otherwise `Human`).

**Do not** log uncommitted experiments here — only **committed** history.

**Regressions:** If the commit fixes a recurring pitfall, also add or update a row under [Issues encountered and fixes](#issues-encountered-and-fixes-do-not-regress).

---

## SOURCE: Pre-Cursor ChatGPT (planning conversation)

*The following sections are **not** from Cursor. They summarize a long **ChatGPT 5.4** thread (~April 2026) before this repo was developed in Cursor. They describe **intent and tradeoffs**, not the exact current code.*

### The real-world problem

- **Practice bookings** (longer sessions, ~2 hours) already go through **Fillout** → Google Calendar → **Notion**. That flow stays outside this app.
- **Jam use** is lighter: musicians who know the room want to **see when practice is booked**, then **claim open time** for drums/piano without a long form. Before this app, they **texted** and waited for approval.

The goal was to replace that texting loop with something **almost as fast**, still **trust-based**, and **visible on a shared calendar**.

### UX principles (north star)

- **Low friction**: minimal fields — **first name + instrument** (drums / piano / other). Optional notes were discussed and **explicitly dropped**.
- **Instant booking** for jams (not an approval queue).
- **Desktop**: **week** time grid; **mobile**: **day** view — week-long drag on phones was called out as looking good but **feeling bad**; adapt the UI per form factor.
- **Visual language**: practice / busy blocks vs jam reservations should read clearly; tap/click for details.
- **Interaction**: **drag or select a time range** on free space; **overlap prevention** with existing calendar data.
- **Longer vision** (phased): jam scheduler first → optional **landing + Fillout embed** → **PWA** install behavior.

### Why the stack looks the way it does (planning)

Early exploration compared **no-code** (Cal.com, Google appointment slots, Webflow embeds) against a **small custom app**. Conclusion for *this* product: true **drag on a grid over your real calendar** is **custom-build territory**; Mobiscroll was ruled out for **cost** and because it is a developer kit, not a turnkey product.

| Piece | Role (as planned / evolved) |
|--------|------|
| **Next.js on Vercel** | App host; API routes hold secrets |
| **FullCalendar** | Week/day time grid, selection + interaction (**single room** — no premium resource view) |
| **Google Calendar API** | **Source of truth** for availability: read **practice** calendar, read/write **jam** calendar |
| **Notion API** | **Log / mirror** — not the real-time conflict engine |
| **Google sign-in (NextAuth)** | Identity; **calendar** I/O via **server-side** Google credentials — not “each user OAuth’s your calendar.” |
| **Supabase** | Optional **short-lived holds** — added in implementation after early “skip Supabase for v1” chat |

**Ordering rule from planning:** **create the Calendar event first** (after overlap checks), **then** write Notion. If Notion fails, the booking still shows in Google Calendar.

### Decisions to remember

1. **Two calendars** — practice vs jam; app **writes jams** only to the jam calendar.
2. **Do not use Notion as the real-time conflict database.**
3. **Trust boundary** — audience is mostly people the room manager knows.
4. **Free-tier mindset** at planning time.

### What the old ChatGPT export omitted

The raw log was removed from the repo; it contained tutorials (PATH, git), long reasoning dumps, and full code pastes. This file replaces that with **summary + git facts + anti-regression**.

---

## SOURCE: Git repository + Cursor / human maintenance

*The sections below are grounded in **commits** and **maintained in-repo**. New commits should be appended by Cursor agents per [How to maintain](#how-to-maintain-this-file-cursor-agents).*

### Git commit log

Chronological **oldest → newest**. **Attribution:** **ChatGPT-era** = assisted build before Cursor; **Cursor agent** = commit body explicitly says so (e.g. `Made-with: Cursor`); **Human** = all other commits (use this for Cursor-made changes too if the trailer was not added).

| Commit | What changed | Attribution |
|--------|----------------|-------------|
| `124731f` | Initial Next.js app setup. | ChatGPT-era |
| `2e42e5d` | Jam reservations create events on Google Calendar (server-side calendar client). | ChatGPT-era |
| `d864ee7` | Notion logging for jam reservations (mirror / audit). | ChatGPT-era |
| `32034d0` | Jam reservation cancellation flow. | ChatGPT-era |
| `c1cfa20` | Jam reservation cancellation flow (follow-up commit). | ChatGPT-era |
| `2a4e2a9` | PWA install prompts and move toward **Vercel** hosting. | ChatGPT-era |
| `ed5ecb4` | Deployment/env alignment for Vercel. | ChatGPT-era |
| `7ddd6f1` | **Type fixes** for Google Calendar event shapes — **production build** succeeds. | ChatGPT-era |
| `d556b49` | **Layout + PWA** completion. | ChatGPT-era |
| `40930f4` | **Deploy error** fix. | ChatGPT-era |
| `c635786` | Test new Google key (Vercel). | ChatGPT-era |
| `a105683` | Revert to original Google key. | ChatGPT-era |
| `770201b` | **Potential Google key fix** (env / key material). | ChatGPT-era |
| `414fd36` | **Cut extra Vercel quotations** on env values. | ChatGPT-era |
| `06893e6` | **Removed quotations from `.env`** (parsing). | ChatGPT-era |
| `105d681` | **Google sign-in (NextAuth)** and **owner-only** jam cancellation (+ admin — see `ARCHITECTURE.md`). | ChatGPT-era |
| `65f2549` | **Temporary holds** (Supabase) for in-progress booking races. | ChatGPT-era |
| `6778610` | `docs/ARCHITECTURE.md` and Cursor **collaboration** rule. | Human |
| `9fd9045` | **Types:** `EventDetailsModal` `CalendarEvent` aligned with `CalendarView`. | Human |
| `7b0fda9` | **Custom time-grid drag-select** with walls + **optimistic holds** (`lib/timeGridDragSelect.ts`, `CalendarView`). | Human |
| `d300dee` | **Mobile touch:** long-press + touch fallback for drag-select / mirror; keeps walls and optimistic holds. | Cursor agent (`Made-with: Cursor`) |
| `a472461` | **Holds:** 30s TTL; orphaned hold release on reload (`sessionStorage` + `pagehide`). **Reserve modal** polish (status transition, form while securing). **Calendar** loading line in card only (like prior deploy). **InstallPrompt** `useSyncExternalStore`. Cursor **SETTINGS** + workflow rules; **`docs/change-log.md`** added. | Cursor agent (`Made-with: Cursor`) |
| `f20cf8a` | **Calendar drag:** no duplicate temp holds on mobile (touch vs pointer); **end-of-day** drag caps at last snap (e.g. 11:45 PM); **upward drag** clips `start` past busy blocks (`clipSelectionStart`) so UI cannot overlap practice. | Cursor agent (`Made-with: Cursor`) |
| `eb283ab` | **Refactor (Phases 1-3):** shared `lib/types.ts`, `lib/calendar-helpers.ts`, `lib/formatting.ts`; lazy singletons for Google/Supabase/Notion clients; Notion SDK `dataSources.query`; `ENABLE_TEMP_HOLDS` early-exit; deduplicated drag-finish + hold-cleanup; fetch-cooldown debounce; **CalendarView** split into `useToast`, `useEventPolling`, `useBookingFlow`, `useDragSelect` hooks (1445 → 344 lines). No behavior changes. | Cursor agent (`Made-with: Cursor`) |
| `d796485` | **Cleanup (Phase 4):** `.pending-hold-event` CSS moved with event styles; SW serves `/api/pwa-icon` from cache; removed unused `maskable=1` manifest param; removed double midnight-zeroing in `minutesOnDayToDate`. | Cursor agent (`Made-with: Cursor`) |
| `c91c096` | **Booking modals:** shared date range line (`→`, no seconds); hold countdown as “N seconds” (display stays at 1s until expiry); last 10s temporary-hold **card** red border/background tint. | Cursor agent (`Made-with: Cursor`) |
| `1d50100` | **Now indicator** overlay (thin/thick segments + arrow), **time-axis labels** on grid lines, **CS Practice Room** header, modal copy fix; calendar/drag/cancel/helpers updates. | Cursor agent (`Made-with: Cursor`) |
| `506e797` | **Install prompt:** dismiss hides for the rest of the local day; auto-hides after 15s per app session. | Human |

### Environment / tooling notes (from repo history)

- **`npm run dev`** uses **`next dev --webpack`**: intentional for **Next.js 16** + FullCalendar in dev (see `package.json`). Re-verify calendar behavior before switching dev bundlers.
- **`GOOGLE_PRIVATE_KEY`**: `lib/google.ts` uses `.replace(/\\n/g, "\n")`. **Extra quoting** or broken `.env.local` lines previously broke auth — see commits `414fd36`, `06893e6`, `770201b`.

---

## Issues encountered and fixes (do not regress)

*Curated from shipped work; cite commits where useful. **Cursor agents:** update when a new commit fixes or changes one of these areas.*

| Issue | What went wrong | Fix / current state |
|--------|------------------|---------------------|
| **Google JWT / private key** | Service account auth failed; env **quoting** or newlines wrong. | `ARCHITECTURE.md` vars; one `NAME=value` per line; code normalizes `\n`. |
| **Production build** | Calendar/event typing blocked `next build`. | `7ddd6f1`; keep types aligned across modals and API. |
| **Vercel deploy** | Build/deploy failures (`40930f4`). | Env parity, logs; see `ARCHITECTURE.md` checklist. |
| **Double-booking** | Two users same slot. | Supabase holds + server overlap + optimistic UI (`65f2549`, `7b0fda9`). |
| **Drag-select vs busy** | Selection must respect blockers and **30 min–6 h**; upward drags must not show on top of practice. | `lib/timeGridDragSelect.ts` — `clipSelectionEnd` + **`clipSelectionStart`** in `mergeSelectionRange` (`f20cf8a`). |
| **Mobile drag** | Touch unreliable. | Long-press + touch path (`d300dee`). |
| **Identity vs calendar** | Users must not need Calendar OAuth for your calendars. | Service account + calendar share; NextAuth for identity only. |
| **Cancel authority** | Only owner + admin cancel jams. | Extended properties + `ADMIN_EMAIL`. |
| **Notion failures** | Logging must not block booking. | Google insert first; Notion best-effort after. |
