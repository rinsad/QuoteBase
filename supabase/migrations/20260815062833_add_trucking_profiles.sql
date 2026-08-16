create table public.trucking_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  average_speed_mph numeric(6,2) not null default 35,
  hourly_rate numeric(10,2) not null default 95,
  round_trip_factor numeric(5,2) not null default 2,
  time_adjustment_bands jsonb not null default '[{"under_miles":18,"hours":0.5},{"under_miles":25,"hours":0.375},{"under_miles":30,"hours":0.25}]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name),
  constraint trucking_profiles_average_speed_check check (average_speed_mph > 0 and average_speed_mph <= 100),
  constraint trucking_profiles_hourly_rate_check check (hourly_rate >= 0 and hourly_rate <= 10000),
  constraint trucking_profiles_round_trip_factor_check check (round_trip_factor > 0 and round_trip_factor <= 10),
  constraint trucking_profiles_adjustment_bands_check check (jsonb_typeof(time_adjustment_bands) = 'array')
);

create table public.trucking_profile_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trucking_profile_id uuid not null,
  supplier_id uuid,
  plant_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint trucking_profile_assignments_profile_org_fk
    foreign key (trucking_profile_id, organization_id)
    references public.trucking_profiles(id, organization_id),
  constraint trucking_profile_assignments_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint trucking_profile_assignments_plant_org_fk
    foreign key (plant_id, organization_id)
    references public.supplier_plants(id, organization_id),
  constraint trucking_profile_assignments_scope_check check (
    (supplier_id is null and plant_id is null)
    or (supplier_id is not null and plant_id is null)
    or (supplier_id is null and plant_id is not null)
  )
);

create index idx_trucking_profiles_org_active
  on public.trucking_profiles(organization_id, is_active);
create index idx_trucking_profile_assignments_profile
  on public.trucking_profile_assignments(organization_id, trucking_profile_id);
create unique index uq_trucking_profile_assignment_tenant
  on public.trucking_profile_assignments(organization_id)
  where supplier_id is null and plant_id is null and is_active;
create unique index uq_trucking_profile_assignment_supplier
  on public.trucking_profile_assignments(organization_id, supplier_id)
  where supplier_id is not null and plant_id is null and is_active;
create unique index uq_trucking_profile_assignment_plant
  on public.trucking_profile_assignments(organization_id, plant_id)
  where plant_id is not null and supplier_id is null and is_active;

drop trigger if exists set_trucking_profiles_updated_at on public.trucking_profiles;
create trigger set_trucking_profiles_updated_at
  before update on public.trucking_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_trucking_profile_assignments_updated_at on public.trucking_profile_assignments;
create trigger set_trucking_profile_assignments_updated_at
  before update on public.trucking_profile_assignments
  for each row execute function public.set_updated_at();

alter table public.trucking_profiles enable row level security;
alter table public.trucking_profile_assignments enable row level security;

create policy "users_read_own_org_trucking_profiles"
on public.trucking_profiles for select to authenticated
using (organization_id = public.current_user_organization_id());

create policy "admins_manage_own_org_trucking_profiles"
on public.trucking_profiles for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

create policy "users_read_own_org_trucking_profile_assignments"
on public.trucking_profile_assignments for select to authenticated
using (organization_id = public.current_user_organization_id());

create policy "admins_manage_own_org_trucking_profile_assignments"
on public.trucking_profile_assignments for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

grant select on public.trucking_profiles to authenticated;
grant insert, update on public.trucking_profiles to authenticated;
grant select on public.trucking_profile_assignments to authenticated;
grant insert, update on public.trucking_profile_assignments to authenticated;

with inserted_profiles as (
  insert into public.trucking_profiles (
    organization_id,
    name,
    average_speed_mph,
    hourly_rate,
    round_trip_factor
  )
  select
    organization_id,
    'Default trucking',
    35,
    case default_truck_rate
      when 'floor' then truck_floor_rate
      when 'standard' then truck_standard_rate
      when 'premium' then truck_premium_rate
      when 'stretch' then truck_stretch_rate
      else truck_target_rate
    end,
    2
  from public.pricing_config
  on conflict (organization_id, name) do update
    set updated_at = excluded.updated_at
  returning id, organization_id
)
insert into public.trucking_profile_assignments (
  organization_id,
  trucking_profile_id
)
select organization_id, id
from inserted_profiles
on conflict do nothing;

alter table public.quote_items
  add column trucking_profile_id uuid,
  add column trucking_calculation jsonb;

alter table public.quote_items
  add constraint quote_items_trucking_profile_org_fk
  foreign key (trucking_profile_id, organization_id)
  references public.trucking_profiles(id, organization_id);

create index idx_quote_items_trucking_profile
  on public.quote_items(organization_id, trucking_profile_id)
  where trucking_profile_id is not null;
