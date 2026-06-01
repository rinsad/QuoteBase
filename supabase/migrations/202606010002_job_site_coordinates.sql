-- Capture delivery coordinates for distance and plant-selection workflows.

alter table public.job_sites
add column if not exists latitude numeric(10,7),
add column if not exists longitude numeric(10,7);
