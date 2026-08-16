alter table public.customers
  add column if not exists crm_provider text not null default 'quotebase',
  add column if not exists crm_external_id text,
  add column if not exists crm_synced_at timestamptz;

alter table public.customers
  drop constraint if exists customers_crm_provider_check;

alter table public.customers
  add constraint customers_crm_provider_check
  check (crm_provider in ('quotebase', 'pipedrive', 'salesforce', 'hubspot', 'zoho'));

update public.customers
set
  crm_provider = 'pipedrive',
  crm_external_id = coalesce(pipedrive_person_id, pipedrive_organization_id),
  crm_synced_at = pipedrive_synced_at
where sync_source = 'pipedrive';

create unique index if not exists idx_customers_org_crm_identity
on public.customers(organization_id, crm_provider, crm_external_id);

create index if not exists idx_customers_org_crm_search
on public.customers(organization_id, is_active, crm_provider, name);

alter table public.organization_integrations
  drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
  add constraint organization_integrations_provider_check
  check (provider in (
    'quoter', 'gmail', 'slack', 'pipedrive', 'salesforce', 'hubspot', 'zoho',
    'authorizenet', 'openai', 'stripe', 'google_maps', 'mapbox'
  ));

insert into public.organization_integrations (organization_id, provider, is_enabled, config)
select organizations.id, providers.provider, false, '{}'::jsonb
from public.organizations
cross join (values ('salesforce'), ('hubspot'), ('zoho')) as providers(provider)
on conflict (organization_id, provider) do nothing;
