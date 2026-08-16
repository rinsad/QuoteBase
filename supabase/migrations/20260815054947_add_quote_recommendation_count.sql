alter table public.pricing_config
  add column if not exists quote_recommendation_count integer not null default 3;

alter table public.pricing_config
  drop constraint if exists pricing_config_quote_recommendation_count_check,
  add constraint pricing_config_quote_recommendation_count_check
  check (quote_recommendation_count between 0 and 10);
alter table public.pricing_config
  add column if not exists quote_recommendation_count integer not null default 3;

alter table public.pricing_config
  drop constraint if exists pricing_config_quote_recommendation_count_check,
  add constraint pricing_config_quote_recommendation_count_check
  check (quote_recommendation_count between 0 and 10);
