-- Day 1 core tenancy, users, feature flags, and RLS.
-- Run this in Supabase before inserting broader business data.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text not null,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'account_manager', 'estimator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'account_manager', 'estimator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  feature_name text not null,
  is_enabled boolean not null default false,
  config jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, feature_name)
);

create index if not exists idx_users_auth_user_id on public.users(auth_user_id);
create index if not exists idx_users_org_email on public.users(organization_id, email);
create index if not exists idx_feature_flags_org_name on public.feature_flags(organization_id, feature_name);

insert into public.organizations (id, name, slug, industry)
values (
  '00000000-0000-0000-0000-000000000001',
  'Western Materials',
  'western-materials',
  'construction_materials'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  industry = excluded.industry,
  updated_at = now();

insert into public.user_invites (organization_id, email, full_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'john@westernmaterials.net', 'John Montazeri', 'admin'),
  ('00000000-0000-0000-0000-000000000001', 'admin@westernmaterials.net', 'Judd', 'admin'),
  ('00000000-0000-0000-0000-000000000001', 'estimate@westernmaterials.net', 'Gloria', 'account_manager'),
  ('00000000-0000-0000-0000-000000000001', 'bid@westernmaterials.net', 'Kristina', 'account_manager'),
  ('00000000-0000-0000-0000-000000000001', 'dispatch@westernmaterials.net', 'Claudina', 'estimator'),
  ('00000000-0000-0000-0000-000000000001', 'info@westernmaterials.net', 'Carlos', 'estimator'),
  ('00000000-0000-0000-0000-000000000001', 'rinsad@gmail.com', 'Rinsad', 'admin')
on conflict (email) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = true;

insert into public.feature_flags (organization_id, feature_name, is_enabled, config)
values
  ('00000000-0000-0000-0000-000000000001', 'pricing_engine', true, null),
  ('00000000-0000-0000-0000-000000000001', 'quote_creation', true, null),
  ('00000000-0000-0000-0000-000000000001', 'approval_workflow', true, null),
  ('00000000-0000-0000-0000-000000000001', 'quoter_integration', true, null),
  ('00000000-0000-0000-0000-000000000001', 'pipedrive_sync', true, null),
  ('00000000-0000-0000-0000-000000000001', 'slack_notifications', true, null),
  ('00000000-0000-0000-0000-000000000001', 'google_maps_distance_api', true, null),
  ('00000000-0000-0000-0000-000000000001', 'competitive_intelligence_input', false, null),
  ('00000000-0000-0000-0000-000000000001', 'multi_pit_comparison', true, null),
  ('00000000-0000-0000-0000-000000000001', 'auto_plant_selection', true, null),
  ('00000000-0000-0000-0000-000000000001', 'internal_quoting_module', false, null),
  ('00000000-0000-0000-0000-000000000001', 'internal_crm_module', false, null),
  ('00000000-0000-0000-0000-000000000001', 'email_sms_automation', false, null),
  ('00000000-0000-0000-0000-000000000001', 'ai_pricing_suggestions', false, null),
  ('00000000-0000-0000-0000-000000000001', 'ai_quote_drafting', false, null),
  ('00000000-0000-0000-0000-000000000001', 'multi_tenant_mode', false, null),
  ('00000000-0000-0000-0000-000000000001', 'public_api_access', false, null)
on conflict (organization_id, feature_name) do update
set
  is_enabled = excluded.is_enabled,
  config = excluded.config,
  updated_at = now();

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.user_invites%rowtype;
begin
  select *
  into invite_record
  from public.user_invites
  where email = lower(new.email)
    and is_active = true
  limit 1;

  if invite_record.id is null then
    raise exception 'Email % is not allowlisted for this application', new.email;
  end if;

  insert into public.users (
    organization_id,
    auth_user_id,
    email,
    full_name,
    role,
    is_active
  )
  values (
    invite_record.organization_id,
    new.id,
    lower(new.email),
    invite_record.full_name,
    invite_record.role,
    true
  )
  on conflict (auth_user_id) do update
  set
    organization_id = excluded.organization_id,
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.user_invites enable row level security;
alter table public.feature_flags enable row level security;

drop policy if exists "users_see_own_organization" on public.organizations;
create policy "users_see_own_organization"
on public.organizations
for select
to authenticated
using (id = public.current_user_organization_id());

drop policy if exists "users_see_own_org_users" on public.users;
create policy "users_see_own_org_users"
on public.users
for select
to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_users" on public.users;
create policy "admins_manage_own_org_users"
on public.users
for update
to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "service_role_manages_invites" on public.user_invites;
create policy "service_role_manages_invites"
on public.user_invites
for all
to service_role
using (true)
with check (true);

drop policy if exists "users_see_own_org_flags" on public.feature_flags;
create policy "users_see_own_org_flags"
on public.feature_flags
for select
to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_flags" on public.feature_flags;
create policy "admins_manage_own_org_flags"
on public.feature_flags
for update
to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);
