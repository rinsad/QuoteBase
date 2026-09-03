alter table public.trucking_profile_assignments
  add column material_id uuid;

alter table public.trucking_profile_assignments
  add constraint trucking_profile_assignments_material_org_fk
  foreign key (material_id, organization_id)
  references public.materials(id, organization_id);

create unique index uq_trucking_profile_assignment_material
  on public.trucking_profile_assignments(organization_id, material_id)
  where material_id is not null and is_active;

create index idx_trucking_profile_assignments_material
  on public.trucking_profile_assignments(organization_id, material_id)
  where material_id is not null;
