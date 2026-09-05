alter table public.trucking_profiles
  add column if not exists truck_capacity numeric(10, 2);

update public.trucking_profiles as profile
set truck_capacity = capacity.max_capacity_tons
from (
  select organization_id, max(capacity_tons) as max_capacity_tons
  from public.vehicle_types
  where is_active = true
  group by organization_id
) as capacity
where profile.organization_id = capacity.organization_id
  and profile.truck_capacity is null;

do $$
begin
  if exists (select 1 from public.trucking_profiles where truck_capacity is null) then
    raise exception 'Cannot migrate trucking profiles without an active vehicle capacity';
  end if;
end $$;

alter table public.trucking_profiles
  alter column truck_capacity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trucking_profiles_truck_capacity_positive'
  ) then
    alter table public.trucking_profiles
      add constraint trucking_profiles_truck_capacity_positive
      check (truck_capacity > 0);
  end if;
end $$;

comment on column public.trucking_profiles.truck_capacity is
  'Normalized material quote quantity that one truck load can carry for this profile.';
