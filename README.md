## CS Practice Room App

This project is a new portal app for the CS Practice Room. It keeps the existing jam reservation flow, adds a dedicated booking-form page, and creates a homepage for student navigation and future support tools.

## Getting Started

1. Copy environment variables into `.env.local`.
2. Add environment variables in `.env.local` (see `docs/ARCHITECTURE.md` for the full list). Commonly needed:
   - `NEXT_PUBLIC_FILLOUT_URL`
   - `NEXT_PUBLIC_TELEGRAM_CONTACT_URL`
   - `NEXT_PUBLIC_TELEGRAM_GROUP_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_SUPPORT_ADMIN_CHAT_ID`
   - `TELEGRAM_WEBHOOK_SECRET`
   - **`NOTION_WWU_QUARTERS_DATA_SOURCE_ID`** — Notion **WWU Quarters** data source id (so the calendar can resolve term bounds; optional locally if you rely on the rolling fallback).
   - **`CRON_SECRET`** — shared secret for `Authorization: Bearer …` on **`/api/cron/sync-quarters`** (Vercel Cron and manual sync); required in production if you use the sync route.
   - **`NOTION_WEBHOOK_VERIFICATION_TOKEN`** — required wherever `POST /api/webhooks/notion` is reachable (same value Notion uses for `X-Notion-Signature`).
   - **`TELEGRAM_WEBHOOK_SECRET`** — required in **production** (`VERCEL_ENV=production`) for `POST /api/support/telegram-webhook`; must match Telegram’s webhook secret token header.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full variable list and the **Webhooks and cron** table.

**Vercel dashboard:** for API keys, webhook secrets, and `GOOGLE_PRIVATE_KEY`, use **Sensitive** env vars so values stay masked for teammates ([ARCHITECTURE.md — Vercel: Sensitive vs plain](docs/ARCHITECTURE.md#vercel-sensitive-vs-plain-dashboard)). After linking the CLI, run `npm run vercel:mark-sensitive` once to upgrade existing rows without changing names or values.

**Quarter sync:** Notion quarters are mirrored into Supabase table **`wwu_quarters`** by the cron route. Apply the migration in `supabase/migrations/`. On **Vercel Hobby**, `vercel.json` uses **one daily** cron (09:00 UTC); run a manual sync after Notion edits if you need immediate updates, or upgrade to Pro for more frequent schedules.
3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Browser Verification

Browser verification guidance lives in `docs/BROWSER_VERIFICATION.md`.

Use Playwright when you want a repo-local browser check that does not depend on Cursor's browser MCP tools.

```bash
npm run test:e2e
```

Useful variants:

- `npm run test:e2e:headed` to watch Chromium run locally
- `npm run test:e2e:ui` to use Playwright's interactive test runner

The Playwright config starts `npm run dev` automatically for the test run and reuses an existing local server when possible.

For Cursor agent browser checks, the same guide also documents the recommended `cursor-ide-browser` MCP workflow.

## Main Routes

- `/` homepage and navigation hub
- `/booking` embedded practice-room booking form
- `/calendar` practice room calendar (practice + jam reservations)
- `/support` signed-in support inbox

## Support inbox setup (Phase 3)

Create these Supabase tables:

```sql
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  user_name text,
  status text not null default 'open',
  unread_for_user boolean not null default false,
  telegram_chat_id text,
  telegram_root_message_id bigint,
  telegram_topic_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_threads_user_email
  on public.support_threads (user_email);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  author_type text not null check (author_type in ('user', 'admin')),
  body text not null,
  source text not null check (source in ('app', 'telegram')),
  telegram_update_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_thread_created
  on public.support_messages (thread_id, created_at);
```

Configure your Telegram bot webhook to:

`/api/support/telegram-webhook`

Admin reply formats in Telegram:

- `/reply SR-<thread-id> your reply text`
- Preferred: use Telegram’s normal **Reply** action on a bot support request message and type your response text.
- `/close` (sent as a reply in the admin chat) closes that support conversation in the app UI.

Support inbox UI now includes:
- Conversation list (latest message + unread)
- Selected conversation view
- In-thread user follow-up composer
- User delete conversation action

## Important Context

- Jam scheduler architecture and integration notes are retained in `docs/ARCHITECTURE.md`
- Agent collaboration guidance is retained in `AGENTS.md` and `.cursor/rules/`
- Use `.env.example` as the safe checklist for new environments
