-- Update admin_event_tags CHECK constraint to match the current color palette.
-- Old palette: amber, rose, emerald, orange, lime
-- New palette: rose, orange, yellow, emerald, sky, violet

-- Migrate any rows still using removed colors to their closest replacements.
update public.admin_event_tags set tag_key = 'emerald' where tag_key = 'lime';
update public.admin_event_tags set tag_key = 'orange'  where tag_key = 'amber';

alter table public.admin_event_tags
  drop constraint admin_event_tags_tag_key_check;

alter table public.admin_event_tags
  add constraint admin_event_tags_tag_key_check
    check (tag_key in ('rose', 'orange', 'yellow', 'emerald', 'sky', 'violet'));
