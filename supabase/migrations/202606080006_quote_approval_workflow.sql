-- A.5.2 quote approval workflow support.

alter table public.quotes
drop constraint if exists quotes_status_check;

alter table public.quotes
add constraint quotes_status_check
check (
  status in (
    'draft',
    'pending_approval',
    'changes_requested',
    'approved',
    'rejected',
    'sent',
    'viewed',
    'accepted',
    'declined',
    'expired'
  )
);

alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail', 'slack'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config,
  credentials_last4
)
select
  organizations.id,
  'quoter',
  false,
  jsonb_build_object(
    'api_base_url', 'https://api.quoter.com/v1',
    'currency_abbr', 'USD'
  ),
  '{}'::jsonb
from public.organizations
on conflict (organization_id, provider) do nothing;
