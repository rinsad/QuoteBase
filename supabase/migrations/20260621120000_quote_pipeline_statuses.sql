-- Add first-class sales pipeline statuses for kanban and win-rate reporting.

alter table public.quotes
drop constraint if exists quotes_status_check;

alter table public.quotes
add constraint quotes_status_check
check (
  status in (
    'draft',
    'pending_approval',
    'changes_requested',
    'approved',
    'rejected',
    'sent',
    'viewed',
    'follow_up',
    'won',
    'lost',
    'accepted',
    'declined',
    'expired'
  )
);

update public.quotes
set status = 'won'
where status = 'accepted';

update public.quotes
set status = 'lost'
where status = 'declined';
