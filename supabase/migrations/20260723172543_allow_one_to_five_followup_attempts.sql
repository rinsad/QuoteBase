alter table public.pricing_config
  drop constraint if exists pricing_config_default_followup_max_attempts_check,
  add constraint pricing_config_default_followup_max_attempts_check
  check (default_followup_max_attempts between 1 and 5);

alter table public.quotes
  drop constraint if exists quotes_followup_max_attempts_check,
  add constraint quotes_followup_max_attempts_check
  check (followup_max_attempts between 1 and 5);
