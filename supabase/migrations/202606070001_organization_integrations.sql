-- Tenant-scoped external integrations. Secrets are encrypted by the app before storage.
create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('quoter')),
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  credentials_last4 jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, provider),
  constraint organization_integrations_updated_by_org_fk
    foreign key (updated_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_organization_integrations_org_provider
on public.organization_integrations(organization_id, provider);

drop trigger if exists set_organization_integrations_updated_at on public.organization_integrations;
create trigger set_organization_integrations_updated_at
  before update on public.organization_integrations
  for each row
  execute function public.set_updated_at();

alter table public.organization_integrations enable row level security;

drop policy if exists "admins_read_own_org_integrations" on public.organization_integrations;
create policy "admins_read_own_org_integrations"
on public.organization_integrations for select to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "admins_manage_own_org_integrations" on public.organization_integrations;
create policy "admins_manage_own_org_integrations"
on public.organization_integrations for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

insert into public.organization_integrations (
  organization_id,
  provider,
  is_enabled,
  config
)
values (
  '00000000-0000-0000-0000-000000000001',
  'quoter',
  false,
  jsonb_build_object(
    'api_base_url', 'https://api.quoter.com/v1',
    'currency_abbr', 'USD'
  )
)
on conflict (organization_id, provider) do nothing;
