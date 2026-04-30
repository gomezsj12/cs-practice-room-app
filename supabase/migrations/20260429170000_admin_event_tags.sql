-- Admin-private color tags for calendar events.
-- These tags decorate the calendar only for the admin who created them and
-- do not modify shared Google Calendar / Notion data.

create table public.admin_event_tags (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  event_type text not null check (event_type in ('practice', 'jam')),
  google_event_id text not null,
  event_title text not null,
  event_start timestamptz not null,
  event_end timestamptz not null,
  tag_key text not null check (tag_key in ('amber', 'rose', 'emerald', 'orange', 'lime')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_event_tags_admin_event_unique
    unique (admin_email, event_type, google_event_id)
);

alter table public.admin_event_tags enable row level security;

revoke all on table public.admin_event_tags from anon;
revoke all on table public.admin_event_tags from authenticated;
