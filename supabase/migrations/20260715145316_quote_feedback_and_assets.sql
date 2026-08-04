insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-assets',
  'quote-assets',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.quote_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  created_by uuid not null,
  feedback_type text not null default 'general'
    check (feedback_type in ('price_too_high', 'question', 'requested_change', 'timing', 'general')),
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  constraint quote_feedback_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_feedback_created_by_org_fk
    foreign key (created_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_quote_feedback_org_quote_created
on public.quote_feedback(organization_id, quote_id, created_at desc);

alter table public.quote_feedback enable row level security;

drop policy if exists "users_read_own_org_quote_feedback" on public.quote_feedback;
create policy "users_read_own_org_quote_feedback"
on public.quote_feedback for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_insert_own_org_quote_feedback" on public.quote_feedback;
create policy "users_insert_own_org_quote_feedback"
on public.quote_feedback for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and created_by in (
    select id
    from public.users
    where organization_id = public.current_user_organization_id()
      and auth_user_id = (select auth.uid())
  )
);

create table if not exists public.quote_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  uploaded_by uuid not null,
  material_id uuid,
  asset_type text not null default 'other'
    check (asset_type in ('spec', 'test', 'photo', 'other')),
  title text not null check (length(trim(title)) > 0),
  source_filename text not null,
  source_mime_type text not null,
  storage_bucket text not null default 'quote-assets'
    check (storage_bucket = 'quote-assets'),
  storage_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, storage_bucket, storage_path),
  constraint quote_assets_uploaded_by_org_fk
    foreign key (uploaded_by, organization_id)
    references public.users(id, organization_id),
  constraint quote_assets_material_org_fk
    foreign key (material_id, organization_id)
    references public.materials(id, organization_id)
);

create index if not exists idx_quote_assets_org_active_type
on public.quote_assets(organization_id, is_active, asset_type, created_at desc);

alter table public.quote_assets enable row level security;

drop policy if exists "users_read_own_org_quote_assets" on public.quote_assets;
create policy "users_read_own_org_quote_assets"
on public.quote_assets for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_quote_assets" on public.quote_assets;
create policy "admins_account_managers_insert_quote_assets"
on public.quote_assets for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
  and uploaded_by in (
    select id
    from public.users
    where organization_id = public.current_user_organization_id()
      and auth_user_id = (select auth.uid())
  )
);

drop policy if exists "admins_account_managers_update_quote_assets" on public.quote_assets;
create policy "admins_account_managers_update_quote_assets"
on public.quote_assets for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
  and uploaded_by in (
    select id
    from public.users
    where organization_id = public.current_user_organization_id()
      and auth_user_id = (select auth.uid())
  )
);

create table if not exists public.quote_asset_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  asset_id uuid not null,
  attached_by uuid not null,
  attached_at timestamptz not null default now(),
  unique (organization_id, quote_id, asset_id),
  constraint quote_asset_links_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_asset_links_asset_org_fk
    foreign key (asset_id, organization_id)
    references public.quote_assets(id, organization_id),
  constraint quote_asset_links_attached_by_org_fk
    foreign key (attached_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_quote_asset_links_org_quote
on public.quote_asset_links(organization_id, quote_id, attached_at desc);

alter table public.quote_asset_links enable row level security;

drop policy if exists "users_read_own_org_quote_asset_links" on public.quote_asset_links;
create policy "users_read_own_org_quote_asset_links"
on public.quote_asset_links for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_quote_asset_links" on public.quote_asset_links;
create policy "admins_account_managers_insert_quote_asset_links"
on public.quote_asset_links for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
  and attached_by in (
    select id
    from public.users
    where organization_id = public.current_user_organization_id()
      and auth_user_id = (select auth.uid())
  )
);

drop trigger if exists set_quote_assets_updated_at on public.quote_assets;
create trigger set_quote_assets_updated_at
  before update on public.quote_assets
  for each row
  execute function public.set_updated_at();

drop policy if exists "users_read_own_org_quote_asset_objects" on storage.objects;
create policy "users_read_own_org_quote_asset_objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'quote-assets'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
);

drop policy if exists "admins_account_managers_insert_own_org_quote_asset_objects" on storage.objects;
create policy "admins_account_managers_insert_own_org_quote_asset_objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quote-assets'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() in ('admin', 'account_manager')
);
