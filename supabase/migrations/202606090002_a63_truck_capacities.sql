-- A.6.3: canonical truck capacities and initial-scope active status.
update public.vehicle_types as vehicle_type
set
  name = 'Super-Tag (Super-18)',
  capacity_tons = 20.00,
  capacity_cy = null,
  is_active = true,
  updated_at = now()
where vehicle_type.organization_id = '00000000-0000-0000-0000-000000000001'
  and vehicle_type.name = 'Super-Tag'
  and not exists (
    select 1
    from public.vehicle_types existing
    where existing.organization_id = vehicle_type.organization_id
      and existing.name = 'Super-Tag (Super-18)'
  );

insert into public.vehicle_types (
  organization_id,
  name,
  capacity_tons,
  capacity_cy,
  is_active
)
values
  ('00000000-0000-0000-0000-000000000001', 'Super-10', 17.00, null, true),
  ('00000000-0000-0000-0000-000000000001', 'Super-Tag (Super-18)', 20.00, null, true),
  ('00000000-0000-0000-0000-000000000001', 'End-Dump', 22.00, null, true),
  ('00000000-0000-0000-0000-000000000001', 'Bottom-Dump', 25.00, null, false),
  ('00000000-0000-0000-0000-000000000001', 'Transfer', 25.00, null, true)
on conflict (organization_id, name) do update
set
  capacity_tons = excluded.capacity_tons,
  capacity_cy = excluded.capacity_cy,
  is_active = excluded.is_active,
  updated_at = now();

update public.vehicle_types as vehicle_type
set
  is_active = false,
  updated_at = now()
where vehicle_type.organization_id = '00000000-0000-0000-0000-000000000001'
  and vehicle_type.name = 'Super-Tag'
  and exists (
    select 1
    from public.vehicle_types canonical
    where canonical.organization_id = vehicle_type.organization_id
      and canonical.name = 'Super-Tag (Super-18)'
  );
