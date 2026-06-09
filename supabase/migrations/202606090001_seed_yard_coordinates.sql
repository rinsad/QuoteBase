-- A.6.4: populate seeded dispatch yard coordinates so nearest-yard deadhead can calculate.
update public.yards
set
  latitude = 34.4700000,
  longitude = -118.1967000,
  updated_at = now()
where organization_id = '00000000-0000-0000-0000-000000000001'
  and name = 'Acton'
  and (latitude is null or longitude is null);

update public.yards
set
  latitude = 34.2274440,
  longitude = -118.3810730,
  updated_at = now()
where organization_id = '00000000-0000-0000-0000-000000000001'
  and name = 'Sun Valley'
  and (latitude is null or longitude is null);
