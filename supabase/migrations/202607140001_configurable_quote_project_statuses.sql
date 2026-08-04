alter table public.pricing_config
  add column if not exists project_status_options jsonb not null default
  '[{"value":"bid","label":"Bid"},{"value":"existing_job","label":"Existing job"}]'::jsonb;

alter table public.quotes
  drop constraint if exists quotes_project_status_check;

alter table public.quotes
  add constraint quotes_project_status_not_blank_check
  check (length(trim(project_status)) > 0);
