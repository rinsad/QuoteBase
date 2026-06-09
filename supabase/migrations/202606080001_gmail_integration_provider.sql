-- Add Gmail as a tenant-scoped integration provider.
alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
values (
  '00000000-0000-0000-0000-000000000001',
  'gmail',
  false,
  '{}'::jsonb
)
on conflict (organization_id, provider) do nothing;
