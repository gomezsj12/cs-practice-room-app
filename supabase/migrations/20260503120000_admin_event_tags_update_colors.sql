-- Update admin_event_tags CHECK constraint to match the current color palette.
-- Old palette: amber, rose, emerald, orange, lime
-- New palette: rose, orange, yellow, emerald, sky, violet

alter table public.admin_event_tags
  drop constraint admin_event_tags_tag_key_check;

alter table public.admin_event_tags
  add constraint admin_event_tags_tag_key_check
    check (tag_key in ('rose', 'orange', 'yellow', 'emerald', 'sky', 'violet'));
