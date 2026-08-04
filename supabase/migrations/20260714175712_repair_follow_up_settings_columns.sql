alter table public.pricing_config
  add column if not exists big_quote_threshold numeric(12,2) not null default 10000
    check (big_quote_threshold > 0),
  add column if not exists follow_up_auto_send_enabled boolean not null default false,
  add column if not exists follow_up_sms_enabled boolean not null default false;

alter table public.quote_follow_up_drafts
  drop constraint if exists quote_follow_up_drafts_stage_day_check,
  add constraint quote_follow_up_drafts_stage_day_check
  check (stage_day between 1 and 365);

update public.pricing_config
set
  big_quote_threshold = coalesce(big_quote_threshold, 10000),
  default_followup_max_attempts = coalesce(default_followup_max_attempts, 5),
  jobs_starting_soon_days = coalesce(jobs_starting_soon_days, 14),
  follow_up_auto_send_enabled = coalesce(follow_up_auto_send_enabled, false),
  follow_up_sms_enabled = coalesce(follow_up_sms_enabled, false),
  project_status_options = case
    when project_status_options is null
      or jsonb_typeof(project_status_options) <> 'array'
      or jsonb_array_length(project_status_options) = 0
    then '[{"value":"bid","label":"Bid"},{"value":"existing_job","label":"Existing job"}]'::jsonb
    else project_status_options
  end;
