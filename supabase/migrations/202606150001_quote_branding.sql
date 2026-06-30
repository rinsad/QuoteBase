-- Tenant-scoped quote PDF branding and public logo assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-branding',
  'quote-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.quote_branding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id) on delete cascade,
  company_name text not null default 'QuoteBase',
  logo_url text,
  address_line1 text not null default '',
  address_line2 text,
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  country text not null default 'United States',
  phone text not null default '',
  footer_note text,
  disclaimer text not null default 'All quotes are valid for 30 days. All materials quoted are subject to availability. This estimated price is subject to change at any time. All prices include material, tax and freight unless otherwise specified. Delivery minimums, standby time, returned materials, restocking, fuel, environmental, and other applicable charges follow the current approved quote configuration and customer terms. Once customer orders materials, and material are loaded into the truck at the plant, the customer owns the material and is responsible for the payment; FOB Shipping Point. All invoices are due according to approved payment terms. Late balances may be subject to service charges, collection costs, and attorney fees where permitted. Upon acceptance of this quote, buyer may be required to sign this quote, complete credit documentation, and provide preliminary lien notice information prior to the commencement of delivery.',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint quote_branding_updated_by_org_fk
    foreign key (updated_by, organization_id)
    references public.users(id, organization_id)
);

drop trigger if exists set_quote_branding_updated_at on public.quote_branding;
create trigger set_quote_branding_updated_at
  before update on public.quote_branding
  for each row execute function public.set_updated_at();

alter table public.quote_branding enable row level security;

drop policy if exists "users_read_own_org_quote_branding" on public.quote_branding;
create policy "users_read_own_org_quote_branding"
on public.quote_branding for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_manage_own_org_quote_branding" on public.quote_branding;
create policy "admins_manage_own_org_quote_branding"
on public.quote_branding for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "admins_insert_own_org_quote_branding_objects" on storage.objects;
create policy "admins_insert_own_org_quote_branding_objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quote-branding'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() = 'admin'
);

drop policy if exists "admins_update_own_org_quote_branding_objects" on storage.objects;
create policy "admins_update_own_org_quote_branding_objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'quote-branding'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() = 'admin'
)
with check (
  bucket_id = 'quote-branding'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() = 'admin'
);

insert into public.quote_branding (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;
