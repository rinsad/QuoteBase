alter table public.trucking_profiles
  add column if not exists is_default boolean not null default false;

create unique index if not exists trucking_profiles_one_default_per_organization_idx
  on public.trucking_profiles (organization_id)
  where is_default and is_active;

with ranked_defaults as (
  select id, row_number() over (
    partition by organization_id
    order by case when lower(name) = 'default trucking' then 0 else 1 end, created_at, id
  ) as default_rank
  from public.trucking_profiles
  where is_active
)
update public.trucking_profiles as profile
set is_default = true
from ranked_defaults
where profile.id = ranked_defaults.id
  and ranked_defaults.default_rank = 1
  and not exists (
    select 1 from public.trucking_profiles as existing_default
    where existing_default.organization_id = profile.organization_id
      and existing_default.is_active and existing_default.is_default
  );
