## CS Practice Room App

This project is a new portal app for the CS Practice Room. It keeps the existing jam reservation flow, adds a dedicated booking-form page, and creates a homepage for student navigation and future support tools.

## Getting Started

1. Copy environment variables into `.env.local`.
2. Add environment variables in `.env.local`:
   - `NEXT_PUBLIC_FILLOUT_URL`
   - `NEXT_PUBLIC_TELEGRAM_CONTACT_URL`
   - `NEXT_PUBLIC_TELEGRAM_GROUP_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_SUPPORT_ADMIN_CHAT_ID`
   - `TELEGRAM_WEBHOOK_SECRET`
3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Main Routes

- `/` homepage and navigation hub
- `/booking` embedded practice-room booking form
- `/jam` jam reservation calendar
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
