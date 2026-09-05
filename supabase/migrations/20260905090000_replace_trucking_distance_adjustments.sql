alter table public.trucking_profiles
  add column if not exists loading_unloading_hours numeric(6,2) not null default 0;

alter table public.trucking_profiles
  drop constraint if exists trucking_profiles_loading_unloading_hours_check;

alter table public.trucking_profiles
  add constraint trucking_profiles_loading_unloading_hours_check
  check (loading_unloading_hours >= 0 and loading_unloading_hours <= 24);

comment on column public.trucking_profiles.loading_unloading_hours is
  'Combined loading and unloading hours added once per round-trip load.';
