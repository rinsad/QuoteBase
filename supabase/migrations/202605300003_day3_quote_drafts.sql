-- Day 3 quote draft schema: customers, job sites, quotes, and quote items.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_id_organization_id_key'
  ) then
    alter table public.users add constraint users_id_organization_id_key unique (id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'suppliers_id_organization_id_key'
  ) then
    alter table public.suppliers add constraint suppliers_id_organization_id_key unique (id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'materials_id_organization_id_key'
  ) then
    alter table public.materials add constraint materials_id_organization_id_key unique (id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'materials_id_supplier_id_organization_id_key'
  ) then
    alter table public.materials add constraint materials_id_supplier_id_organization_id_key unique (id, supplier_id, organization_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sales_tax_rates_id_organization_id_key'
  ) then
    alter table public.sales_tax_rates add constraint sales_tax_rates_id_organization_id_key unique (id, organization_id);
  end if;
end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  contact_name text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create table if not exists public.job_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null,
  name text not null,
  address jsonb not null,
  city text not null,
  county text not null,
  state text not null default 'CA',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, customer_id, name),
  constraint job_sites_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_number text not null,
  customer_id uuid not null,
  job_site_id uuid not null,
  requested_by uuid not null,
  tax_rate_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'expired')),
  material_subtotal numeric(12,2) not null default 0,
  trucking_subtotal numeric(12,2) not null default 0,
  fees_subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, quote_number),
  constraint quotes_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id),
  constraint quotes_job_site_org_fk
    foreign key (job_site_id, organization_id)
    references public.job_sites(id, organization_id),
  constraint quotes_requested_by_org_fk
    foreign key (requested_by, organization_id)
    references public.users(id, organization_id),
  constraint quotes_tax_rate_org_fk
    foreign key (tax_rate_id, organization_id)
    references public.sales_tax_rates(id, organization_id)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  supplier_id uuid not null,
  material_id uuid not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null,
  unit_cost numeric(10,2) not null,
  markup_pct numeric(6,2) not null,
  material_unit_price numeric(10,2) not null,
  material_subtotal numeric(12,2) not null,
  trucking_rate_per_unit numeric(10,2) not null,
  trucking_subtotal numeric(12,2) not null,
  fees_subtotal numeric(12,2) not null,
  line_total numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_items_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_items_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id),
  constraint quote_items_material_supplier_org_fk
    foreign key (material_id, supplier_id, organization_id)
    references public.materials(id, supplier_id, organization_id)
);

create index if not exists idx_customers_org_active on public.customers(organization_id, is_active);
create index if not exists idx_job_sites_org_customer on public.job_sites(organization_id, customer_id, is_active);
create index if not exists idx_quotes_org_status on public.quotes(organization_id, status, is_active);
create index if not exists idx_quotes_org_customer on public.quotes(organization_id, customer_id);
create index if not exists idx_quotes_org_created on public.quotes(organization_id, created_at desc);
create index if not exists idx_quote_items_org_quote on public.quote_items(organization_id, quote_id);
create index if not exists idx_quote_items_org_material on public.quote_items(organization_id, material_id);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists set_job_sites_updated_at on public.job_sites;
create trigger set_job_sites_updated_at
  before update on public.job_sites
  for each row execute function public.set_updated_at();

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

drop trigger if exists set_quote_items_updated_at on public.quote_items;
create trigger set_quote_items_updated_at
  before update on public.quote_items
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.job_sites enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

drop policy if exists "users_read_own_org_customers" on public.customers;
create policy "users_read_own_org_customers"
on public.customers for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_manage_own_org_customers" on public.customers;
create policy "users_manage_own_org_customers"
on public.customers for all to authenticated
using (organization_id = public.current_user_organization_id())
with check (organization_id = public.current_user_organization_id());

drop policy if exists "users_read_own_org_job_sites" on public.job_sites;
create policy "users_read_own_org_job_sites"
on public.job_sites for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_manage_own_org_job_sites" on public.job_sites;
create policy "users_manage_own_org_job_sites"
on public.job_sites for all to authenticated
using (organization_id = public.current_user_organization_id())
with check (organization_id = public.current_user_organization_id());

drop policy if exists "users_read_own_org_quotes" on public.quotes;
create policy "users_read_own_org_quotes"
on public.quotes for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_manage_own_org_quotes" on public.quotes;
create policy "users_manage_own_org_quotes"
on public.quotes for all to authenticated
using (organization_id = public.current_user_organization_id())
with check (organization_id = public.current_user_organization_id());

drop policy if exists "users_read_own_org_quote_items" on public.quote_items;
create policy "users_read_own_org_quote_items"
on public.quote_items for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_manage_own_org_quote_items" on public.quote_items;
create policy "users_manage_own_org_quote_items"
on public.quote_items for all to authenticated
using (organization_id = public.current_user_organization_id())
with check (organization_id = public.current_user_organization_id());

with customer_seed(name, contact_name, email, phone) as (
  values
    ('Acme Siteworks', 'Maya Lopez', 'maya@example.test', '555-0101'),
    ('North Ridge Builders', 'Evan Brooks', 'evan@example.test', '555-0102')
)
insert into public.customers (organization_id, name, contact_name, email, phone)
select '00000000-0000-0000-0000-000000000001', name, contact_name, email, phone
from customer_seed
on conflict (organization_id, name) do update
set
  contact_name = excluded.contact_name,
  email = excluded.email,
  phone = excluded.phone,
  is_active = true,
  updated_at = now();

with site_seed(customer_name, site_name, city, county, state, address) as (
  values
    ('Acme Siteworks', 'Los Angeles Yard', 'Los Angeles', 'Los Angeles', 'CA', '{"line1":"1200 Alameda St","city":"Los Angeles","state":"CA"}'::jsonb),
    ('North Ridge Builders', 'Burbank Retail Pad', 'Burbank', 'Los Angeles', 'CA', '{"line1":"300 Magnolia Blvd","city":"Burbank","state":"CA"}'::jsonb)
)
insert into public.job_sites (organization_id, customer_id, name, city, county, state, address)
select
  '00000000-0000-0000-0000-000000000001',
  customers.id,
  site_seed.site_name,
  site_seed.city,
  site_seed.county,
  site_seed.state,
  site_seed.address
from site_seed
join public.customers
  on customers.organization_id = '00000000-0000-0000-0000-000000000001'
  and customers.name = site_seed.customer_name
on conflict (organization_id, customer_id, name) do update
set
  city = excluded.city,
  county = excluded.county,
  state = excluded.state,
  address = excluded.address,
  is_active = true,
  updated_at = now();
