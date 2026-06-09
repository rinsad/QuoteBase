-- Enforce A.4 audit-log visibility:
-- admins can read all organization actions; non-admin users can read only their own.

drop policy if exists "users_read_own_org_audit_log" on public.audit_log;
drop policy if exists "admins_full_non_admins_own_audit_log" on public.audit_log;

create policy "admins_full_non_admins_own_audit_log"
on public.audit_log
for select
to authenticated
using (
  organization_id = public.current_user_organization_id()
  and (
    public.current_user_role() = 'admin'
    or user_id = (
      select users.id
      from public.users
      where users.auth_user_id = auth.uid()
        and users.organization_id = public.current_user_organization_id()
        and users.is_active = true
      limit 1
    )
  )
);
