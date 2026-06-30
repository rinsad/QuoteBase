-- Add Authorize.net hosted payment support for COD quote acceptance.

alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail', 'slack', 'pipedrive', 'authorizenet'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
values (
  '00000000-0000-0000-0000-000000000001',
  'authorizenet',
  false,
  jsonb_build_object('environment', 'sandbox')
)
on conflict (organization_id, provider) do nothing;

create table if not exists public.quote_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  public_link_id uuid not null,
  provider text not null default 'authorizenet'
    check (provider in ('authorizenet')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  status text not null default 'created'
    check (status in ('created', 'tokenized', 'paid', 'failed', 'cancelled')),
  response_note text,
  hosted_token_created_at timestamptz,
  provider_transaction_id text,
  provider_response_code text,
  provider_auth_code text,
  provider_account_type text,
  provider_account_number text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint quote_payment_attempts_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_payment_attempts_public_link_org_fk
    foreign key (public_link_id, organization_id)
    references public.quote_public_links(id, organization_id)
);

create index if not exists idx_quote_payment_attempts_quote_status
on public.quote_payment_attempts(organization_id, quote_id, status);

create index if not exists idx_quote_payment_attempts_public_link
on public.quote_payment_attempts(organization_id, public_link_id);

create unique index if not exists idx_quote_payment_attempts_provider_transaction
on public.quote_payment_attempts(organization_id, provider, provider_transaction_id)
where provider_transaction_id is not null;

drop trigger if exists set_quote_payment_attempts_updated_at on public.quote_payment_attempts;
create trigger set_quote_payment_attempts_updated_at
  before update on public.quote_payment_attempts
  for each row
  execute function public.set_updated_at();

alter table public.quote_payment_attempts enable row level security;

drop policy if exists "users_read_own_org_quote_payment_attempts" on public.quote_payment_attempts;
create policy "users_read_own_org_quote_payment_attempts"
on public.quote_payment_attempts for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_quote_payment_attempts" on public.quote_payment_attempts;
create policy "admins_manage_own_org_quote_payment_attempts"
on public.quote_payment_attempts for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);
