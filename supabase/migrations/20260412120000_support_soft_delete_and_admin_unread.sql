-- Support soft-delete visibility and admin unread flags.
-- Run in Supabase SQL editor or via supabase db push.

alter table support_threads
  add column if not exists hidden_from_user boolean not null default false;

alter table support_threads
  add column if not exists hidden_from_admin boolean not null default false;

alter table support_threads
  add column if not exists unread_for_admin boolean not null default false;

alter table support_threads
  add column if not exists staff_replied_from_app boolean not null default false;
