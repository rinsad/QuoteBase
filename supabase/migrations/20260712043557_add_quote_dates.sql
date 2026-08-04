alter table public.quotes
  add column if not exists quote_date date,
  add column if not exists expires_at date;

update public.quotes
set
  quote_date = coalesce(quote_date, created_at::date),
  expires_at = coalesce(expires_at, created_at::date + interval '30 days')
where quote_date is null
   or expires_at is null;

alter table public.quotes
  alter column quote_date set not null,
  alter column expires_at set not null;

alter table public.quotes
  drop constraint if exists quotes_expiration_after_quote_date_check;

alter table public.quotes
  add constraint quotes_expiration_after_quote_date_check
  check (expires_at >= quote_date);

create index if not exists idx_quotes_org_expires_at
on public.quotes(organization_id, expires_at, status, is_active);
