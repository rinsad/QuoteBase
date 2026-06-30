create table if not exists public.organization_onboarding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  is_dismissed boolean not null default false,
  dismissed_at timestamptz null,
  completed_at timestamptz null,
  current_step text not null default 'import'
    check (current_step in ('import', 'markup', 'contacts', 'first_quote')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id),
  constraint organization_onboarding_updated_by_org_fk
    foreign key (updated_by, organization_id)
    references public.users(id, organization_id)
    on delete set null
);

create index if not exists idx_organization_onboarding_org
on public.organization_onboarding(organization_id);

drop trigger if exists set_organization_onboarding_updated_at on public.organization_onboarding;
create trigger set_organization_onboarding_updated_at
  before update on public.organization_onboarding
  for each row execute function public.set_updated_at();

alter table public.organization_onboarding enable row level security;

drop policy if exists "users_read_own_org_onboarding" on public.organization_onboarding;
create policy "users_read_own_org_onboarding"
on public.organization_onboarding for select to authenticated
using (
  organization_id in (
    select organization_id from public.users where auth_user_id = auth.uid()
  )
);

drop policy if exists "users_manage_own_org_onboarding" on public.organization_onboarding;
create policy "users_manage_own_org_onboarding"
on public.organization_onboarding for all to authenticated
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
