create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  label text not null,
  plural_label text not null,
  calculation_basis text not null check (calculation_basis in ('weight', 'volume', 'load', 'count', 'area', 'other')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (code = lower(code)),
  check (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);

create index if not exists idx_organization_units_org_active
on public.organization_units(organization_id, is_active, sort_order);

drop trigger if exists set_organization_units_updated_at on public.organization_units;
create trigger set_organization_units_updated_at
  before update on public.organization_units
  for each row execute function public.set_updated_at();

alter table public.organization_units enable row level security;

drop policy if exists "users_read_own_org_units" on public.organization_units;
create policy "users_read_own_org_units"
on public.organization_units for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_units" on public.organization_units;
create policy "admins_manage_own_org_units"
on public.organization_units for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

insert into public.organization_units (
  organization_id,
  code,
  label,
  plural_label,
  calculation_basis,
  sort_order,
  is_active
)
select
  organizations.id,
  units.code,
  units.label,
  units.plural_label,
  units.calculation_basis,
  units.sort_order,
  true
from public.organizations
cross join (
  values
    ('ton', 'Ton', 'Tons', 'weight', 10),
    ('cy', 'Cubic yard', 'Cubic yards', 'volume', 20),
    ('load', 'Load', 'Loads', 'load', 30),
    ('bag', 'Bag', 'Bags', 'count', 40),
    ('sqft', 'Square foot', 'Square feet', 'area', 50),
    ('lbs', 'Pound', 'Pounds', 'weight', 60),
    ('each', 'Each', 'Each', 'count', 70)
) as units(code, label, plural_label, calculation_basis, sort_order)
on conflict (organization_id, code) do update
set
  label = excluded.label,
  plural_label = excluded.plural_label,
  calculation_basis = excluded.calculation_basis,
  sort_order = excluded.sort_order,
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'materials'
      and constraint_name = 'materials_unit_check'
  ) then
    alter table public.materials drop constraint materials_unit_check;
  end if;
end $$;
