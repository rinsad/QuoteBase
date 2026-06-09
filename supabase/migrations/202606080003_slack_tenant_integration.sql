alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('gmail', 'slack'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config,
  credentials_last4
)
select
  organizations.id,
  'slack',
  false,
  jsonb_build_object('approver_email', null),
  '{}'::jsonb
from public.organizations
on conflict (organization_id, provider) do nothing;
