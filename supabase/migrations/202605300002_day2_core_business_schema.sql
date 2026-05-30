-- Day 2 core business schema: suppliers, materials, pricing config,
-- vehicle types, yards, tax rates, audit log, and distance cache.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  parent_company text,
  address jsonb not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  hours text,
  primary_contact_name text,
  primary_contact_phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  name text not null,
  description text,
  tier text not null check (tier in ('R1', 'R2', 'R3', 'R4')),
  unit text not null check (unit in ('ton', 'cy', 'load', 'bag', 'sqft', 'lbs', 'each')),
  cost_per_unit numeric(10,2) not null,
  last_price_update date,
  minimum_order_quantity numeric(10,2),
  special_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_id, name, unit)
);

create table if not exists public.material_price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  material_id uuid not null references public.materials(id),
  old_price numeric(10,2),
  new_price numeric(10,2) not null,
  changed_by uuid not null references public.users(id),
  changed_at timestamptz not null default now(),
  notes text
);

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  capacity_tons numeric(5,2) not null,
  capacity_cy numeric(5,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.yards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  address jsonb not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.pricing_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id),
  tier_r1_min numeric(6,2) not null default 4.00,
  tier_r1_max numeric(6,2) not null default 6.00,
  tier_r2_min numeric(6,2) not null default 8.00,
  tier_r2_max numeric(6,2) not null default 12.00,
  tier_r3_min numeric(6,2) not null default 15.00,
  tier_r3_max numeric(6,2) not null default 25.00,
  tier_r4_min numeric(6,2) not null default 30.00,
  tier_r4_max numeric(6,2) not null default 60.00,
  truck_floor_rate numeric(6,2) not null default 115.00,
  truck_standard_rate numeric(6,2) not null default 135.00,
  truck_target_rate numeric(6,2) not null default 165.00,
  truck_premium_rate numeric(6,2) not null default 195.00,
  truck_stretch_rate numeric(6,2) not null default 225.00,
  default_truck_rate text not null default 'target',
  material_minimum numeric(8,2) not null default 200.00,
  trucking_minimum numeric(8,2) not null default 400.00,
  fuel_surcharge_per_load numeric(6,2) not null default 79.95,
  environmental_fee_per_load numeric(6,2) not null default 29.95,
  cc_surcharge_pct numeric(4,2) not null default 4.00,
  overhead_per_ton numeric(6,2) not null default 7.75,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_tax_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  city text not null,
  county text not null,
  state text not null default 'CA',
  rate numeric(5,4) not null,
  effective_date date not null default current_date,
  unique (organization_id, city, county, state, effective_date)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid references public.users(id),
  action text not null,
  target_table text,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.distances (
  id uuid primary key default gen_random_uuid(),
  origin_lat numeric(10,7) not null,
  origin_lng numeric(10,7) not null,
  dest_lat numeric(10,7) not null,
  dest_lng numeric(10,7) not null,
  distance_miles numeric(6,2) not null,
  duration_seconds int not null,
  last_fetched_at timestamptz not null default now(),
  unique (origin_lat, origin_lng, dest_lat, dest_lng)
);

create index if not exists idx_suppliers_org_active on public.suppliers(organization_id, is_active);
create index if not exists idx_materials_supplier on public.materials(supplier_id);
create index if not exists idx_materials_org_tier on public.materials(organization_id, tier);
create index if not exists idx_material_price_history_material on public.material_price_history(material_id, changed_at desc);
create index if not exists idx_vehicle_types_org_active on public.vehicle_types(organization_id, is_active);
create index if not exists idx_yards_org_active on public.yards(organization_id, is_active);
create index if not exists idx_sales_tax_rates_lookup on public.sales_tax_rates(organization_id, city, county, state);
create index if not exists idx_audit_org_time on public.audit_log(organization_id, created_at desc);
create index if not exists idx_audit_target on public.audit_log(target_table, target_id);
create index if not exists idx_audit_user on public.audit_log(user_id);

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

drop trigger if exists set_materials_updated_at on public.materials;
create trigger set_materials_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

drop trigger if exists set_vehicle_types_updated_at on public.vehicle_types;
create trigger set_vehicle_types_updated_at
  before update on public.vehicle_types
  for each row execute function public.set_updated_at();

drop trigger if exists set_yards_updated_at on public.yards;
create trigger set_yards_updated_at
  before update on public.yards
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.materials enable row level security;
alter table public.material_price_history enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.yards enable row level security;
alter table public.pricing_config enable row level security;
alter table public.sales_tax_rates enable row level security;
alter table public.audit_log enable row level security;
alter table public.distances enable row level security;

drop policy if exists "users_read_own_org_suppliers" on public.suppliers;
create policy "users_read_own_org_suppliers"
on public.suppliers for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_suppliers" on public.suppliers;
create policy "admins_manage_own_org_suppliers"
on public.suppliers for all to authenticated
using (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin')
with check (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin');

drop policy if exists "users_read_own_org_materials" on public.materials;
create policy "users_read_own_org_materials"
on public.materials for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_materials" on public.materials;
create policy "admins_account_managers_manage_own_org_materials"
on public.materials for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_material_history" on public.material_price_history;
create policy "users_read_own_org_material_history"
on public.material_price_history for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_material_history" on public.material_price_history;
create policy "admins_account_managers_insert_material_history"
on public.material_price_history for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_vehicle_types" on public.vehicle_types;
create policy "users_read_own_org_vehicle_types"
on public.vehicle_types for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_vehicle_types" on public.vehicle_types;
create policy "admins_manage_own_org_vehicle_types"
on public.vehicle_types for all to authenticated
using (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin')
with check (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin');

drop policy if exists "users_read_own_org_yards" on public.yards;
create policy "users_read_own_org_yards"
on public.yards for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_yards" on public.yards;
create policy "admins_manage_own_org_yards"
on public.yards for all to authenticated
using (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin')
with check (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin');

drop policy if exists "users_read_own_org_pricing_config" on public.pricing_config;
create policy "users_read_own_org_pricing_config"
on public.pricing_config for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_pricing_config" on public.pricing_config;
create policy "admins_manage_own_org_pricing_config"
on public.pricing_config for all to authenticated
using (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin')
with check (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin');

drop policy if exists "users_read_own_org_sales_tax_rates" on public.sales_tax_rates;
create policy "users_read_own_org_sales_tax_rates"
on public.sales_tax_rates for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_sales_tax_rates" on public.sales_tax_rates;
create policy "admins_manage_own_org_sales_tax_rates"
on public.sales_tax_rates for all to authenticated
using (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin')
with check (organization_id = public.current_user_organization_id() and public.current_user_role() = 'admin');

drop policy if exists "users_read_own_org_audit_log" on public.audit_log;
create policy "users_read_own_org_audit_log"
on public.audit_log for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_insert_own_org_audit_log" on public.audit_log;
create policy "users_insert_own_org_audit_log"
on public.audit_log for insert to authenticated
with check (organization_id = public.current_user_organization_id());

drop policy if exists "users_read_distances" on public.distances;
create policy "users_read_distances"
on public.distances for select to authenticated
using (true);

drop policy if exists "users_insert_distances" on public.distances;
create policy "users_insert_distances"
on public.distances for insert to authenticated
with check (true);

insert into public.vehicle_types (organization_id, name, capacity_tons, capacity_cy)
values
  ('00000000-0000-0000-0000-000000000001', 'Super-10', 17.00, null),
  ('00000000-0000-0000-0000-000000000001', 'Super-Tag', 20.00, null),
  ('00000000-0000-0000-0000-000000000001', 'End-Dump', 22.00, null),
  ('00000000-0000-0000-0000-000000000001', 'Bottom-Dump', 25.00, null),
  ('00000000-0000-0000-0000-000000000001', 'Transfer', 25.00, null)
on conflict (organization_id, name) do update
set
  capacity_tons = excluded.capacity_tons,
  capacity_cy = excluded.capacity_cy,
  is_active = true,
  updated_at = now();

insert into public.yards (organization_id, name, address, latitude, longitude)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Acton',
    '{"city":"Acton","state":"CA"}'::jsonb,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Sun Valley',
    '{"city":"Sun Valley","state":"CA"}'::jsonb,
    null,
    null
  )
on conflict (organization_id, name) do update
set
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_active = true,
  updated_at = now();

insert into public.pricing_config (organization_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (organization_id) do nothing;

insert into public.sales_tax_rates (organization_id, city, county, state, rate)
values
  ('00000000-0000-0000-0000-000000000001', 'Los Angeles', 'Los Angeles', 'CA', 0.0950),
  ('00000000-0000-0000-0000-000000000001', 'Burbank', 'Los Angeles', 'CA', 0.1025),
  ('00000000-0000-0000-0000-000000000001', 'Glendale', 'Los Angeles', 'CA', 0.1025)
on conflict (organization_id, city, county, state, effective_date) do update
set rate = excluded.rate;

with supplier_seed(name, parent_company, address, notes) as (
  values
    ('AMH Sun Valley', 'AMH', '{"city":"Sun Valley","state":"CA"}'::jsonb, 'Local sample supplier until full seed pack is imported.'),
    ('Cemex Moorpark', 'Cemex', '{"city":"Moorpark","state":"CA"}'::jsonb, 'Local sample supplier until full seed pack is imported.'),
    ('Vulcan Irwindale', 'Vulcan', '{"city":"Irwindale","state":"CA"}'::jsonb, 'Local sample supplier until full seed pack is imported.')
)
insert into public.suppliers (organization_id, name, parent_company, address, notes)
select '00000000-0000-0000-0000-000000000001', name, parent_company, address, notes
from supplier_seed
on conflict (organization_id, name) do update
set
  parent_company = excluded.parent_company,
  address = excluded.address,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

with material_seed(supplier_name, material_name, tier, unit, cost_per_unit) as (
  values
    ('AMH Sun Valley', '3/4 Rock', 'R2', 'ton', 28.50),
    ('AMH Sun Valley', 'Class II Base', 'R1', 'ton', 18.75),
    ('Cemex Moorpark', 'Washed Sand', 'R2', 'ton', 24.00),
    ('Cemex Moorpark', 'Pea Gravel', 'R3', 'ton', 36.00),
    ('Vulcan Irwindale', 'Crushed Misc Base', 'R1', 'ton', 17.25),
    ('Vulcan Irwindale', 'Decorative Rock', 'R4', 'ton', 68.00)
)
insert into public.materials (
  organization_id,
  supplier_id,
  name,
  tier,
  unit,
  cost_per_unit,
  last_price_update,
  minimum_order_quantity
)
select
  '00000000-0000-0000-0000-000000000001',
  suppliers.id,
  material_seed.material_name,
  material_seed.tier,
  material_seed.unit,
  material_seed.cost_per_unit,
  current_date,
  1
from material_seed
join public.suppliers
  on suppliers.organization_id = '00000000-0000-0000-0000-000000000001'
  and suppliers.name = material_seed.supplier_name
on conflict (organization_id, supplier_id, name, unit) do update
set
  tier = excluded.tier,
  cost_per_unit = excluded.cost_per_unit,
  last_price_update = excluded.last_price_update,
  minimum_order_quantity = excluded.minimum_order_quantity,
  is_active = true,
  updated_at = now();

