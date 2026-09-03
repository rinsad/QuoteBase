alter table public.organization_integrations
  drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
  add constraint organization_integrations_provider_check
  check (provider in (
    'quoter', 'gmail', 'slack', 'pipedrive', 'salesforce', 'hubspot', 'zoho',
    'authorizenet', 'openai', 'stripe', 'google_maps', 'mapbox', 'google_sheets'
  ));

alter table public.suppliers
  add column if not exists google_sheet_sync_key text,
  add column if not exists google_sheet_synced_at timestamptz;

alter table public.supplier_plants
  add column if not exists google_sheet_sync_key text,
  add column if not exists google_sheet_synced_at timestamptz;

alter table public.materials
  add column if not exists google_sheet_sync_key text,
  add column if not exists google_sheet_synced_at timestamptz;

create unique index if not exists uq_suppliers_google_sheet_sync_key
  on public.suppliers(organization_id, google_sheet_sync_key)
  where google_sheet_sync_key is not null;

create unique index if not exists uq_supplier_plants_google_sheet_sync_key
  on public.supplier_plants(organization_id, google_sheet_sync_key)
  where google_sheet_sync_key is not null;

create unique index if not exists uq_materials_google_sheet_sync_key
  on public.materials(organization_id, google_sheet_sync_key)
  where google_sheet_sync_key is not null;

create index if not exists idx_suppliers_google_sheet_sync
  on public.suppliers(organization_id, google_sheet_synced_at)
  where google_sheet_sync_key is not null;

create index if not exists idx_supplier_plants_google_sheet_sync
  on public.supplier_plants(organization_id, google_sheet_synced_at)
  where google_sheet_sync_key is not null;

create index if not exists idx_materials_google_sheet_sync
  on public.materials(organization_id, google_sheet_synced_at)
  where google_sheet_sync_key is not null;

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
select id, 'google_sheets', false, '{}'::jsonb
from public.organizations
on conflict (organization_id, provider) do nothing;
