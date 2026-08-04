alter table public.quotes
  add column if not exists account_type text,
  add column if not exists project_status text;

update public.quotes
set
  account_type = coalesce(account_type, 'contractor'),
  project_status = coalesce(project_status, 'bid')
where account_type is null
   or project_status is null;

alter table public.quotes
  alter column account_type set not null,
  alter column project_status set not null;

alter table public.quotes
  drop constraint if exists quotes_account_type_check,
  drop constraint if exists quotes_project_status_check;

alter table public.quotes
  add constraint quotes_account_type_check
  check (account_type in ('contractor', 'non_contractor')),
  add constraint quotes_project_status_check
  check (project_status in ('bid', 'existing_job'));

create index if not exists idx_quotes_org_category_pipeline
on public.quotes(organization_id, account_type, project_status, status, is_active);
