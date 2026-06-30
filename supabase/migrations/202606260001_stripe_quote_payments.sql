-- Add Stripe as a tenant-scoped hosted payment provider alongside Authorize.net.

alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail', 'slack', 'pipedrive', 'authorizenet', 'openai', 'stripe'));

alter table public.quote_payment_attempts
drop constraint if exists quote_payment_attempts_provider_check;

alter table public.quote_payment_attempts
add constraint quote_payment_attempts_provider_check
check (provider in ('authorizenet', 'stripe'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
select
  id,
  'stripe',
  false,
  '{}'::jsonb
from public.organizations
on conflict (organization_id, provider) do nothing;
