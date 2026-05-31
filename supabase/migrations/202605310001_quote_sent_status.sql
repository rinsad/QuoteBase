-- Allow approved quotes to move into customer-facing lifecycle states.

alter table public.quotes
drop constraint if exists quotes_status_check;

alter table public.quotes
add constraint quotes_status_check
check (
  status in (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'sent',
    'viewed',
    'accepted',
    'declined',
    'expired'
  )
);
