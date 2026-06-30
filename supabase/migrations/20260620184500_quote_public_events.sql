-- Track public quote views and customer response proof.

alter table public.quote_public_links
  add column if not exists view_count integer not null default 0,
  add column if not exists first_viewed_at timestamptz;

create table if not exists public.quote_public_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  public_link_id uuid not null,
  event_type text not null check (
    event_type in (
      'viewed',
      'accepted',
      'declined',
      'payment_started',
      'payment_tokenized',
      'payment_failed',
      'payment_completed'
    )
  ),
  request_ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint quote_public_events_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_public_events_link_org_fk
    foreign key (public_link_id, organization_id)
    references public.quote_public_links(id, organization_id)
);

create table if not exists public.quote_response_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null,
  public_link_id uuid not null,
  payment_attempt_id uuid,
  response text not null check (response in ('accepted', 'declined')),
  signer_name text,
  signer_email text,
  response_note text,
  accepted_terms boolean not null default true,
  request_ip text,
  user_agent text,
  provider_transaction_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint quote_response_proofs_quote_org_fk
    foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id),
  constraint quote_response_proofs_link_org_fk
    foreign key (public_link_id, organization_id)
    references public.quote_public_links(id, organization_id),
  constraint quote_response_proofs_payment_attempt_org_fk
    foreign key (payment_attempt_id, organization_id)
    references public.quote_payment_attempts(id, organization_id)
);

create index if not exists idx_quote_public_events_quote_created
on public.quote_public_events(organization_id, quote_id, created_at desc);

create index if not exists idx_quote_public_events_link_created
on public.quote_public_events(organization_id, public_link_id, created_at desc);

create index if not exists idx_quote_response_proofs_quote_created
on public.quote_response_proofs(organization_id, quote_id, created_at desc);

alter table public.quote_public_events enable row level security;
alter table public.quote_response_proofs enable row level security;

drop policy if exists "users_read_own_org_quote_public_events" on public.quote_public_events;
create policy "users_read_own_org_quote_public_events"
on public.quote_public_events for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists "users_read_own_org_quote_response_proofs" on public.quote_response_proofs;
create policy "users_read_own_org_quote_response_proofs"
on public.quote_response_proofs for select to authenticated
using (organization_id = public.current_user_organization_id());
