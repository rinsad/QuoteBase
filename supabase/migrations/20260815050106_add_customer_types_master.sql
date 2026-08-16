create table if not exists public.customer_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 1 and 80),
  code text not null check (code ~ '^[a-z0-9_]+$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

alter table public.customer_types enable row level security;

create index if not exists idx_customer_types_org_active_name
on public.customer_types(organization_id, is_active, name);

drop trigger if exists set_customer_types_updated_at on public.customer_types;
create trigger set_customer_types_updated_at
  before update on public.customer_types
  for each row execute function public.set_updated_at();

drop policy if exists "users_read_own_org_customer_types" on public.customer_types;
create policy "users_read_own_org_customer_types"
on public.customer_types for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_customer_types" on public.customer_types;
create policy "admins_manage_own_org_customer_types"
on public.customer_types for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

grant select on public.customer_types to authenticated;
grant insert, update on public.customer_types to authenticated;

insert into public.customer_types (organization_id, name, code)
select id, 'Contractor', 'contractor'
from public.organizations
on conflict (organization_id, code) do nothing;

insert into public.customer_types (organization_id, name, code)
select id, 'Non-contractor', 'non_contractor'
from public.organizations
on conflict (organization_id, code) do nothing;

alter table public.quotes
  drop constraint if exists quotes_account_type_check;

alter table public.quotes
  add constraint quotes_customer_type_fk
  foreign key (organization_id, account_type)
  references public.customer_types(organization_id, code);
