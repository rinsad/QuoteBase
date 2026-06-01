-- Scope distance cache rows by organization for SaaS isolation.

alter table public.distances
add column if not exists organization_id uuid references public.organizations(id);

update public.distances
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

alter table public.distances
alter column organization_id set not null;

alter table public.distances
drop constraint if exists distances_origin_lat_origin_lng_dest_lat_dest_lng_key;

alter table public.distances
add constraint distances_org_route_key
unique (organization_id, origin_lat, origin_lng, dest_lat, dest_lng);

drop policy if exists "users_read_distances" on public.distances;
create policy "users_read_own_org_distances"
on public.distances for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_insert_distances" on public.distances;
create policy "users_insert_own_org_distances"
on public.distances for insert to authenticated
with check (organization_id = public.current_user_organization_id());

drop policy if exists "users_update_own_org_distances" on public.distances;
create policy "users_update_own_org_distances"
on public.distances for update to authenticated
using (organization_id = public.current_user_organization_id())
with check (organization_id = public.current_user_organization_id());
