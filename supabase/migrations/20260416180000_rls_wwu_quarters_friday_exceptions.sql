-- Enable RLS and revoke anon/authenticated access on tables added after the
-- initial enable_rls_on_all_tables migration. App access is service-role only.

alter table public.wwu_quarters enable row level security;
alter table public.friday_exceptions enable row level security;

revoke all on table public.wwu_quarters from anon;
revoke all on table public.wwu_quarters from authenticated;
revoke all on table public.friday_exceptions from anon;
revoke all on table public.friday_exceptions from authenticated;
