alter table public.quotes
add column if not exists parent_quote_id uuid,
add column if not exists revision_number integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_parent_quote_org_fk'
  ) then
    alter table public.quotes
      add constraint quotes_parent_quote_org_fk
      foreign key (parent_quote_id, organization_id)
      references public.quotes(id, organization_id);
  end if;
end $$;

create index if not exists idx_quotes_org_parent_revision
on public.quotes(organization_id, parent_quote_id, revision_number);

create unique index if not exists idx_quotes_org_parent_revision_unique
on public.quotes(organization_id, parent_quote_id, revision_number)
where parent_quote_id is not null;
