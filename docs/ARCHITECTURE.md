# CS Practice Room App — Architecture & Codebase Overview

This document describes how the project is structured and what each major part does. It is intended as a map for maintenance, onboarding, and debugging (for example, Vercel deploy issues versus a working local setup).

The jam reservation system in this repo started as a copy of the original Practice Room Jam Scheduler. Its architecture, integrations, and behavior notes are intentionally retained here so the broader practice-room portal can continue to reuse that working foundation.

---

## How we work together (project owner context)

Sam is **not an experienced developer**. When helping with this repo, assistants should:

- **Explain in plain language** what a change or command does before or right after doing it.
- **Prefer small steps** and confirm understanding rather than assuming familiarity with Next.js, Vercel, Supabase, or OAuth.
- **Ask follow-up questions** when something is ambiguous (for example, which environment is failing, or what you see on screen).
- **Call out risks** (secrets in chat, breaking production, deleting calendar data) before destructive or irreversible actions.

---

## Product intent (from project context)

- **Public calendar**: Anyone can see practice-room availability: practice bookings (from one Google Calendar) and jam reservations (from another).
- **Jam reservations**: Signed-in Google users can drag-select a time range, optionally get a short **temporary hold** in Supabase, then confirm with name and instrument. The server creates a Google Calendar event on the jam calendar and logs a row in **Notion**.
- **Cancellation**: Jam creators can cancel their own events; an **admin email** (env) can cancel any jam. Practice events are view-only in the UI.
- **PWA**: Install prompts, web app manifest, and a service worker cache an app shell for offline-friendly loading (not a full offline calendar sync).

The attached LLM conversations describe the original UX goals (scheduler-style booking, Mobiscroll-like ideas) and the adopted **simpler auth model**: Google sign-in for identity only (no per-user Calendar scopes), with ownership stored in event metadata and Notion.

---

## Tech stack


| Layer                    | Choice                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Framework                | **Next.js 16** (App Router), **React 19**                                                     |
| Styling                  | **Tailwind CSS v4** (`@import "tailwindcss"` in `app/globals.css`)                            |
| Calendar UI              | **FullCalendar** (`@fullcalendar/react`, time grid + interaction)                             |
| End-user auth            | **NextAuth v5** (`next-auth@5.0.0-beta.30`) with **Google** provider, JWT sessions            |
| Google Calendar (server) | **googleapis** with a **service account** JWT (Calendar API scope)                            |
| Temporary holds          | **Supabase** (`@supabase/supabase-js`), service role, table `reservation_holds`               |
| Logging                  | **Notion** (`@notionhq/client` + REST for data source query), Notion API version `2026-03-11` |


`package.json` runs the dev server with `**next dev --webpack`** (Webpack for development).

---

## Local secrets: where they live

Next.js automatically loads environment variables from a file named `**.env.local**` in the **project root** (same folder as `package.json`). That is the usual place for secrets when developing on your machine.

- If you were thinking of a file named `**local.env`**, that name is **not** loaded by Next.js unless you rename it to `.env.local` or use a custom tool. For this project, use `**.env.local`** for local development.
- **Never commit** `.env.local` or any file containing real keys. It should stay in `.gitignore` (Next.js templates usually ignore it).

**Security habit:** Treat anything that looks like a password, token, or private key as **compromised if it was pasted into a chat, screenshot, or ticket**. Rotate it in the relevant console (Google Cloud, Notion, Supabase, Vercel) and update your `.env.local` and Vercel env vars.

---

## Environment variables (full list for this app)

Values are **not** documented here—only **names** and what they are for.

### Google Calendar (service account — server)

Used by `lib/google.ts` so the **server** can read/write calendars without each user granting Calendar access.


| Variable              | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `GOOGLE_CLIENT_EMAIL` | Service account email                                             |
| `GOOGLE_PRIVATE_KEY`  | Service account private key (often stored with `\n` for newlines) |
| `GOOGLE_PROJECT_ID`   | Google Cloud project id                                           |


### Calendars and admin


| Variable               | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `PRACTICE_CALENDAR_ID` | Google Calendar id for practice events (read-only in the app UI)    |
| `JAM_CALENDAR_ID`      | Google Calendar id for jam reservations (create/delete/list)        |
| `ROOM_TIME_ZONE`       | IANA time zone for new events (code default: `America/Los_Angeles`) |
| `ADMIN_EMAIL`          | Email that may cancel any jam and release others’ holds             |


### Notion


| Variable                | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `NOTION_TOKEN`          | Integration token                          |
| `NOTION_DATA_SOURCE_ID` | Data source id for jam reservation logging |


### Supabase (temporary holds)


| Variable                    | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `SUPABASE_URL`              | Project URL                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only; full access)      |
| `ENABLE_TEMP_HOLDS`         | Set to `true` to enable hold create/list/release |


### Sign-in with Google (NextAuth / Auth.js — end users)

These live in `**.env.local`** for localhost and must be set on **Vercel** for production. They are separate from the service account above: they identify **people** signing into the website.


| Variable             | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `AUTH_SECRET`        | Secret used to encrypt/sign session tokens. Must be a long random string. |
| `AUTH_GOOGLE_ID`     | OAuth 2.0 **Client ID** from Google Cloud (Web application client).       |
| `AUTH_GOOGLE_SECRET` | OAuth 2.0 **Client secret** for that client.                              |


`**.env.local` formatting tip:** Each line should be exactly `**NAME=value`**—one variable per line. If two names accidentally appear on one line (for example `AUTH_SECRET=OTHER_NAME=...`), tools may not parse it correctly; fix by splitting into separate lines with a single `=` per variable.

### Deployment URL (production)


| Variable   | Purpose                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_URL` | Full site URL (for example `https://your-app.vercel.app`). Important for OAuth callbacks behind Vercel. Often set only in Vercel, not locally. |


`auth.ts` sets `**trustHost: true**`, which helps when the framework needs to trust forwarded host headers (typical on Vercel). You still need correct OAuth redirect URIs in Google Cloud and consistent `AUTH_URL` / deployment URL.

---

## Repository layout (high level)

```
app/                    # Next.js App Router: pages, API routes, metadata
components/             # Client React components (calendar shell + modals)
lib/                    # Shared server helpers (Google, Notion, Supabase, PWA icon)
public/sw.js            # Service worker (static file)
auth.ts                 # NextAuth configuration
```

Path alias: `@/*` → project root (`tsconfig.json`).

---

## App Router — pages and metadata

### `app/layout.tsx`

- Sets **metadata** (title, description, `applicationName`, manifest URL).
- **Viewport**: dark `themeColor`, `colorScheme: "dark"`.
- Wraps the app in `**AuthProvider`** (NextAuth `SessionProvider`).
- Renders `**ServiceWorkerRegistration**` and `**InstallPrompt**` after children.
- Imports `**globals.css**`.

### `app/page.tsx`

- Single route: renders `**CalendarView**` inside a dark, centered max-width container.

### `app/globals.css`

- Tailwind v4 entry and dark theme variables.
- Extensive **FullCalendar overrides**: dark grid, fixed time-axis width, no internal scroll (works with `height="auto"`), custom event blocks, selection mirror styling, “pending hold” dashed style, mobile tweaks.

### `app/manifest.ts`

- Exports a **Web App Manifest** (`MetadataRoute.Manifest`): name, `short_name`, `start_url`, `standalone`, icons pointing at `**/api/pwa-icon`** (192 and 512; includes maskable entry in the manifest).

### `app/icon.tsx` and `app/apple-icon.tsx`

- Next.js **metadata file conventions** that return PNG icons via the shared `**createPwaIcon`** helper (192×192 favicon, 180×180 Apple touch).

---

## Authentication

### `auth.ts`

- `**NextAuth**` with the **Google** provider only.
- **JWT** session strategy.
- `**trustHost: true`** (important behind proxies like Vercel; pair with correct `AUTH_URL` / deployment URL).

### `app/api/auth/[...nextauth]/route.ts`

- Re-exports `**GET**` and `**POST**` from NextAuth `**handlers**`.

### `components/AuthProvider.tsx`

- Client wrapper: `**SessionProvider**` from `next-auth/react`.

### `components/AuthButton.tsx`

- Loading / signed-out / signed-in states.
- `**signIn("google")**` and `**signOut({ callbackUrl: "/" })**`.
- Shows the signed-in user’s email.

---

## Core UI: calendar and flows

### `components/CalendarView.tsx` (client)

Central orchestration:

- `**useSession**` for auth status.
- **Mobile vs desktop**: `window.innerWidth < 768` toggles FullCalendar `**timeGridDay`** vs `**timeGridWeek**` (component remounts via `key`).
- **Loads events** from `**GET /api/events`** (no cache); reloads when auth status changes, every **30s** when the tab is visible (and no pending selection), and on **window focus** / **visibility change** (same guard).
- **Selection rules**: `selectOverlap={false}`, max drag duration capped in `selectAllow`; `**clampSelectionRange`** enforces **30 minutes–6 hours** after selection.
- **Signed-in only** for selecting a slot; otherwise a toast asks to sign in.
- After select: `**createHoldOrFallback`** → `POST /api/holds/create`. On success, enters **hold** mode with `holdId` and server-normalized times; on **409** or failure, falls back to **fallback** mode (still opens reserve modal; final check at reserve).
- Uses a **request id** (`holdRequestIdRef`) to ignore stale hold responses and release orphan holds.
- `**ReserveModal`**: collects first name + instrument, shows hold countdown / securing / fallback messaging.
- `**handleReserve**`: `POST /api/reserve` with `holdId` when present.
- **Event click**: opens `**EventDetailsModal`**; **hold** events show an info toast instead.
- **Cancel path**: `**ConfirmModal`** then `POST /api/cancel` with `googleEventId`.

Helper `**formatEventTimeRange**` formats times in the event cells; `**renderEventContent**` hides title text for hold events (time only).

---

## Modals and chrome


| File                                       | Role                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ReserveModal.tsx`              | Form: first name, instrument select (Drums / Piano / Other). Modes: securing, hold (countdown to `onExpire`), fallback. Disables submit while securing. |
| `components/EventDetailsModal.tsx`         | Shows practice vs jam, title, time range; jam **Cancel** only if `canCancel`.                                                                           |
| `components/ConfirmModal.tsx`              | Generic confirm/cancel dialog (used for cancel confirmation).                                                                                           |
| `components/Toast.tsx`                     | Fixed bottom-right toast (success / error / info), auto-dismiss ~3.5s from parent.                                                                      |
| `components/InstallPrompt.tsx`             | `beforeinstallprompt` for Chromium install; iOS Safari hint (Share → Add to Home Screen); hides when standalone or dismissed.                           |
| `components/ServiceWorkerRegistration.tsx` | In **production** only, registers `**/sw.js`** on `window` `load`.                                                                                      |


---

## API routes

### `GET app/api/events/route.ts`

- Optional session: reads `**session.user.email**` for permission hints.
- Loads **practice** and **jam** calendars via `**getCalendarClient()`** for a window: **7 days ago → 30 days ahead**.
- Maps Google events to a unified JSON shape: `eventType` `**practice`** | `**jam**`, colors, `**canCancel**` for jams (owner email from `**extendedProperties.private.ownerEmail**` vs current user vs `**ADMIN_EMAIL**`).
- If `**ENABLE_TEMP_HOLDS === "true"**`, merges **pending** Supabase holds (`reservation_holds`, `expires_at` in the future) as `**eventType: "hold"`** with dashed styling class. Supabase errors are logged; events still return without holds.

### `POST app/api/reserve/route.ts`

- **Requires** signed-in user; uses `**ownerEmail`** / `**ownerName**` from session.
- Validates body: `name`, `instrument`, `start`, `end`, optional `holdId`.
- Duration **30 min–6 h**; parses ISO datetimes.
- If holds enabled and `holdId` present: loads hold from Supabase, checks owner, status `pending`, not expired, and times match (±1s). On verification failure, logs and **continues** without treating as verified (overlap check still runs).
- Lists overlapping window on **both** calendars; `**hasOverlap`** rejects if any event overlaps.
- `**calendar.events.insert**` on `**JAM_CALENDAR_ID**` with summary `"Name - Instrument"` and `**extendedProperties.private**`: `ownerEmail`, `ownerName`. Time zone from `**ROOM_TIME_ZONE**` (default `America/Los_Angeles`).
- `**createJamReservationInNotion**` — failures are **logged only** (reservation still succeeds).
- Deletes hold row after success if `holdId` was used.
- Returns the new event in the same shape the calendar expects (including `canCancel: true` for the creator).

### `POST app/api/cancel/route.ts`

- Requires sign-in.
- Fetches event from **jam** calendar, reads `**ownerEmail`** from private extended properties.
- `**canCancel**`: `**ADMIN_EMAIL**` or owner match.
- `**calendar.events.delete**` on jam calendar.
- `**markJamReservationCancelledInNotion**` — errors logged only.

### `POST app/api/holds/create/route.ts`

- Requires sign-in; validates slot duration like reserve.
- Checks Google Calendar overlap on both calendars (same as reserve).
- If `**ENABLE_TEMP_HOLDS !== "true"**` → **503** “Temporary holds unavailable.”
- Queries Supabase for overlapping **pending** holds; if any → **409**.
- Inserts row: `owner_email`, `owner_name`, `start_at`, `end_at`, `**expires_at` = now + 30 seconds**, `status: "pending"`.
- Returns `holdId`, `start`, `end`, `expiresAt`. Supabase failure → **503**.

### `POST app/api/holds/release/route.ts`

- Requires sign-in.
- If holds disabled → success no-op.
- Loads hold by `holdId`; allows delete if user is **owner** or **admin**.
- Deletes row from `reservation_holds`.

### `GET app/api/pwa-icon/route.tsx`

- `**runtime = "edge"`**.
- Query `size`: **512** or default **192** (clamped in code). The manifest also references `maskable=1`; the handler does not branch on it, so maskable and standard icons use the same generated image.
- Returns `**ImageResponse`** from `**createPwaIcon**`.

---

## Library modules (`lib/`)

### `lib/google.ts`

- Builds **JWT auth** from `**GOOGLE_CLIENT_EMAIL`**, `**GOOGLE_PRIVATE_KEY**` (newline fix `replace(/\\n/g, "\n")`), `**GOOGLE_PROJECT_ID**`.
- Scope: `https://www.googleapis.com/auth/calendar`.
- `**getCalendarClient()**` → Calendar API v3 client.

### `lib/supabase.ts`

- `**getSupabaseAdmin()**`: `**SUPABASE_URL**` + `**SUPABASE_SERVICE_ROLE_KEY**`, no session persistence (server-only).

### `lib/notion.ts`

- `**getNotionClient()**` / headers with `**NOTION_TOKEN**` and fixed API version.
- `**createJamReservationInNotion**`: `**pages.create**` with parent `**data_source_id**` from `**NOTION_DATA_SOURCE_ID**`. Properties: **Name** (title), **Instrument** (select), **Start** / **End** (date), **Google Event ID** (rich text), **Owner Email** (email), **Status** = Confirmed.
- `**markJamReservationCancelledInNotion`**: POST query to `**/v1/data_sources/{id}/query**` filtering **Google Event ID**, then `**pages.update`** **Status** → Cancelled.

### `lib/pwaIcon.tsx`

- `**ImageResponse`** (next/og) JSX: dark rounded square, “Room” / “Jam” typography — used for favicon, Apple icon, and manifest icon route.

---

## PWA: `public/sw.js`

- **Cache name** `jam-scheduler-shell-v1`.
- **Install**: precaches `/`, `/manifest.webmanifest`, PWA icon URLs.
- **Activate**: deletes other caches, `clients.claim()`.
- **Fetch**:
  - Skips non-GET, foreign origins, and `**/api/*`** (APIs always network).
  - **Navigation**: network-first, update cache; offline fallback to cached document or `/`.
  - Other same-origin GET: cache-first, then network and cache store.

---

## Supabase schema (inferred from code)

Table `**reservation_holds`** (expected columns):


| Column               | Usage                                 |
| -------------------- | ------------------------------------- |
| `id`                 | UUID (returned as `holdId`)           |
| `owner_email`        | Lowercased comparison to session      |
| `owner_name`         | Optional display metadata             |
| `start_at`, `end_at` | ISO timestamps                        |
| `expires_at`         | Hold expiry (30 seconds after create) |
| `status`             | e.g. `pending`                        |


---

## Configuration files


| File                                                     | Role                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `next.config.ts`                                         | Default/empty extension of Next config (placeholder for future options). |
| `tsconfig.json`                                          | Strict TypeScript, `@/*` paths, Next plugin.                             |
| `eslint.config.mjs` (if present) / `package.json` `lint` | ESLint with Next preset.                                                 |


---

## Request / data flow (summary)

1. **Browse**: `GET /api/events` merges Google (practice + jam) + optional Supabase holds; UI assigns colors and `canCancel` for jams.
2. **Select slot** (authenticated): `POST /api/holds/create` → optional 2-minute hold, or fallback UI if disabled/fails.
3. **Confirm**: `POST /api/reserve` → verify hold if any → overlap check → Google insert → Notion insert (best-effort) → delete hold.
4. **Cancel**: `POST /api/cancel` → authorize → Google delete → Notion status update (best-effort).

**Source of truth for “what is booked”** is **Google Calendar** (two calendars). **Notion** is a **log/audit** mirror. **Supabase** is **ephemeral coordination** for holds only.

---

## Deploy / localhost divergence (observation only)

Localhost “works” when all env vars and Google/Notion/Supabase credentials match that environment. Vercel builds can fail for reasons unrelated to business logic (for example: missing env vars at build time, Edge vs Node runtime constraints, Next.js 16 breaking changes per `AGENTS.md`). This document does not diagnose the current deploy error; use Vercel build logs and compare env configuration to the variable tables above when debugging.

**Checklist for Vercel:** For each name in the tables above that the app needs at runtime, add the same variable in the Vercel project settings (Production and Preview if you use previews). OAuth redirect URIs in Google Cloud must include your production URL.

---

## Related notes from external chat exports

- `**docs/change-log.md`**: Product intent from the pre-Cursor ChatGPT thread (clearly labeled), **git commit log** with attribution, and **do-not-regress** issues. For code-level detail, this document (`ARCHITECTURE.md`) stays authoritative.

