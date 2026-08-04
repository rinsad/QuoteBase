do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table public.users drop constraint users_role_check;
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'user_invites'
      and constraint_name = 'user_invites_role_check'
  ) then
    alter table public.user_invites drop constraint user_invites_role_check;
  end if;
end $$;

alter table public.users
add constraint users_role_check
check (role in ('platform_admin', 'admin', 'account_manager', 'estimator'));

alter table public.user_invites
add constraint user_invites_role_check
check (role in ('platform_admin', 'admin', 'account_manager', 'estimator'));

create table if not exists public.unit_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  plural_label text not null,
  calculation_basis text not null check (calculation_basis in ('weight', 'volume', 'load', 'count', 'area', 'distance', 'other')),
  measurement_system text not null default 'custom' check (measurement_system in ('us', 'metric', 'custom')),
  aliases text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code = lower(code)),
  check (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);

create index if not exists idx_unit_catalog_active_basis
on public.unit_catalog(is_active, calculation_basis, sort_order);

drop trigger if exists set_unit_catalog_updated_at on public.unit_catalog;
create trigger set_unit_catalog_updated_at
  before update on public.unit_catalog
  for each row execute function public.set_updated_at();

alter table public.unit_catalog enable row level security;

drop policy if exists "authenticated_read_unit_catalog" on public.unit_catalog;
create policy "authenticated_read_unit_catalog"
on public.unit_catalog for select to authenticated
using (true);

drop policy if exists "platform_admins_manage_unit_catalog" on public.unit_catalog;
create policy "platform_admins_manage_unit_catalog"
on public.unit_catalog for all to authenticated
using (public.current_user_role() = 'platform_admin')
with check (public.current_user_role() = 'platform_admin');

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'organization_units'
      and constraint_name = 'organization_units_calculation_basis_check'
  ) then
    alter table public.organization_units drop constraint organization_units_calculation_basis_check;
  end if;
end $$;

alter table public.organization_units
add constraint organization_units_calculation_basis_check
check (calculation_basis in ('weight', 'volume', 'load', 'count', 'area', 'distance', 'other'));

alter table public.organization_units
add column if not exists unit_catalog_id uuid references public.unit_catalog(id);

insert into public.unit_catalog (
  code,
  label,
  plural_label,
  calculation_basis,
  measurement_system,
  aliases,
  sort_order,
  is_active
)
values
  ('ton', 'Ton', 'Tons', 'weight', 'us', array['tons', 'short ton', 'short tons', 'tn'], 10, true),
  ('metric_ton', 'Metric ton', 'Metric tons', 'weight', 'metric', array['tonne', 'tonnes', 'mt', 't'], 20, true),
  ('lbs', 'Pound', 'Pounds', 'weight', 'us', array['lb', 'lbs', 'pound', 'pounds'], 30, true),
  ('oz', 'Ounce', 'Ounces', 'weight', 'us', array['ounce', 'ounces'], 40, true),
  ('kg', 'Kilogram', 'Kilograms', 'weight', 'metric', array['kilogram', 'kilograms', 'kgs'], 50, true),
  ('g', 'Gram', 'Grams', 'weight', 'metric', array['gram', 'grams'], 60, true),
  ('cy', 'Cubic yard', 'Cubic yards', 'volume', 'us', array['cubic yard', 'cubic yards', 'cubic_yard', 'cubic_yards', 'yard', 'yards'], 110, true),
  ('cubic_foot', 'Cubic foot', 'Cubic feet', 'volume', 'us', array['cf', 'cu ft', 'cubic feet', 'ft3'], 120, true),
  ('gallon', 'Gallon', 'Gallons', 'volume', 'us', array['gal', 'gallons'], 130, true),
  ('liter', 'Liter', 'Liters', 'volume', 'metric', array['l', 'litre', 'litres', 'liters'], 140, true),
  ('m3', 'Cubic meter', 'Cubic meters', 'volume', 'metric', array['cubic meter', 'cubic meters', 'cubic_metre', 'cubic_metres', 'cbm'], 150, true),
  ('load', 'Load', 'Loads', 'load', 'custom', array['loads'], 210, true),
  ('bag', 'Bag', 'Bags', 'count', 'custom', array['bags'], 220, true),
  ('each', 'Each', 'Each', 'count', 'custom', array['ea', 'unit', 'units'], 230, true),
  ('sqft', 'Square foot', 'Square feet', 'area', 'us', array['sf', 'sq ft', 'square feet', 'square foot'], 310, true),
  ('acre', 'Acre', 'Acres', 'area', 'us', array['acres'], 320, true),
  ('mile', 'Mile', 'Miles', 'distance', 'us', array['mi', 'miles'], 410, true),
  ('yard', 'Yard', 'Yards', 'distance', 'us', array['yd', 'yds', 'yards'], 420, true),
  ('foot', 'Foot', 'Feet', 'distance', 'us', array['ft', 'feet'], 430, true),
  ('inch', 'Inch', 'Inches', 'distance', 'us', array['in', 'inches'], 440, true),
  ('km', 'Kilometer', 'Kilometers', 'distance', 'metric', array['kilometer', 'kilometers', 'kilometre', 'kilometres'], 450, true),
  ('meter', 'Meter', 'Meters', 'distance', 'metric', array['m', 'meters', 'metre', 'metres'], 460, true)
on conflict (code) do update
set
  label = excluded.label,
  plural_label = excluded.plural_label,
  calculation_basis = excluded.calculation_basis,
  measurement_system = excluded.measurement_system,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

update public.organization_units
set unit_catalog_id = unit_catalog.id
from public.unit_catalog
where public.organization_units.unit_catalog_id is null
  and public.organization_units.code = unit_catalog.code;

insert into public.organization_units (
  organization_id,
  unit_catalog_id,
  code,
  label,
  plural_label,
  calculation_basis,
  sort_order,
  is_active
)
select
  organizations.id,
  unit_catalog.id,
  unit_catalog.code,
  unit_catalog.label,
  unit_catalog.plural_label,
  unit_catalog.calculation_basis,
  unit_catalog.sort_order,
  unit_catalog.code in ('ton', 'cy', 'load', 'bag', 'sqft', 'lbs', 'each')
from public.organizations
cross join public.unit_catalog
where unit_catalog.code in ('ton', 'cy', 'load', 'bag', 'sqft', 'lbs', 'each')
on conflict (organization_id, code) do update
set
  unit_catalog_id = excluded.unit_catalog_id,
  label = excluded.label,
  plural_label = excluded.plural_label,
  calculation_basis = excluded.calculation_basis,
  sort_order = excluded.sort_order,
  updated_at = now();

create unique index if not exists idx_organization_units_org_catalog
on public.organization_units(organization_id, unit_catalog_id)
where unit_catalog_id is not null;
