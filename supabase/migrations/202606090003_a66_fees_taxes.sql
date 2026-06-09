-- A.6.6: representative SoCal sales tax defaults for delivery-city lookup.
insert into public.sales_tax_rates (organization_id, city, county, state, rate)
values
  ('00000000-0000-0000-0000-000000000001', 'Los Angeles', 'Los Angeles', 'CA', 0.0950),
  ('00000000-0000-0000-0000-000000000001', 'Burbank', 'Los Angeles', 'CA', 0.1050),
  ('00000000-0000-0000-0000-000000000001', 'Glendale', 'Los Angeles', 'CA', 0.1050),
  ('00000000-0000-0000-0000-000000000001', 'Irwindale', 'Los Angeles', 'CA', 0.1075),
  ('00000000-0000-0000-0000-000000000001', 'Pico Rivera', 'Los Angeles', 'CA', 0.1075),
  ('00000000-0000-0000-0000-000000000001', 'Camarillo', 'Ventura', 'CA', 0.0725),
  ('00000000-0000-0000-0000-000000000001', 'Moorpark', 'Ventura', 'CA', 0.0725),
  ('00000000-0000-0000-0000-000000000001', 'Oxnard', 'Ventura', 'CA', 0.0925),
  ('00000000-0000-0000-0000-000000000001', 'Anaheim', 'Orange', 'CA', 0.0775),
  ('00000000-0000-0000-0000-000000000001', 'Irvine', 'Orange', 'CA', 0.0775),
  ('00000000-0000-0000-0000-000000000001', 'San Diego', 'San Diego', 'CA', 0.0775),
  ('00000000-0000-0000-0000-000000000001', 'Riverside', 'Riverside', 'CA', 0.0875),
  ('00000000-0000-0000-0000-000000000001', 'San Bernardino', 'San Bernardino', 'CA', 0.0875)
on conflict (organization_id, city, county, state, effective_date) do update
set rate = excluded.rate;
