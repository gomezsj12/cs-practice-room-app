# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js Version Warning

This uses **Next.js 16** with breaking changes from earlier versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. The build uses `--webpack` flag (not Turbopack).

## Commands

```bash
npm run dev          # Start dev server (next dev --webpack)
npm run build        # Production build (next build --webpack)
npm run lint         # ESLint (fix issues in files you touch)
npm run test:unit    # Vitest unit tests (lib/**/*.test.ts)
npm run test:e2e     # Playwright e2e tests (headless, multi-browser)
npm run test:e2e:headed   # Playwright with visible Chromium
```

**Running a single unit test:** `npx vitest run lib/path/to/file.test.ts`
**Running a single e2e test:** `npx playwright test e2e/specific.spec.ts`

## Testing Philosophy

- **Bias toward small, custom unit tests** for localized behavior (pure helpers, API shapes, payload builders) using Vitest (`lib/**/*.test.ts`).
- **Do not treat `npm run test:e2e` as the default check** for small changes: the full suite is slow, multi-browser, environment-sensitive, and screenshot-heavy.
- After adding focused tests, **always run `npm run build`** and fix lint issues in touched files.
- Use the full e2e suite only when the change is broad UI/navigation or when explicitly requested.

## Architecture Overview

This is a **Next.js 16 App Router PWA** for a university practice room. It merges multiple data sources into a unified calendar and booking system.

### Data Flow

```
Browser → Next.js API Routes → Google Calendar API (2 calendars: practice + jam)
                              → Notion API (dual integrations: calendar + profile realm)
                              → Supabase (holds, blocks, profiles, support threads, admin tags)
                              → Telegram Bot API (support inbox sync)
```

### Key Integrations

- **Google Calendar**: Service-account JWT reads/writes two calendars (practice + jam). Events are the source of truth for bookings.
- **Notion (dual integrations)**: Calendar realm handles jam reservations and practice cancellations. Profile realm manages People directory and profile logs. Webhooks sync changes.
- **Supabase**: PostgreSQL with RLS. Tables: `profiles`, `holds`, `blocked_times`, `friday_exceptions`, `wwu_quarters`, `admin_event_tags`, `support_threads`, `support_messages`.
- **Telegram**: Bidirectional support inbox sync with admin chat.

### Authentication

**NextAuth v5** (Auth.js) with Google OAuth, JWT strategy (no DB adapter). The JWT callback checks Supabase profiles and attaches `isAdmin`, `bookingAccess`, and `profileComplete` flags to the session. Admin status derives from `ADMIN_EMAILS` env var or Notion "Leadership" type.

### Client State

- **`useEventPolling`**: Polls `GET /api/events` every 10-30s for merged calendar data
- **`useBookingFlow`**: State machine for hold → reserve → confirm lifecycle
- **`useDragSelect`**: Pointer-based slot selection on the calendar grid
- Session context via NextAuth `useSession()`

### Calendar Rendering

`CalendarView.tsx` is the largest component. It wraps FullCalendar (v6 timegrid) with extensive customization:

- **`renderEventContent`**: Custom event card layout (time, title, admin tag dot)
- **`handleEventDidMount`**: Applies CSS classes and CSS variables for status outlines and tag overlays
- **`displayEvents` memo**: Merges practice status outline colors and admin tag classes before FullCalendar renders
- **`eventClassNames`**: Adds `.fc-event-past` for ended events

CSS for calendar events lives in `app/globals.css` (not Tailwind utilities): `.fc-custom-event`, `.fc-admin-tag-swatch`, `.fc-practice-status-outline`, `.fc-admin-tagged-event`, etc. These use CSS custom properties (`--fc-admin-tag-color`, `--fc-admin-tag-overlay-color`) set per-event via `handleEventDidMount`.

**Caution:** Calendar event rendering spans the full time slot height via FullCalendar's internal positioning. Custom CSS that changes `position`, `height`, or `inset` on `.fc-event` or `.fc-timegrid-event-harness` elements can break event layout across the entire calendar.

### Admin Event Tags

Private per-admin color tags stored in Supabase `admin_event_tags`. Defined in `lib/admin-event-tags.ts`. Visual effect on calendar: 4px colored top bar + diagonal gradient overlay (via `::before`/`::after` pseudo-elements). Tag changes are optimistically applied to local state then background-refreshed.

### Event Detail Modal

`EventDetailsModal.tsx`: Fixed overlay for event details. For admin practice events, it shows:
- Status dropdown (syncs with Notion), editable times, assignee picker, patchlist link editor
- Draft-then-apply pattern: changes accumulate as draft state, submitted via "Apply Changes"
- A `nowMs` check disables editing after event end time

### Support Inbox

`SupportInbox.tsx` + 8 API routes under `api/support/`. Messages sync bidirectionally with Telegram admin chat. Threads stored in Supabase with `user_email` scoping.

## Key Directories

- **`app/api/`**: 30+ API routes (events, reserve, cancel, holds, support, webhooks, cron)
- **`components/`**: React components; `ui/select.tsx` is a custom framer-motion animated select (shadcn-inspired)
- **`lib/`**: Business logic, API clients (`google.ts`, `notion.ts`, `supabase.ts`), types, validation
- **`hooks/`**: Custom React hooks (booking flow, drag select, event polling, presence)
- **`e2e/`**: Playwright specs
- **`docs/`**: Extensive docs including `ARCHITECTURE.md` (69 KB full system design)

## UI Stack

- **Tailwind CSS v4** with PostCSS plugin (`@tailwindcss/postcss`), dark theme (`#030303` base)
- **Custom UI components** in `components/ui/`: shadcn-inspired but hand-built
- **Framer Motion** for animations (modals, toasts, select dropdowns)
- **Lucide React** for icons
- **FullCalendar v6** with timegrid + interaction plugins
- Import alias: `@/*` maps to project root

## Environment

See `.env.example` for the full variable list. Key groups: Google service account + calendar IDs, Notion tokens (dual integrations), Supabase URL + service-role key, NextAuth Google OAuth, Telegram bot, Fillout URLs. Detailed docs in `docs/ARCHITECTURE.md`.

## Deployment

Hosted on **Vercel**. Cron job in `vercel.json`: `/api/cron/sync-quarters` daily at 09:00 UTC. Sensitive env vars should be marked via `npm run vercel:mark-sensitive`.
