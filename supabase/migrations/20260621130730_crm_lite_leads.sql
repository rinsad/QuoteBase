create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid null,
  name text not null,
  domain text null,
  phone text null,
  email text null,
  address jsonb not null default '{}'::jsonb,
  source text not null default 'manual'
    check (source in ('manual', 'csv_import', 'web_form')),
  lifecycle_stage text not null default 'lead'
    check (lifecycle_stage in ('lead', 'prospect', 'customer', 'inactive')),
  owner_id uuid null references public.users(id),
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id),
  updated_by uuid null references public.users(id),
  unique (id, organization_id),
  constraint crm_companies_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id)
    on delete set null,
  constraint crm_companies_owner_org_fk
    foreign key (owner_id, organization_id)
    references public.users(id, organization_id)
    on delete set null,
  constraint crm_companies_org_name_unique
    unique (organization_id, name)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  customer_id uuid null,
  full_name text not null,
  title text null,
  email text null,
  phone text null,
  source text not null default 'manual'
    check (source in ('manual', 'csv_import', 'web_form')),
  owner_id uuid null references public.users(id),
  notes text null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id),
  updated_by uuid null references public.users(id),
  unique (id, organization_id),
  constraint crm_contacts_company_org_fk
    foreign key (company_id, organization_id)
    references public.crm_companies(id, organization_id)
    on delete set null,
  constraint crm_contacts_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id)
    on delete set null,
  constraint crm_contacts_owner_org_fk
    foreign key (owner_id, organization_id)
    references public.users(id, organization_id)
    on delete set null
);

create unique index if not exists crm_contacts_org_email_unique
on public.crm_contacts(organization_id, lower(email))
where email is not null and is_active = true;

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  contact_id uuid null,
  customer_id uuid null,
  quote_id uuid null,
  title text not null,
  stage text not null default 'new'
    check (stage in ('new', 'qualified', 'quoted', 'won', 'lost')),
  value numeric(12,2) not null default 0,
  expected_close_date date null,
  source text not null default 'manual'
    check (source in ('manual', 'csv_import', 'web_form')),
  owner_id uuid null references public.users(id),
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id),
  updated_by uuid null references public.users(id),
  unique (id, organization_id),
  constraint crm_deals_company_org_fk
    foreign key (company_id, organization_id)
    references public.crm_companies(id, organization_id)
    on delete set null,
  constraint crm_deals_contact_org_fk
    foreign key (contact_id, organization_id)
    references public.crm_contacts(id, organization_id)
    on delete set null,
  constraint crm_deals_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id)
    on delete set null,
  constraint crm_deals_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id)
    on delete set null,
  constraint crm_deals_owner_org_fk
    foreign key (owner_id, organization_id)
    references public.users(id, organization_id)
    on delete set null
);

create table if not exists public.crm_lead_captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  contact_id uuid null,
  deal_id uuid null,
  source text not null check (source in ('csv_import', 'web_form')),
  source_name text null,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'captured'
    check (status in ('captured', 'processed', 'failed')),
  failure_reason text null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.users(id),
  constraint crm_lead_captures_company_org_fk
    foreign key (company_id, organization_id)
    references public.crm_companies(id, organization_id)
    on delete set null,
  constraint crm_lead_captures_contact_org_fk
    foreign key (contact_id, organization_id)
    references public.crm_contacts(id, organization_id)
    on delete set null,
  constraint crm_lead_captures_deal_org_fk
    foreign key (deal_id, organization_id)
    references public.crm_deals(id, organization_id)
    on delete set null
);

create index if not exists idx_crm_companies_org_active
on public.crm_companies(organization_id, is_active, name);

create index if not exists idx_crm_contacts_org_company
on public.crm_contacts(organization_id, company_id, is_active);

create index if not exists idx_crm_contacts_org_customer
on public.crm_contacts(organization_id, customer_id);

create index if not exists idx_crm_deals_org_stage
on public.crm_deals(organization_id, stage, is_active);

create index if not exists idx_crm_deals_org_company
on public.crm_deals(organization_id, company_id);

create index if not exists idx_crm_lead_captures_org_created
on public.crm_lead_captures(organization_id, created_at desc);

drop trigger if exists set_crm_companies_updated_at on public.crm_companies;
create trigger set_crm_companies_updated_at
  before update on public.crm_companies
  for each row execute function public.set_updated_at();

drop trigger if exists set_crm_contacts_updated_at on public.crm_contacts;
create trigger set_crm_contacts_updated_at
  before update on public.crm_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists set_crm_deals_updated_at on public.crm_deals;
create trigger set_crm_deals_updated_at
  before update on public.crm_deals
  for each row execute function public.set_updated_at();

alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_lead_captures enable row level security;

drop policy if exists "users_read_own_org_crm_companies" on public.crm_companies;
create policy "users_read_own_org_crm_companies"
on public.crm_companies for select to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_manage_own_org_crm_companies" on public.crm_companies;
create policy "users_manage_own_org_crm_companies"
on public.crm_companies for all to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
)
with check (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_read_own_org_crm_contacts" on public.crm_contacts;
create policy "users_read_own_org_crm_contacts"
on public.crm_contacts for select to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_manage_own_org_crm_contacts" on public.crm_contacts;
create policy "users_manage_own_org_crm_contacts"
on public.crm_contacts for all to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
)
with check (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_read_own_org_crm_deals" on public.crm_deals;
create policy "users_read_own_org_crm_deals"
on public.crm_deals for select to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_manage_own_org_crm_deals" on public.crm_deals;
create policy "users_manage_own_org_crm_deals"
on public.crm_deals for all to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
)
with check (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_read_own_org_crm_lead_captures" on public.crm_lead_captures;
create policy "users_read_own_org_crm_lead_captures"
on public.crm_lead_captures for select to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);
