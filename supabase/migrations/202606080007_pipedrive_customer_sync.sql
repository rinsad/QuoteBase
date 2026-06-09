-- Customer sync metadata. Pipedrive owns CRM customer fields; WM-only fields
-- stay in QuoteBase and are never sent in Pipedrive payloads.

alter table public.customers
add column if not exists pipedrive_person_id text,
add column if not exists pipedrive_organization_id text,
add column if not exists pipedrive_updated_at timestamptz,
add column if not exists pipedrive_synced_at timestamptz,
add column if not exists sync_source text not null default 'wm'
  check (sync_source in ('wm', 'pipedrive', 'cron')),
add column if not exists default_plant_id uuid,
add column if not exists pricing_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_default_plant_org_fk'
  ) then
    alter table public.customers
    add constraint customers_default_plant_org_fk
      foreign key (default_plant_id, organization_id)
      references public.suppliers(id, organization_id);
  end if;
end;
$$;

create unique index if not exists idx_customers_org_pipedrive_person
on public.customers(organization_id, pipedrive_person_id)
where pipedrive_person_id is not null;

create index if not exists idx_customers_org_pipedrive_synced
on public.customers(organization_id, pipedrive_synced_at desc);

alter table public.organization_integrations
drop constraint if exists organization_integrations_provider_check;

alter table public.organization_integrations
add constraint organization_integrations_provider_check
check (provider in ('quoter', 'gmail', 'slack', 'pipedrive'));

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
select
  organizations.id,
  'pipedrive',
  false,
  jsonb_build_object(
    'api_base_url', 'https://api.pipedrive.com/v1',
    'sync_interval_minutes', 30,
    'source_of_truth', 'pipedrive'
  )
from public.organizations
on conflict (organization_id, provider) do nothing;
