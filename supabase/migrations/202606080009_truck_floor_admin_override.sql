-- A.6.2: Floor trucking rate remains configurable but is not a normal default.
-- It is used only through admin quote-level override.

update public.pricing_config
set default_truck_rate = 'target'
where default_truck_rate = 'floor';

alter table public.pricing_config
drop constraint if exists pricing_config_default_truck_rate_check;

alter table public.pricing_config
add constraint pricing_config_default_truck_rate_check
check (default_truck_rate in ('standard', 'target', 'premium', 'stretch'));
