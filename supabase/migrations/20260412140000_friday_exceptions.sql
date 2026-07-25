-- Allow admins to open the practice room on specific Fridays that are
-- normally blocked by the hard-coded "closed for jam" overlay.
-- A row here means "this Friday is an exception: the room is open."

create table friday_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  created_by text not null,
  created_at timestamptz not null default now()
);
