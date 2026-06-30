-- Follow-up agent MVP: draft queue, approval workflow, and due-date tracking.

alter table public.quotes
  add column if not exists followup_date date,
  add column if not exists last_followup_at timestamptz;

alter table public.pricing_config
  add column if not exists big_quote_threshold numeric(12,2) not null default 10000
    check (big_quote_threshold > 0);

alter table public.pricing_config
  add column if not exists follow_up_auto_send_enabled boolean not null default false,
  add column if not exists follow_up_sms_enabled boolean not null default false;

alter table public.pricing_config
  add column if not exists follow_up_auto_send_enabled boolean not null default false,
  add column if not exists follow_up_sms_enabled boolean not null default false;

create table if not exists public.quote_follow_up_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  owner_id uuid not null,
  recipient_email text,
  recipient_phone text,
  channel text not null default 'email'
    check (channel in ('email', 'sms')),
  tone text not null
    check (tone in ('friendly', 'urgent', 'final', 'owner_escalation')),
  stage_day integer not null check (stage_day in (2, 5, 10)),
  subject text not null,
  body text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'sent', 'skipped', 'cancelled', 'failed')),
  auto_send boolean not null default false,
  big_quote_escalation boolean not null default false,
  due_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  sent_by uuid,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint quote_follow_up_drafts_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_follow_up_drafts_owner_org_fk
    foreign key (owner_id, organization_id)
    references public.users(id, organization_id),
  constraint quote_follow_up_drafts_approved_by_org_fk
    foreign key (approved_by, organization_id)
    references public.users(id, organization_id),
  constraint quote_follow_up_drafts_sent_by_org_fk
    foreign key (sent_by, organization_id)
    references public.users(id, organization_id)
);

create index if not exists idx_quotes_followup_due
on public.quotes(organization_id, followup_date, status, is_active);

create index if not exists idx_quote_follow_up_drafts_queue
on public.quote_follow_up_drafts(organization_id, status, due_at desc);

create unique index if not exists idx_quote_follow_up_drafts_unique_pending_stage
on public.quote_follow_up_drafts(organization_id, quote_id, channel, stage_day)
where status in ('pending_approval', 'approved', 'sent');

drop trigger if exists set_quote_follow_up_drafts_updated_at on public.quote_follow_up_drafts;
create trigger set_quote_follow_up_drafts_updated_at
  before update on public.quote_follow_up_drafts
  for each row
  execute function public.set_updated_at();

alter table public.quote_follow_up_drafts enable row level security;

drop policy if exists "users_read_own_org_quote_follow_up_drafts" on public.quote_follow_up_drafts;
create policy "users_read_own_org_quote_follow_up_drafts"
on public.quote_follow_up_drafts for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "admins_account_managers_manage_own_org_quote_follow_up_drafts" on public.quote_follow_up_drafts;
create policy "admins_account_managers_manage_own_org_quote_follow_up_drafts"
on public.quote_follow_up_drafts for all to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
)
with check (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() in ('admin', 'account_manager')
);
