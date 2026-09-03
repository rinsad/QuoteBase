alter table public.pricing_config
  add column if not exists default_material_markup_pct numeric(7,2) not null default 25;

alter table public.pricing_config
  drop constraint if exists pricing_config_default_material_markup_pct_check,
  add constraint pricing_config_default_material_markup_pct_check
    check (default_material_markup_pct >= 0 and default_material_markup_pct <= 500);
