-- Quote document archive and private storage bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-documents',
  'quote-documents',
  false,
  10485760,
  array['text/html', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.quote_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  version integer not null,
  document_type text not null check (document_type in ('html', 'pdf')),
  storage_bucket text not null default 'quote-documents',
  storage_path text not null,
  status text not null default 'generated'
    check (status in ('generated', 'archived', 'voided')),
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (organization_id, quote_id, version, document_type),
  unique (organization_id, storage_bucket, storage_path),
  constraint quote_documents_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_documents_generated_by_org_fk
    foreign key (generated_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_quote_documents_org_quote
on public.quote_documents(organization_id, quote_id, generated_at desc);

alter table public.quote_documents enable row level security;

drop policy if exists "users_read_own_org_quote_documents" on public.quote_documents;
create policy "users_read_own_org_quote_documents"
on public.quote_documents for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_insert_quote_documents" on public.quote_documents;
create policy "admins_account_managers_insert_quote_documents"
on public.quote_documents for insert to authenticated
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "admins_account_managers_update_quote_documents" on public.quote_documents;
create policy "admins_account_managers_update_quote_documents"
on public.quote_documents for update to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);

drop policy if exists "users_read_own_org_quote_document_objects" on storage.objects;
create policy "users_read_own_org_quote_document_objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'quote-documents'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
);

drop policy if exists "admins_account_managers_insert_quote_document_objects" on storage.objects;
create policy "admins_account_managers_insert_quote_document_objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quote-documents'
  and split_part(name, '/', 1) = public.current_user_organization_id()::text
  and public.current_user_role() in ('admin', 'account_manager')
);
