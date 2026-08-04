drop index if exists public.idx_quote_follow_up_drafts_unique_pending_stage;

create unique index if not exists idx_quote_follow_up_drafts_unique_pending_stage_tone
on public.quote_follow_up_drafts(organization_id, quote_id, channel, stage_day, tone)
where status in ('pending_approval', 'approved', 'sent');
