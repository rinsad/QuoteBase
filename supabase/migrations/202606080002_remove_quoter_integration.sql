delete from public.organization_integrations
where provider = 'quoter';

delete from public.feature_flags
where feature_name = 'quoter_integration';

alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('gmail'));
