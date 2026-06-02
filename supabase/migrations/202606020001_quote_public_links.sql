-- Add secure customer-facing quote links.

create table if not exists public.quote_public_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  unique (id, organization_id),
  constraint quote_public_links_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_public_links_created_by_org_fk
    foreign key (created_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_quote_public_links_quote_active
on public.quote_public_links(organization_id, quote_id, expires_at)
where revoked_at is null;

create index if not exists idx_quote_public_links_token_hash
on public.quote_public_links(token_hash);

alter table public.quote_public_links enable row level security;

drop policy if exists "users_read_own_org_quote_public_links" on public.quote_public_links;
create policy "users_read_own_org_quote_public_links"
on public.quote_public_links for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_quote_public_links" on public.quote_public_links;
create policy "admins_account_managers_insert_quote_public_links"
on public.quote_public_links for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_quote_public_links" on public.quote_public_links;
create policy "admins_account_managers_update_quote_public_links"
on public.quote_public_links for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);
