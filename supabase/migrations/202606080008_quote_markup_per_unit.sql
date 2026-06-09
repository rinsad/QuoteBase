-- A.6.1: material tier markups are dollar-per-unit amounts, not percentages.
-- Keep markup_pct for backward compatibility with existing code/rows while
-- storing the correct semantic value in markup_per_unit going forward.

alter table public.quote_items
add column if not exists markup_per_unit numeric(10,2);

update public.quote_items
set markup_per_unit = markup_pct
where markup_per_unit is null;

alter table public.quote_items
alter column markup_per_unit set default 0;
