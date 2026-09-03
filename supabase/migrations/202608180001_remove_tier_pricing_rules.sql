alter table public.pricing_config
  drop column if exists tier_r1_min,
  drop column if exists tier_r1_max,
  drop column if exists tier_r2_min,
  drop column if exists tier_r2_max,
  drop column if exists tier_r3_min,
  drop column if exists tier_r3_max,
  drop column if exists tier_r4_min,
  drop column if exists tier_r4_max;
