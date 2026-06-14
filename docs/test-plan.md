# QuoteBase Comprehensive Test Plan

Last updated: 2026-06-12

## Purpose

This plan defines how QuoteBase should be tested before feature work is considered safe to merge or deploy. The app is a multi-tenant quoting SaaS, so the test suite must prove more than "the UI loads": it must verify authentication, organization scoping, role authorization, pricing correctness, audit logging, and core quote workflows.

## Test Strategy

QuoteBase should use a layered test strategy:

1. Static checks catch syntax, lint, type, and production build failures.
2. Playwright E2E tests prove that browser workflows, routing, auth boundaries, and API guardrails work together.
3. API integration tests verify response envelopes, validation, role checks, and tenant scoping.
4. Database/RLS tests verify isolation at the persistence layer.
5. Manual exploratory testing covers UX polish, copy, edge-case workflows, and integration setup screens.

The automated Playwright suite now covers public pages, anonymous redirects,
invalid public quote links, protected API `401` responses, authenticated
navigation, role access, customer/job-site workflows, quote calculation/status
APIs, material price administration, audit logging, and the browser quote draft
form. Admin tax-rate and pricing-rule changes are also covered through browser
workflows with database and audit verification. Quote lifecycle status changes
are covered through browser workflows for submit, approve, send, accept, request
changes, and resubmit. Public quote links, unauthenticated customer responses,
quote document generation, and document download authorization are covered.
Multi-tenant isolation is now covered with a second seeded test organization:
tenant B cannot list, fetch, patch, or download tenant A customer, quote,
supplier, material-price, or quote-document records.
Pipedrive integration is now covered with a local fake Pipedrive server for
admin settings, encrypted token storage, customer push, cron import, and
idempotent customer sync behavior.

## Latest Automated Test Report

Run date: 2026-06-12

Commands:

- `npm run test:e2e`
- `npm run lint`
- `npm run build`

Result:

- Playwright: passing, 36 tests.
- Lint: passing.
- Build: passing.

Notes:

- Playwright is configured with one worker because Supabase magic links and
  Mailpit are shared external state. A parallel run can race OTP links and
  produce false authentication failures.
- This phase found and fixed a cross-tenant quote status transition bug where a
  no-row Supabase response returned `500` instead of tenant-safe `404`.
- This phase also found and fixed Pipedrive cron import bugs around partial
  unique-index upserts and null primary keys for newly imported customers.

Report:

- HTML report: `playwright-report/index.html`
- Local report server: `http://127.0.0.1:9323`

## Tooling

Primary tools:

- `npm run lint` for ESLint.
- `npm run build` for Next.js production compilation and type validation.
- `npm run test:e2e` for Playwright tests.
- `npm run test:e2e:ui` for interactive Playwright UI mode.
- `npm run test:e2e:report` for the Playwright HTML report.

Playwright should retain screenshots, videos, and traces on failure. Passing tests should avoid noisy artifacts.

## Test Environments

### Local Development

Use local Next.js and either local Supabase or a dedicated test Supabase project.

Requirements:

- Stable test organization A.
- Stable test organization B.
- Admin user for each organization.
- Account manager user for organization A.
- Estimator user for organization A.
- Seeded customers, job sites, suppliers, plants, materials, yards, vehicle types, tax rates, pricing config, and feature flags.

### CI

CI should run static checks and non-mutating Playwright tests first. Mutating workflow tests should run only against an isolated test database that is reset or recreated for each run.

Required CI gates:

- Lint passes.
- Build passes.
- Playwright smoke/API tests pass.
- No committed secrets are detected.
- Database migrations apply cleanly.

## Test Data

Create deterministic fixtures:

- Organization A: `western-materials-test-a`
- Organization B: `western-materials-test-b`
- Users:
  - `admin-a@example.test`
  - `manager-a@example.test`
  - `estimator-a@example.test`
  - `admin-b@example.test`
- Customer A1 with two job sites.
- Supplier A1 with at least two plants.
- Materials across R1-R4 tiers.
- One yard with coordinates.
- Vehicle types with ton and cubic yard capacity.
- Pricing config with all fees, minimums, markups, and taxes populated from database rows.
- Feature flags enabled and disabled across both organizations.

Never rely on production data for automated tests.

## Phase 1: Baseline Safety

Run on every meaningful change.

Checks:

- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`

Current status as of 2026-06-12:

- Lint: passing.
- Build: passing.
- Playwright browser/API suite: passing, 36 tests.
- Audit: reports a moderate PostCSS advisory through Next.js; npm suggests a breaking force fix, so this should be tracked rather than blindly applied.

## Phase 2: Public And Anonymous Access

Automate with Playwright.

Coverage:

- `/` renders the public landing page.
- `/login` renders email magic-link form.
- `/login` lists approved test users.
- Anonymous `/dashboard` redirects to `/login`.
- Anonymous `/quotes`, `/quotes/new`, `/customers`, and `/admin/*` redirect to `/login`.
- Invalid `/q/[token]` returns `404`.
- Valid public quote link loads without requiring auth.
- Public quote link never exposes internal-only fields, audit data, user IDs, or organization-private configuration.

Pass criteria:

- Public pages load with `200`.
- Protected pages never render private content for anonymous users.
- Invalid public tokens return `404`.

## Phase 3: API Authentication And Validation

Automate with Playwright API requests or a dedicated integration runner.

Coverage:

- Anonymous requests to protected APIs return `401`.
- Authenticated requests with insufficient role return `403`.
- Invalid payloads return `400`.
- Missing resources return `404`.
- Unexpected errors return generic `500` without stack traces or internal paths.
- Response envelope remains consistent:
  - `data`
  - `error`
  - `meta`

Endpoints:

- `GET /api/customers`
- `POST /api/customers`
- `GET /api/customers/[id]`
- `PATCH /api/customers/[id]`
- `GET /api/suppliers`
- `GET /api/suppliers/[id]`
- `GET /api/quotes`
- `POST /api/quotes`
- `GET /api/quotes/[id]`
- `PATCH /api/quotes/[id]/status`
- `POST /api/quotes/calculate`
- `POST /api/materials/price`
- `POST /api/materials/bulk-price-update`
- `GET /api/quote-documents/[id]/download`
- `POST /api/slack/actions`
- `GET /api/integrations/gmail/connect`
- `GET /api/integrations/gmail/callback`
- `GET /api/cron/pipedrive-sync`

Pass criteria:

- Every protected API calls `supabase.auth.getUser()` or uses `getCurrentUser()` before processing.
- All inputs are validated at route boundaries.
- Role-restricted actions enforce roles server-side.

## Phase 4: Authenticated Navigation

Automate with Playwright authenticated storage state.

Coverage by role:

- Admin can access dashboard, quotes, customers, approvals, approved quotes, audit log, and all admin screens.
- Account manager can access allowed quoting and operational screens but cannot access admin-only settings.
- Estimator can create and submit drafts but cannot approve, reject, update pricing config, manage users, or configure integrations.
- Organization B user cannot access organization A records by URL manipulation.

Pass criteria:

- Role navigation matches permissions.
- Direct URL access is denied when role is insufficient.
- No private data appears in server-rendered HTML for forbidden pages.

## Phase 5: Customer Workflow

Automate with Playwright and API assertions.

Coverage:

- Create customer.
- Update customer.
- Add/update job site.
- Validate required fields.
- Reject invalid email, phone, address, or coordinate inputs where applicable.
- Soft-disable customer if that feature exists.
- Verify audit log for state-changing actions.
- Verify customer appears in quote creation flow.

Tenant checks:

- Organization A cannot fetch, patch, or use organization B customer IDs.
- Customer job sites remain scoped to their customer and organization.

Pass criteria:

- Customer writes are organization-scoped.
- No hard delete occurs unless explicitly designed and reviewed.
- Audit entries include user, organization, action, target, before, and after.

## Phase 6: Quote Creation And Pricing

This is the highest-value workflow and should be the first deep authenticated suite.

Coverage:

- Create quote draft.
- Select existing customer.
- Create/select job site.
- Add material line item.
- Select supplier/plant.
- Calculate delivery distance.
- Apply vehicle capacity.
- Apply pricing config from database.
- Apply R1-R4 tier logic.
- Apply taxes and fees.
- Save draft.
- Reload draft and verify persisted values.
- Print view renders.

Negative cases:

- Missing customer fails validation.
- Missing job site fails validation.
- Invalid material ID fails.
- Cross-tenant material/customer/job site IDs fail.
- Hardcoded business rule regression checks where practical.

Pass criteria:

- Calculations match expected fixture outputs.
- All business config comes from tenant-scoped database config.
- Quote item vehicle/load calculations are deterministic.
- No quote can reference another tenant's customer, material, supplier, plant, yard, tax rate, or pricing config.

## Phase 7: Quote Approval Workflow

Automate with admin, account manager, and estimator roles.

Coverage:

- Estimator submits draft for approval.
- Admin approves pending quote.
- Admin rejects pending quote with note.
- Account manager performs allowed transitions.
- Unauthorized role cannot approve/reject.
- Approved quote can be marked sent.
- Sent quote can be accepted or declined.
- Revision can be created from approved/sent/customer-response quote.
- Status transition guards reject invalid transitions.

Audit checks:

- Every status transition writes `logAction()`.
- Audit row includes before and after status.
- Audit log is append-only.

Pass criteria:

- Workflow state machine cannot be bypassed through API calls.
- Role rules are enforced server-side.
- Slack/email side effects are either mocked, disabled by feature flag, or asserted through test doubles.

## Phase 8: Admin Configuration

Automate with admin role.

Coverage:

- Pricing config screen.
- Tax rates.
- Material prices.
- Suppliers.
- Plants.
- Yards.
- Vehicle types.
- Feature flags.
- Users/invites.
- Audit log.
- System check.
- Gmail integration settings.
- Slack integration settings.
- Pipedrive integration settings.

Checks:

- Admin-only pages reject non-admin roles.
- State-changing actions write audit logs.
- Updates are scoped by `organization_id`.
- Feature flags control gated behavior.
- Secrets are never displayed in full after saving.
- Integration credentials are encrypted or stored through approved secret handling.

Pass criteria:

- Admin changes affect only current organization.
- No secrets appear in rendered HTML, logs, reports, or Playwright traces.
- Disabled feature flags prevent gated actions.

## Phase 9: Multi-Tenancy And RLS

Automate through database/API tests.

Coverage:

- Organization A cannot list organization B customers.
- Organization A cannot fetch organization B quote by ID.
- Organization A cannot update organization B customer/quote/supplier/material.
- Organization A cannot use organization B foreign keys in create/update payloads.
- RLS is enabled on all business tables.
- RLS policies exist before seeded data is inserted in migrations.
- Composite tenant constraints prevent cross-tenant references.

Tables to verify:

- `organizations`
- `users`
- `user_invites`
- `customers`
- `job_sites`
- `quotes`
- `quote_items`
- `quote_documents`
- `quote_public_links`
- `quote_revisions`
- `suppliers`
- `plants`
- `materials`
- `material_price_history`
- `yards`
- `vehicle_types`
- `pricing_config`
- `tax_rates`
- `feature_flags`
- `organization_integrations`
- `distances`
- `audit_log`

Pass criteria:

- Tenant isolation passes at API and database levels.
- RLS bypass is never possible with anon/authenticated clients.
- Service-role usage stays server-only and narrowly scoped.

## Phase 10: Integrations

Use mocks or dedicated sandbox credentials. Do not call production providers from tests.

Gmail:

- Connect route rejects unauthorized users.
- OAuth state validates user and organization.
- Callback handles missing/invalid code.
- Tokens are stored securely.
- Email send behavior respects feature flags.

Slack:

- Settings can be saved by admin only.
- Notification action validates payload.
- Slack failures do not corrupt quote workflow.
- Feature flag disabled state skips notification.

Pipedrive:

- Sync route authorization is protected when `CRON_SECRET` is configured.
- Admin settings save encrypted credentials without exposing the token.
- Customer creation pushes scoped contact data to Pipedrive.
- Customer sync is idempotent.
- External IDs are stored tenant-scoped.
- API failures are handled without partial unsafe writes.

Pass criteria:

- Integration tests never expose real tokens.
- External side effects are mocked or run only against sandboxes.

## Phase 11: Documents And Public Quote Links

Coverage:

- Quote document download requires auth.
- Download route validates UUIDs.
- Document belongs to user's organization before signed URL is created.
- Public quote links are token-based.
- Public quote links show only customer-safe content.
- Public quote print view renders.
- Expired or inactive links fail safely if expiration/inactivation exists.

Pass criteria:

- No cross-tenant document access.
- No private quote internals in public views.

## Phase 12: Performance And Reliability

Coverage:

- List endpoints paginate.
- Large customer/quote lists render without excessive delay.
- Distance API calls use cached `distances` records.
- Bulk material updates use bulk database calls.
- No obvious N+1 patterns in high-traffic pages.
- Playwright smoke tests run against mobile and desktop viewports at least before release.

Pass criteria:

- No endpoint likely to return unbounded large result sets.
- Critical workflows complete within acceptable local/CI thresholds.

## Manual Exploratory Checklist

Before release, manually verify:

- Login page messaging and error states.
- Dashboard layout at desktop and mobile widths.
- Quote creation form usability.
- Error states in long forms.
- Admin screens with empty data and populated data.
- Print views.
- Public quote link on mobile.
- Browser back/forward behavior in multi-step workflows.
- Loading states.
- Copy clarity for failed integration setup.

## Test Reporting

After Playwright runs:

- Open report with `npm run test:e2e:report`.
- Review failures in the HTML report.
- Use trace viewer for action-by-action debugging.
- Preserve failure screenshots/videos for bug reports.
- Do not commit generated `playwright-report/` or `test-results/`.

## Definition Of Done For New Features

A feature is not done until:

- Lint passes.
- Build passes.
- Existing Playwright tests pass.
- New or changed behavior has tests.
- State-changing behavior writes audit logs.
- Business rules are database-configured, not hardcoded.
- Tenant-scoped queries include `organization_id`.
- Role checks are server-side.
- API inputs are validated.
- Secrets are not exposed.
- Manual smoke testing is complete for the affected workflow.

## Immediate Next Tests To Add

1. Direct authenticated Supabase-client RLS checks for tenant A/B table reads.
2. Cross-tenant foreign-key rejection during quote creation payloads.
3. Integration route tests for Gmail, Slack, and Slack actions.
4. Mobile viewport smoke tests for dashboard, quote creation, public quote links, and admin forms.
5. Performance/pagination tests for large customer and quote lists.
6. Auth storage state setup to reduce repeated magic-link runtime without adding backdoors.
