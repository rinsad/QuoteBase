create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

-- User-scoped external integrations. Used for personal sender identities such
-- as each user's own Gmail mailbox.
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  provider text not null check (provider in ('gmail')),
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  credentials_last4 jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, user_id, provider),
  constraint user_integrations_user_org_fk
    foreign key (user_id, organization_id)
    references public.users(id, organization_id)
    on delete cascade,
  constraint user_integrations_updated_by_org_fk
    foreign key (updated_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_user_integrations_org_user_provider
on public.user_integrations(organization_id, user_id, provider);

drop trigger if exists set_user_integrations_updated_at on public.user_integrations;
create trigger set_user_integrations_updated_at
  before update on public.user_integrations
  for each row
  execute function public.set_updated_at();

alter table public.user_integrations enable row level security;

drop policy if exists "users_read_own_integrations" on public.user_integrations;
create policy "users_read_own_integrations"
on public.user_integrations for select to authenticated
using (
  organization_id = public.current_user_organization_id()
  and user_id = public.current_user_id()
);

drop policy if exists "users_manage_own_integrations" on public.user_integrations;
create policy "users_manage_own_integrations"
on public.user_integrations for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and user_id = public.current_user_id()
)
with check (
  organization_id = public.current_user_organization_id()
  and user_id = public.current_user_id()
);

insert into public.user_integrations (
  organization_id,
  user_id,
  provider,
  is_enabled,
  config,
  credentials_encrypted,
  credentials_last4,
  updated_by
)
select
  oi.organization_id,
  coalesce(oi.updated_by, admin_user.id),
  'gmail',
  oi.is_enabled,
  '{}'::jsonb,
  oi.credentials_encrypted,
  oi.credentials_last4,
  coalesce(oi.updated_by, admin_user.id)
from public.organization_integrations oi
join lateral (
  select u.id
  from public.users u
  where u.organization_id = oi.organization_id
    and u.role = 'admin'
    and u.is_active = true
  order by u.created_at
  limit 1
) admin_user on true
where oi.provider = 'gmail'
  and oi.is_enabled = true
  and oi.credentials_encrypted is not null
  and nullif(oi.credentials_last4->>'email', '') is not null
on conflict (organization_id, user_id, provider) do update
set
  is_enabled = excluded.is_enabled,
  credentials_encrypted = excluded.credentials_encrypted,
  credentials_last4 = excluded.credentials_last4,
  updated_by = excluded.updated_by,
  updated_at = now();
