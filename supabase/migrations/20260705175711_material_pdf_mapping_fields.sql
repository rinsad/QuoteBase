-- Material PDF mapper fields:
-- Store mapped supplier PDF fields on both the versioned catalog item and the
-- active material row used by quote setup.

update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'text/plain',
  'application/csv',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[]
where id = 'supplier-price-books';

alter table public.supplier_catalog_items
  add column if not exists material_price numeric(12,4) check (material_price is null or material_price >= 0),
  add column if not exists per_ton numeric(12,4) check (per_ton is null or per_ton >= 0),
  add column if not exists surcharge_per_load numeric(12,4) check (surcharge_per_load is null or surcharge_per_load >= 0),
  add column if not exists source_plant text,
  add column if not exists quote_number text,
  add column if not exists effective_through text;

alter table public.materials
  add column if not exists catalog_material_price numeric(12,4) check (catalog_material_price is null or catalog_material_price >= 0),
  add column if not exists catalog_per_ton numeric(12,4) check (catalog_per_ton is null or catalog_per_ton >= 0),
  add column if not exists catalog_surcharge_per_load numeric(12,4) check (catalog_surcharge_per_load is null or catalog_surcharge_per_load >= 0),
  add column if not exists catalog_source_plant text,
  add column if not exists catalog_quote_number text,
  add column if not exists catalog_effective_through text,
  add column if not exists catalog_raw_row jsonb not null default '{}'::jsonb;

create index if not exists idx_supplier_catalog_items_source_plant
on public.supplier_catalog_items(organization_id, supplier_id, lower(coalesce(source_plant, '')))
where source_plant is not null;

create index if not exists idx_materials_catalog_source_plant
on public.materials(organization_id, supplier_id, lower(coalesce(catalog_source_plant, '')))
where catalog_source_plant is not null;
