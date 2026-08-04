create table if not exists public.credit_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  customer_id uuid not null,
  created_by uuid,
  public_token text not null unique,
  public_token_hash text not null unique,
  status text not null default 'sent'
    check (status in ('sent', 'viewed', 'submitted', 'expired', 'cancelled')),
  recipient_email text,
  application_data jsonb not null default '{}'::jsonb,
  signature_name text,
  signature_title text,
  signature_ip text,
  signature_user_agent text,
  sent_at timestamptz,
  viewed_at timestamptz,
  submitted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, quote_id),
  constraint credit_applications_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint credit_applications_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id),
  constraint credit_applications_created_by_org_fk
    foreign key (created_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_credit_applications_org_status
on public.credit_applications(organization_id, status, created_at desc);

create index if not exists idx_credit_applications_org_quote
on public.credit_applications(organization_id, quote_id);

drop trigger if exists set_credit_applications_updated_at on public.credit_applications;
create trigger set_credit_applications_updated_at
  before update on public.credit_applications
  for each row
  execute function public.set_updated_at();

alter table public.credit_applications enable row level security;

drop policy if exists "users_read_own_org_credit_applications" on public.credit_applications;
create policy "users_read_own_org_credit_applications"
on public.credit_applications for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_credit_applications" on public.credit_applications;
create policy "admins_account_managers_insert_credit_applications"
on public.credit_applications for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
  and created_by in (
    select id
    from public.users
    where organization_id = public.current_user_organization_id()
      and auth_user_id = (select auth.uid())
  )
);

drop policy if exists "admins_account_managers_update_credit_applications" on public.credit_applications;
create policy "admins_account_managers_update_credit_applications"
on public.credit_applications for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);
