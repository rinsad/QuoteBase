alter table public.pricing_config
  add column if not exists default_followup_max_attempts integer not null default 5,
  add column if not exists jobs_starting_soon_days integer not null default 14;

alter table public.pricing_config
  drop constraint if exists pricing_config_default_followup_max_attempts_check,
  add constraint pricing_config_default_followup_max_attempts_check
  check (default_followup_max_attempts between 3 and 5);

alter table public.pricing_config
  drop constraint if exists pricing_config_jobs_starting_soon_days_check,
  add constraint pricing_config_jobs_starting_soon_days_check
  check (jobs_starting_soon_days between 1 and 120);
