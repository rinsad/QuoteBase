-- Track the vehicle/load plan used by quote line-item calculations.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_types_id_organization_id_key'
  ) then
    alter table public.vehicle_types
      add constraint vehicle_types_id_organization_id_key unique (id, organization_id);
  end if;
end $$;

alter table public.quote_items
add column if not exists vehicle_type_id uuid,
add column if not exists load_count numeric(10,2) not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_items_vehicle_type_org_fk'
  ) then
    alter table public.quote_items
      add constraint quote_items_vehicle_type_org_fk
      foreign key (vehicle_type_id, organization_id)
      references public.vehicle_types(id, organization_id);
  end if;
end $$;

create index if not exists idx_quote_items_org_vehicle_type
on public.quote_items(organization_id, vehicle_type_id);
