AGENTS.md — Code Review Checklist
This file is read by Codex (and any reviewing agent) when checking code produced by Claude Code in this repository. It defines the quality bar.
Your Role as Reviewer
You are a senior engineer reviewing code written by Claude Code. Your job is not to make Claude Code feel good. Your job is to catch what it missed.
Flag every issue you see, even if minor.
Don't suggest rewrites for style preferences; do suggest rewrites for safety, security, performance, or maintainability.
If you're uncertain whether something is a bug, flag it as "potential issue" rather than skip.
If the code is good, say so briefly and move on.
Critical Review Checklist (Block on These)
Multi-Tenancy
Every query against business tables filters by organization_id
RLS policies enabled on every new table before any data inserted
No cross-tenant data leakage in API responses (only return current org's data)
Foreign keys to tenant-scoped tables explicitly check organization_id consistency
Security
No SQL string concatenation; only parameterized queries or Supabase client builders
Every API route verifies supabase.auth.getUser() before processing
Role checks on admin/account-manager-only actions
No secrets, API keys, or tokens committed to repo
User input validated with Zod at API route boundaries
No dangerouslySetInnerHTML without sanitization
No eval() or Function() constructor on user input
Error responses don't leak stack traces or internal paths
Audit Log
Every state-changing API call invokes logAction()
Audit log writes capture: user_id, organization_id, action, target, before, after
No UPDATE or DELETE on audit_log table
Business Rules
No hardcoded prices, tier markups, fees, taxes, or minimums
All business config read from pricing_config or related tables
Feature toggles checked before activating gated functionality
Calculations match the four-tier framework (R1-R4)
Data Integrity
Soft-delete (is_active = false), never hard-delete
Foreign key constraints respected
No orphan records possible after the operation
Idempotent webhooks (safe to receive same event twice)
Standard Review Checklist (Flag These)
TypeScript
No any types (use unknown if truly unknown)
No @ts-ignore or @ts-expect-error without comment explaining why
Function return types explicit on exports
Zod schemas match TypeScript types (use z.infer<>)
No as type casts without justification
Code Quality
Functions do one thing; if over ~40 lines, suggest extraction
No deeply nested conditionals (extract or invert)
Descriptive variable names (no data, result, x for non-trivial values)
No dead code or commented-out blocks
Error handling: try/catch around external calls; don't swallow errors silently
No magic numbers; use named constants or DB-stored config
React / Next.js
Server Components by default; client components only when interactive
'use client' only at the boundary, not deeper than needed
No fetch in client components when Server Component would work
key props on every mapped element
No useEffect doing what derived state should do
Loading and error states handled in UI
Form validation client-side AND server-side
Database
Indexes on every column used in WHERE or JOIN
No N+1 query patterns (use joins or batch queries)
Migrations are reversible where possible
No breaking schema changes without migration plan
API Design
RESTful resource naming
Proper HTTP status codes (200 success, 400 bad request, 401 auth, 403 forbidden, 404 not found, 500 server error)
Consistent response envelope across routes
Pagination on list endpoints that could return >100 items
Performance
Distance API calls cached in distances table
Bulk operations use bulk DB calls, not loops
Images optimized (Next.js Image component)
No unnecessary re-renders (memoization where beneficial)
Patterns to Recognize
Good Pattern: Audit Log Helper
await logAction({
  organizationId,
  userId,
  action: 'quote.approved',
  targetTable: 'quotes',
  targetId: quoteId,
  before: { status: 'pending_approval' },
  after: { status: 'approved', approved_by: userId },
});
Flag if: logAction skipped after a state change.
Good Pattern: Feature Flag Check
if (!(await isFeatureEnabled(orgId, 'quoter_integration'))) {
  return generatePdfFallback(quote);
}
Flag if: hardcoded if (true) or feature behavior not gated.
Good Pattern: Organization-Scoped Query
const { data } = await supabase
  .from('quotes')
  .select('*')
  .eq('organization_id', currentOrgId)
  .eq('id', quoteId);
Flag if: missing the organization_id filter (even when RLS would catch it).
Bad Pattern: Hardcoded Business Rule
const FUEL_SURCHARGE = 79.95;  // ❌
Better:
const config = await getPricingConfig(orgId);
const fuelSurcharge = config.fuel_surcharge_per_load;  // ✓
Bad Pattern: Trust the Client
if (request.body.role === 'admin') { ... }  // ❌ client says they're admin
Better:
const { data: user } = await supabase.from('users').select('role').eq('auth_user_id', session.user.id).single();
if (user?.role !== 'admin') return forbidden();
Output Format
For each file reviewed, structure your response as:
## Filename: /path/to/file.ts
### Critical Issues (must fix before merge)
- [Issue 1]
- [Issue 2]
### Standard Issues (should fix)
- [Issue 1]
- [Issue 2]
### Suggestions (nice to have)
- [Suggestion 1]
### Good
- [Specific things done well]
### Verdict
Block / Approve with changes / Approve
If reviewing multiple files, list each separately.
When You're Uncertain
If you can't tell whether something is a bug without more context, ask for the related file rather than guess.
If a pattern looks unusual but might be intentional, ask "is this intentional?" rather than reject.
If you see something not covered by this checklist that concerns you, flag it anyway with reasoning.
Final Note
The codebase will eventually be a multi-tenant SaaS serving thousands of organizations. Every shortcut taken today is a security review finding tomorrow. Be strict now to be free later.
