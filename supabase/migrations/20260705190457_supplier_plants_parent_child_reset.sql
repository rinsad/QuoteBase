-- Reset test supplier/plant/material/quote data and introduce a true
-- supplier -> plant hierarchy. Existing internal supplier_id columns on
-- materials/catalog/quote rows now point at supplier_plants(id).

create table if not exists public.supplier_plants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  name text not null,
  address jsonb not null default '{}'::jsonb,
  latitude numeric(10,7),
  longitude numeric(10,7),
  hours text,
  primary_contact_name text,
  primary_contact_phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, supplier_id, organization_id),
  unique (organization_id, supplier_id, name),
  constraint supplier_plants_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id)
);

create index if not exists idx_supplier_plants_org_supplier_active
on public.supplier_plants(organization_id, supplier_id, is_active);

drop trigger if exists set_supplier_plants_updated_at on public.supplier_plants;
create trigger set_supplier_plants_updated_at
  before update on public.supplier_plants
  for each row execute function public.set_updated_at();

alter table public.supplier_plants enable row level security;

drop policy if exists "users_read_own_org_supplier_plants" on public.supplier_plants;
create policy "users_read_own_org_supplier_plants"
on public.supplier_plants for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_plants" on public.supplier_plants;
create policy "admins_account_managers_manage_own_org_supplier_plants"
on public.supplier_plants for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

do $$
begin
  alter table public.customers
    drop constraint if exists customers_default_plant_org_fk;

  alter table public.materials
    drop constraint if exists materials_supplier_id_fkey;

  alter table public.quote_items
    drop constraint if exists quote_items_supplier_org_fk;

  alter table public.supplier_price_imports
    drop constraint if exists supplier_price_imports_supplier_org_fk;

  alter table public.supplier_column_mappings
    drop constraint if exists supplier_column_mappings_supplier_org_fk;

  alter table public.supplier_catalog_versions
    drop constraint if exists supplier_catalog_versions_supplier_org_fk;

  alter table public.supplier_catalog_items
    drop constraint if exists supplier_catalog_items_supplier_org_fk;

  alter table public.supplier_markup_rules
    drop constraint if exists supplier_markup_rules_supplier_org_fk;
end;
$$;

do $$
begin
  update public.crm_deals set quote_id = null where quote_id is not null;
  update public.quotes set parent_quote_id = null where parent_quote_id is not null;

  delete from public.quote_response_proofs;
  delete from public.quote_public_events;
  delete from public.quote_payment_attempts;
  delete from public.quote_public_links;
  delete from public.quote_follow_up_drafts;
  delete from public.quote_documents;
  delete from public.quote_items;
  delete from public.quotes;

  update public.customers set default_plant_id = null where default_plant_id is not null;

  delete from public.material_price_history;
  delete from public.materials;
  delete from public.supplier_markup_rules;
  delete from public.supplier_catalog_items;
  delete from public.supplier_catalog_versions;
  delete from public.supplier_column_mappings;
  delete from public.supplier_price_imports;
  delete from public.supplier_plants;
  delete from public.suppliers;
end;
$$;

alter table public.customers
  add constraint customers_default_plant_org_fk
  foreign key (default_plant_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.materials
  add constraint materials_supplier_id_fkey
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.quote_items
  add constraint quote_items_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.supplier_price_imports
  add constraint supplier_price_imports_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.supplier_column_mappings
  add constraint supplier_column_mappings_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.supplier_catalog_versions
  add constraint supplier_catalog_versions_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.supplier_catalog_items
  add constraint supplier_catalog_items_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);

alter table public.supplier_markup_rules
  add constraint supplier_markup_rules_supplier_org_fk
  foreign key (supplier_id, organization_id)
  references public.supplier_plants(id, organization_id);
