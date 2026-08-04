alter table public.quotes
  add column if not exists job_start_date date,
  add column if not exists job_end_date date,
  add column if not exists followup_attempt_count integer not null default 0,
  add column if not exists followup_max_attempts integer not null default 5;

with sent_followups as (
  select
    organization_id,
    quote_id,
    count(*)::integer as sent_count
  from public.quote_follow_up_drafts
  where status = 'sent'
  group by organization_id, quote_id
)
update public.quotes as quote
set
  followup_attempt_count = least(
    sent_followups.sent_count,
    quote.followup_max_attempts
  ),
  followup_date = case
    when sent_followups.sent_count >= quote.followup_max_attempts then null
    else quote.followup_date
  end
from sent_followups
where quote.organization_id = sent_followups.organization_id
  and quote.id = sent_followups.quote_id;

alter table public.quotes
  drop constraint if exists quotes_job_dates_order_check,
  add constraint quotes_job_dates_order_check
  check (
    job_start_date is null
    or job_end_date is null
    or job_end_date >= job_start_date
  );

alter table public.quotes
  drop constraint if exists quotes_followup_attempt_count_check,
  add constraint quotes_followup_attempt_count_check
  check (followup_attempt_count >= 0);

alter table public.quotes
  drop constraint if exists quotes_followup_max_attempts_check,
  add constraint quotes_followup_max_attempts_check
  check (followup_max_attempts between 3 and 5);

create index if not exists idx_quotes_jobs_starting_soon
on public.quotes(organization_id, job_start_date, status, is_active)
where job_start_date is not null;

create index if not exists idx_quotes_followup_attempt_window
on public.quotes(
  organization_id,
  followup_date,
  status,
  followup_attempt_count,
  followup_max_attempts,
  is_active
)
where followup_date is not null;
