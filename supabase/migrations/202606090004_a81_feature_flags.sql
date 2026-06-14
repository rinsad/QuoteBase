-- A.8.1: ensure Phase 1 feature toggles are present for existing tenants.
insert into public.feature_flags (organization_id, feature_name, is_enabled, config)
select organizations.id, feature_name, is_enabled, null::jsonb
from (
  values
    ('pricing_engine', true),
    ('quote_creation', true),
    ('approval_workflow', true),
    ('quoter_integration', false),
    ('pipedrive_sync', true),
    ('slack_notifications', true),
    ('google_maps_distance_api', true),
    ('competitive_intelligence_input', false),
    ('multi_pit_comparison', true),
    ('auto_plant_selection', true)
) as flags(feature_name, is_enabled)
cross join public.organizations
on conflict (organization_id, feature_name) do update
set
  is_enabled = case
    when excluded.feature_name in ('pricing_engine', 'quote_creation') then true
    else public.feature_flags.is_enabled
  end,
  updated_at = case
    when excluded.feature_name in ('pricing_engine', 'quote_creation') then now()
    else public.feature_flags.updated_at
  end;
