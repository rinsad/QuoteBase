-- Customer metadata needed by A.5.1 quote creation.

alter table public.customers
add column if not exists company_name text,
add column if not exists address jsonb not null default '{}'::jsonb,
add column if not exists payment_terms text;

create index if not exists idx_customers_org_company
on public.customers(organization_id, company_name);
