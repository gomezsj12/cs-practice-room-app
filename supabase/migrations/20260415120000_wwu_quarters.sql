-- WWU academic quarters synced from Notion (via cron). Used for calendar
-- event fetch window and FullCalendar validRange — not exposed to the browser.

create table wwu_quarters (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  name text not null,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  constraint wwu_quarters_end_after_start check (end_date >= start_date)
);

create index wwu_quarters_date_span on wwu_quarters (start_date, end_date);
