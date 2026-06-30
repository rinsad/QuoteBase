-- P1.1 supplier price book foundation:
-- import batches, remembered column mappings, versioned supplier catalogs,
-- markup rules, and nullable quote item catalog references.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-price-books',
  'supplier-price-books',
  false,
  20971520,
  array[
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname in (
      'suppliers_id_organization_id_key',
      'supplier_price_book_suppliers_org_key'
    )
  ) then
    alter table public.suppliers
      add constraint supplier_price_book_suppliers_org_key unique (id, organization_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname in (
      'users_id_organization_id_key',
      'supplier_price_book_users_org_key'
    )
  ) then
    alter table public.users
      add constraint supplier_price_book_users_org_key unique (id, organization_id);
  end if;
end;
$$;

create table if not exists public.supplier_price_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  uploaded_by uuid not null,
  source_filename text not null,
  source_mime_type text,
  source_size_bytes bigint,
  source_storage_bucket text not null default 'supplier-price-books'
    check (source_storage_bucket = 'supplier-price-books'),
  source_storage_path text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'mapping_required', 'processing', 'imported', 'failed')),
  detected_columns jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  preview_rows jsonb not null default '[]'::jsonb,
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id),
  constraint supplier_price_imports_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint supplier_price_imports_uploaded_by_org_fk
    foreign key (uploaded_by, organization_id)
    references public.users(id, organization_id)
);

create table if not exists public.supplier_column_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  mapping_name text not null default 'Default',
  source_headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null,
  is_default boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_column_mappings_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint supplier_column_mappings_created_by_org_fk
    foreign key (created_by, organization_id)
    references public.users(id, organization_id),
  unique (organization_id, supplier_id, mapping_name)
);

create table if not exists public.supplier_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  import_id uuid,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  source_filename text,
  row_count integer not null default 0 check (row_count >= 0),
  notes text,
  effective_at timestamptz not null default now(),
  activated_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_catalog_versions_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint supplier_catalog_versions_import_org_fk
    foreign key (import_id, organization_id)
    references public.supplier_price_imports(id, organization_id),
  constraint supplier_catalog_versions_uploaded_by_org_fk
    foreign key (uploaded_by, organization_id)
    references public.users(id, organization_id),
  unique (id, organization_id),
  unique (id, supplier_id, organization_id),
  unique (organization_id, supplier_id, version_number)
);

create table if not exists public.supplier_catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  catalog_version_id uuid not null,
  sku text,
  description text not null,
  category text,
  tier text not null default 'R2' check (tier in ('R1', 'R2', 'R3', 'R4')),
  uom text not null,
  cost numeric(12,4) not null check (cost >= 0),
  raw_row jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_catalog_items_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint supplier_catalog_items_version_supplier_org_fk
    foreign key (catalog_version_id, supplier_id, organization_id)
    references public.supplier_catalog_versions(id, supplier_id, organization_id),
  unique (id, organization_id),
  unique (id, supplier_id, organization_id)
);

create table if not exists public.supplier_markup_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid,
  scope text not null check (scope in ('global', 'category', 'item')),
  category text,
  catalog_item_id uuid,
  markup_type text not null default 'percent'
    check (markup_type in ('percent', 'dollar')),
  markup_value numeric(12,4) not null check (markup_value >= 0),
  margin_floor_pct numeric(6,2) check (margin_floor_pct is null or margin_floor_pct >= 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_markup_rules_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint supplier_markup_rules_item_org_fk
    foreign key (catalog_item_id, organization_id)
    references public.supplier_catalog_items(id, organization_id),
  constraint supplier_markup_rules_created_by_org_fk
    foreign key (created_by, organization_id)
    references public.users(id, organization_id),
  constraint supplier_markup_rules_scope_fields_check check (
    (scope = 'global' and category is null and catalog_item_id is null)
    or (scope = 'category' and category is not null and catalog_item_id is null)
    or (scope = 'item' and catalog_item_id is not null)
  ),
  constraint supplier_markup_rules_effective_dates_check check (
    effective_to is null or effective_to >= effective_from
  )
);

alter table public.quote_items
  add column if not exists supplier_catalog_version_id uuid,
  add column if not exists supplier_catalog_item_id uuid;

alter table public.materials
  add column if not exists supplier_catalog_version_id uuid,
  add column if not exists supplier_catalog_item_id uuid,
  add column if not exists catalog_sku text,
  add column if not exists catalog_category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_supplier_catalog_version_org_fk'
  ) then
    alter table public.materials
      add constraint materials_supplier_catalog_version_org_fk
      foreign key (supplier_catalog_version_id, organization_id)
      references public.supplier_catalog_versions(id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'materials_supplier_catalog_item_org_fk'
  ) then
    alter table public.materials
      add constraint materials_supplier_catalog_item_org_fk
      foreign key (supplier_catalog_item_id, supplier_id, organization_id)
      references public.supplier_catalog_items(id, supplier_id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'quote_items_supplier_catalog_version_org_fk'
  ) then
    alter table public.quote_items
      add constraint quote_items_supplier_catalog_version_org_fk
      foreign key (supplier_catalog_version_id, organization_id)
      references public.supplier_catalog_versions(id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'quote_items_supplier_catalog_item_org_fk'
  ) then
    alter table public.quote_items
      add constraint quote_items_supplier_catalog_item_org_fk
      foreign key (supplier_catalog_item_id, supplier_id, organization_id)
      references public.supplier_catalog_items(id, supplier_id, organization_id);
  end if;
end;
$$;

create index if not exists idx_supplier_price_imports_org_supplier
on public.supplier_price_imports(organization_id, supplier_id, created_at desc);

create index if not exists idx_supplier_column_mappings_org_supplier_default
on public.supplier_column_mappings(organization_id, supplier_id, is_default);

create unique index if not exists uq_supplier_column_mappings_one_default
on public.supplier_column_mappings(organization_id, supplier_id)
where is_default;

create index if not exists idx_supplier_catalog_versions_org_supplier_status
on public.supplier_catalog_versions(organization_id, supplier_id, status, version_number desc);

create unique index if not exists uq_supplier_catalog_versions_one_active
on public.supplier_catalog_versions(organization_id, supplier_id)
where status = 'active';

create index if not exists idx_supplier_catalog_items_org_supplier_version
on public.supplier_catalog_items(organization_id, supplier_id, catalog_version_id);

create index if not exists idx_supplier_catalog_items_org_search
on public.supplier_catalog_items(organization_id, lower(description), lower(coalesce(sku, '')));

create unique index if not exists uq_supplier_catalog_items_version_sku
on public.supplier_catalog_items(organization_id, catalog_version_id, lower(sku))
where sku is not null;

create index if not exists idx_supplier_markup_rules_org_scope
on public.supplier_markup_rules(organization_id, scope, is_active, priority);

create index if not exists idx_supplier_markup_rules_item
on public.supplier_markup_rules(organization_id, catalog_item_id)
where catalog_item_id is not null;

create index if not exists idx_quote_items_catalog_item
on public.quote_items(organization_id, supplier_catalog_item_id)
where supplier_catalog_item_id is not null;

create index if not exists idx_materials_catalog_item
on public.materials(organization_id, supplier_catalog_item_id)
where supplier_catalog_item_id is not null;

drop trigger if exists set_supplier_column_mappings_updated_at on public.supplier_column_mappings;
create trigger set_supplier_column_mappings_updated_at
  before update on public.supplier_column_mappings
  for each row execute function public.set_updated_at();

drop trigger if exists set_supplier_catalog_versions_updated_at on public.supplier_catalog_versions;
create trigger set_supplier_catalog_versions_updated_at
  before update on public.supplier_catalog_versions
  for each row execute function public.set_updated_at();

drop trigger if exists set_supplier_catalog_items_updated_at on public.supplier_catalog_items;
create trigger set_supplier_catalog_items_updated_at
  before update on public.supplier_catalog_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_supplier_markup_rules_updated_at on public.supplier_markup_rules;
create trigger set_supplier_markup_rules_updated_at
  before update on public.supplier_markup_rules
  for each row execute function public.set_updated_at();

alter table public.supplier_price_imports enable row level security;
alter table public.supplier_column_mappings enable row level security;
alter table public.supplier_catalog_versions enable row level security;
alter table public.supplier_catalog_items enable row level security;
alter table public.supplier_markup_rules enable row level security;

drop policy if exists "users_read_own_org_supplier_price_book_objects" on storage.objects;
create policy "users_read_own_org_supplier_price_book_objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'supplier-price-books'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
);

drop policy if exists "admins_account_managers_insert_own_org_supplier_price_book_objects" on storage.objects;
create policy "admins_account_managers_insert_own_org_supplier_price_book_objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'supplier-price-books'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_price_book_objects" on storage.objects;
create policy "admins_account_managers_update_own_org_supplier_price_book_objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'supplier-price-books'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  bucket_id = 'supplier-price-books'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_supplier_price_imports" on public.supplier_price_imports;
create policy "users_read_own_org_supplier_price_imports"
on public.supplier_price_imports for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_price_imports" on public.supplier_price_imports;
drop policy if exists "admins_account_managers_insert_own_org_supplier_price_imports" on public.supplier_price_imports;
create policy "admins_account_managers_insert_own_org_supplier_price_imports"
on public.supplier_price_imports for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_price_imports" on public.supplier_price_imports;
create policy "admins_account_managers_update_own_org_supplier_price_imports"
on public.supplier_price_imports for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_supplier_column_mappings" on public.supplier_column_mappings;
create policy "users_read_own_org_supplier_column_mappings"
on public.supplier_column_mappings for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_column_mappings" on public.supplier_column_mappings;
drop policy if exists "admins_account_managers_insert_own_org_supplier_column_mappings" on public.supplier_column_mappings;
create policy "admins_account_managers_insert_own_org_supplier_column_mappings"
on public.supplier_column_mappings for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_column_mappings" on public.supplier_column_mappings;
create policy "admins_account_managers_update_own_org_supplier_column_mappings"
on public.supplier_column_mappings for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_supplier_catalog_versions" on public.supplier_catalog_versions;
create policy "users_read_own_org_supplier_catalog_versions"
on public.supplier_catalog_versions for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_catalog_versions" on public.supplier_catalog_versions;
drop policy if exists "admins_account_managers_insert_own_org_supplier_catalog_versions" on public.supplier_catalog_versions;
create policy "admins_account_managers_insert_own_org_supplier_catalog_versions"
on public.supplier_catalog_versions for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_catalog_versions" on public.supplier_catalog_versions;
create policy "admins_account_managers_update_own_org_supplier_catalog_versions"
on public.supplier_catalog_versions for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_supplier_catalog_items" on public.supplier_catalog_items;
create policy "users_read_own_org_supplier_catalog_items"
on public.supplier_catalog_items for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_catalog_items" on public.supplier_catalog_items;
drop policy if exists "admins_account_managers_insert_own_org_supplier_catalog_items" on public.supplier_catalog_items;
create policy "admins_account_managers_insert_own_org_supplier_catalog_items"
on public.supplier_catalog_items for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_catalog_items" on public.supplier_catalog_items;
create policy "admins_account_managers_update_own_org_supplier_catalog_items"
on public.supplier_catalog_items for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_supplier_markup_rules" on public.supplier_markup_rules;
create policy "users_read_own_org_supplier_markup_rules"
on public.supplier_markup_rules for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_supplier_markup_rules" on public.supplier_markup_rules;
drop policy if exists "admins_account_managers_insert_own_org_supplier_markup_rules" on public.supplier_markup_rules;
create policy "admins_account_managers_insert_own_org_supplier_markup_rules"
on public.supplier_markup_rules for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_own_org_supplier_markup_rules" on public.supplier_markup_rules;
create policy "admins_account_managers_update_own_org_supplier_markup_rules"
on public.supplier_markup_rules for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);
