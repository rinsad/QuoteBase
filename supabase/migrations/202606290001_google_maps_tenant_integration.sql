alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail', 'slack', 'pipedrive', 'authorizenet', 'openai', 'stripe', 'google_maps'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config,
  credentials_last4
)
select
  id,
  'google_maps',
  false,
  '{}'::jsonb,
  jsonb_build_object('api_key', null)
from public.organizations
on conflict (organization_id, provider) do nothing;
