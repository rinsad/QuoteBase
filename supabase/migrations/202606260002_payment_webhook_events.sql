-- Idempotent payment webhook event ledger.

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  provider text not null check (provider in ('stripe')),
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed', 'ignored')),
  payment_attempt_id uuid,
  raw_event jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, provider, provider_event_id),
  constraint payment_webhook_events_attempt_org_fk
    foreign key (payment_attempt_id, organization_id)
    references public.quote_payment_attempts(id, organization_id)
);

create index if not exists idx_payment_webhook_events_org_created
on public.payment_webhook_events(organization_id, created_at desc);

create index if not exists idx_payment_webhook_events_attempt
on public.payment_webhook_events(organization_id, payment_attempt_id)
where payment_attempt_id is not null;

alter table public.payment_webhook_events enable row level security;

drop policy if exists "admins_read_own_org_payment_webhook_events" on public.payment_webhook_events;
create policy "admins_read_own_org_payment_webhook_events"
on public.payment_webhook_events for select to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_role() = 'admin'
);
