alter table public.supplier_plants
  add column if not exists hours text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_phone text;

alter table public.supplier_plants
  drop constraint if exists supplier_plants_hours_length_check,
  add constraint supplier_plants_hours_length_check
  check (hours is null or char_length(hours) <= 240);

alter table public.supplier_plants
  drop constraint if exists supplier_plants_primary_contact_name_length_check,
  add constraint supplier_plants_primary_contact_name_length_check
  check (
    primary_contact_name is null
    or char_length(primary_contact_name) <= 160
  );

alter table public.supplier_plants
  drop constraint if exists supplier_plants_primary_contact_phone_length_check,
  add constraint supplier_plants_primary_contact_phone_length_check
  check (
    primary_contact_phone is null
    or char_length(primary_contact_phone) <= 40
  );
