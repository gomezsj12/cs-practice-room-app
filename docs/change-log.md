# Change Log

This file is the **single source of truth** for the full project history — from the original standalone Jam Reservation app (built with ChatGPT) through every commit in this CS Practice Room portal repo (built with Cursor).

**Code map (routes, env vars, behavior):** [ARCHITECTURE.md](./ARCHITECTURE.md) — if this file disagrees with the code, trust `ARCHITECTURE.md`.

---

## How to maintain this file (Cursor agents)

**When to append:** After you complete work that is saved as a **new git commit** (or the user commits your changes), add **one row** to the appropriate commit log section **only if** the commit is **substantive** — e.g. user-facing behavior, APIs, auth/calendar/env, deploy, security, or architectural refactors. **Do not** add a row for purely mechanical churn (format-only, single typo, dependency bump with no behavior change) unless the user asks.

**What to write:** Short **subject** (or first line of commit message), **`abc1234` hash**, **one optional sentence** if the subject is vague, and **Attribution** = `Cursor agent`, `Human`, or `ChatGPT-era` (use `ChatGPT-era` for commits from before Cursor was used, if you know; otherwise `Human`).

**Do not** log uncommitted experiments here — only **committed** history.

**Regressions:** If the commit fixes a recurring pitfall, also add or update a row under [Issues encountered and fixes](#issues-encountered-and-fixes-do-not-regress). Additionally, add an entry to `docs/error-log.md` with the full error details.

---

## Part 1 — Pre-Cursor: Jam Reservation App (practice-room-jam-scheduler)

*These commits are from the **original standalone repo** (`practice-room-jam-scheduler`), built with **ChatGPT 5.4** guidance (~April 2026). They do **not** exist in this repo's git history — they are preserved here as project lineage. The code was later forked/ported into this CS Practice Room portal.*

### Product context (from the ChatGPT planning conversation)

- **Practice bookings** (longer sessions, ~2 hours) already go through **Fillout** → Google Calendar → **Notion**. That flow stays outside this app.
- **Jam use** is lighter: musicians who know the room want to **see when practice is booked**, then **claim open time** for drums/piano without a long form. Before this app, they **texted** and waited for approval.
- The goal was to replace that texting loop with something **almost as fast**, still **trust-based**, and **visible on a shared calendar**.

### UX principles (north star)

- **Low friction**: minimal fields — **first name + instrument** (drums / piano / other). Optional notes were discussed and **explicitly dropped**.
- **Instant booking** for jams (not an approval queue).
- **Desktop**: **week** time grid; **mobile**: **day** view.
- **Visual language**: practice / busy blocks vs jam reservations should read clearly; tap/click for details.
- **Interaction**: **drag or select a time range** on free space; **overlap prevention** with existing calendar data.
- **Longer vision** (phased): jam scheduler first → optional **landing + Fillout embed** → **PWA** install behavior.

### Stack rationale (from planning)

| Piece | Role (as planned / evolved) |
| --- | --- |
| **Next.js on Vercel** | App host; API routes hold secrets |
| **FullCalendar** | Week/day time grid, selection + interaction (single room — no premium resource view) |
| **Google Calendar API** | Source of truth for availability: read practice calendar, read/write jam calendar |
| **Notion API** | Log / mirror — not the real-time conflict engine |
| **Google sign-in (NextAuth)** | Identity; calendar I/O via server-side Google credentials |
| **Supabase** | Optional short-lived holds — added in implementation after early "skip Supabase for v1" chat |

**Ordering rule:** Create the Calendar event first (after overlap checks), then write Notion. If Notion fails, the booking still shows in Google Calendar.

### Key decisions

1. **Two calendars** — practice vs jam; app writes jams only to the jam calendar.
2. **Do not use Notion as the real-time conflict database.**
3. **Trust boundary** — audience is mostly people the room manager knows.
4. **Free-tier mindset** at planning time.

### Jam Reservation App commit log

| Commit | What changed | Attribution |
| --- | --- | --- |
| `124731f` | Initial Next.js app setup. | ChatGPT-era |
| `2e42e5d` | Jam reservations create events on Google Calendar (server-side calendar client). | ChatGPT-era |
| `d864ee7` | Notion logging for jam reservations (mirror / audit). | ChatGPT-era |
| `32034d0` | Jam reservation cancellation flow. | ChatGPT-era |
| `c1cfa20` | Jam reservation cancellation flow (follow-up commit). | ChatGPT-era |
| `2a4e2a9` | PWA install prompts and move toward Vercel hosting. | ChatGPT-era |
| `ed5ecb4` | Deployment/env alignment for Vercel. | ChatGPT-era |
| `7ddd6f1` | **Type fixes** for Google Calendar event shapes — production build succeeds. | ChatGPT-era |
| `d556b49` | Layout + PWA completion. | ChatGPT-era |
| `40930f4` | Deploy error fix. | ChatGPT-era |
| `c635786` | Test new Google key (Vercel). | ChatGPT-era |
| `a105683` | Revert to original Google key. | ChatGPT-era |
| `770201b` | Potential Google key fix (env / key material). | ChatGPT-era |
| `414fd36` | Cut extra Vercel quotations on env values. | ChatGPT-era |
| `06893e6` | Removed quotations from `.env` (parsing). | ChatGPT-era |
| `105d681` | Google sign-in (NextAuth) and owner-only jam cancellation (+ admin). | ChatGPT-era |
| `65f2549` | Temporary holds (Supabase) for in-progress booking races. | ChatGPT-era |
| `6778610` | `docs/ARCHITECTURE.md` and Cursor collaboration rule. | Human |
| `9fd9045` | Types: `EventDetailsModal` `CalendarEvent` aligned with `CalendarView`. | Human |
| `7b0fda9` | Custom time-grid drag-select with walls + optimistic holds. | Human |
| `d300dee` | Mobile touch: long-press + touch fallback for drag-select / mirror. | Cursor agent |
| `a472461` | Holds: 30s TTL; orphaned hold release on reload. Reserve modal polish. InstallPrompt `useSyncExternalStore`. Cursor SETTINGS + workflow rules; `docs/change-log.md` added. | Cursor agent |
| `f20cf8a` | Calendar drag: no duplicate temp holds on mobile; end-of-day drag caps; upward drag clips start past busy blocks. | Cursor agent |
| `eb283ab` | Refactor (Phases 1-3): shared `lib/types.ts`, `lib/calendar-helpers.ts`, `lib/formatting.ts`; lazy singletons; CalendarView split into hooks (1445 → 344 lines). No behavior changes. | Cursor agent |
| `d796485` | Cleanup (Phase 4): `.pending-hold-event` CSS moved; SW caches `/api/pwa-icon`; removed unused manifest param; removed double midnight-zeroing. | Cursor agent |
| `c91c096` | Booking modals: shared date range line; hold countdown as "N seconds"; last 10s hold card red border/tint. | Cursor agent |
| `1d50100` | Now indicator overlay, time-axis labels on grid lines, CS Practice Room header, modal copy fix. | Cursor agent |
| `506e797` | Install prompt: dismiss hides for local day; auto-hides after 15s per session. | Human |

---

## Part 2 — CS Practice Room App (this repo)

*This repo (`cs-practice-room-app`) was created by forking the Jam Reservation App into a portal with multiple pages. All commits below exist in this repo's git DAG.*

### CS Practice Room commit log

| Commit | Date | What changed | Attribution |
| --- | --- | --- | --- |
| `8eb2bb6` | 2026-04-08 12:54 | **Create cs practice room portal foundation.** Forked jam scheduler into multi-page portal: homepage (`/`), booking page (`/booking`), jam page (`/jam`). Added `SiteHeader`, navigation cards, `siteConfig`, Fillout embed. | Cursor agent |
| `20db11e` | 2026-04-08 14:01 | **Streamline header auth cards and remove redundant jam toasts.** Cleaned up header layout; removed duplicate toast logic from jam page. | Cursor agent |
| `ad2a09b` | 2026-04-08 18:47 | **Refine layout: header grid, homepage cards, booking embed.** Grid-based header, responsive homepage cards, improved Fillout embed styling. | Cursor agent |
| `e099892` | 2026-04-08 19:43 | **Fix header brand/auth alignment and subtitle styling.** Visual fix for header alignment issues. | Cursor agent |
| `0118c05` | 2026-04-09 01:12 | **Add Telegram-backed support inbox with in-app thread syncing.** New `/support` page, `SupportInbox` component, Supabase `support_threads`/`support_messages` tables, Telegram bot webhook, 8 new API routes under `api/support/`. | Cursor agent |
| `96391d5` | 2026-04-09 01:52 | **Improve Telegram reply mapping for support threads.** Better mapping between Telegram replies and in-app thread messages. | Cursor agent |
| `50b757a` | 2026-04-09 02:10 | **Add conversation management and in-thread replies for support inbox.** User can send follow-up messages within threads; admin can reply/close from Telegram. | Cursor agent |
| `d74dee9` | 2026-04-09 08:58 | **Refine support chat UX and thread handling.** Improved message display, thread state management, and overall inbox polish. | Cursor agent |
| `9ac3328` | 2026-04-09 10:10 | **Refine support inbox mobile/chat styling and message bubble sizing.** Mobile-responsive chat layout, properly sized message bubbles. | Cursor agent |
| `339c36e` | 2026-04-09 11:47 | **Fix support page stuck on loading during client-side navigation.** Resolved a bug where navigating to `/support` via client-side routing showed an infinite loading state. | Cursor agent |
| `e7a899a` | 2026-04-09 20:20 | **Comprehensive code review: docs, comments, audit fixes, and review process.** Consolidated change-log, expanded ARCHITECTURE.md, created error-log/ui-lookbook/code-audit/CODE_REVIEW.md, implemented 8 low-risk audit fixes (dedup constants/types/helpers, removed dead exports, parallelized API calls), added JSDoc to all ~57 source files, added desktop+mobile screenshots, created documentation protocol and review checklists. | Cursor agent |
| `9d83121` | 2026-04-09 20:30 | **Update change-log.md with code review commit.** Added missing entry for `e7a899a`. | Cursor agent |
| `900cf97` | 2026-04-09 20:35 | **Strengthen change-log update requirement in agent rules.** Made change-log update a hard mandatory requirement in documentation-protocol, change-log.mdc, and SETTINGS.md so future agents cannot skip it. | Cursor agent |

---

## Environment / tooling notes

- **`npm run dev`** uses **`next dev --webpack`**: intentional for Next.js 16 + FullCalendar in dev (see `package.json`). Re-verify calendar behavior before switching dev bundlers.
- **`GOOGLE_PRIVATE_KEY`**: `lib/google.ts` uses `.replace(/\\n/g, "\n")`. Extra quoting or broken `.env.local` lines previously broke auth — see old-repo commits `414fd36`, `06893e6`, `770201b`.

---

## Issues encountered and fixes (do not regress)

*Curated from shipped work; cite commits where useful. Cursor agents: update when a new commit fixes or changes one of these areas. Also add detailed entries to `docs/error-log.md`.*

| Issue | What went wrong | Fix / current state |
| --- | --- | --- |
| **Google JWT / private key** | Service account auth failed; env quoting or newlines wrong. | `ARCHITECTURE.md` vars; one `NAME=value` per line; code normalizes `\n`. (old-repo `414fd36`, `06893e6`, `770201b`) |
| **Production build** | Calendar/event typing blocked `next build`. | old-repo `7ddd6f1`; keep types aligned across modals and API. |
| **Vercel deploy** | Build/deploy failures. | Env parity, logs; see `ARCHITECTURE.md` checklist. (old-repo `40930f4`) |
| **Double-booking** | Two users same slot. | Supabase holds + server overlap + optimistic UI. (old-repo `65f2549`, `7b0fda9`) |
| **Drag-select vs busy** | Selection must respect blockers and 30 min–6 h; upward drags must not show on top of practice. | `lib/timeGridDragSelect.ts` — `clipSelectionEnd` + `clipSelectionStart` in `mergeSelectionRange`. (old-repo `f20cf8a`) |
| **Mobile drag** | Touch unreliable. | Long-press + touch path. (old-repo `d300dee`) |
| **Identity vs calendar** | Users must not need Calendar OAuth for your calendars. | Service account + calendar share; NextAuth for identity only. |
| **Cancel authority** | Only owner + admin cancel jams. | Extended properties + `ADMIN_EMAIL`. |
| **Notion failures** | Logging must not block booking. | Google insert first; Notion best-effort after. |
| **Support page loading** | Client-side navigation to `/support` showed infinite loading spinner. | Fixed session/state initialization on client-side nav. (`339c36e`) |
