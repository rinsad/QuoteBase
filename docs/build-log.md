# Build Log

## 2026-05-30 - Project Memory Setup

- Read and extracted the project docs from `docs/*.docx`.
- Created `PROJECT_MEMORY.md` as the durable project summary.
- Created Codex local memory at `C:/Users/Rinsad/.codex/memories/quotebase-western-materials.md`.
- Added `.env` for future `OPENAI_API_KEY` configuration.
- Added `.gitignore` entries for `.env` and `.codex_tmp/`.

Next likely step:

- Day 0 setup: scaffold the Next.js 15 app, initialize Git, add root `CLAUDE.md`/`AGENTS.md`, configure Supabase env variables, and prepare for Day 1 schema/auth work.

## 2026-05-30 - Day 0 App Scaffold

- Initialized a Git repository in `D:\work\QuoteBase`.
- Scaffolded a Next.js app with App Router, TypeScript, Tailwind CSS v4, and ESLint.
- Pinned the app to Next.js 15.5.18 to match the project SRS.
- Initialized shadcn/ui and added the base button utility files.
- Added root `CLAUDE.md` and `AGENTS.md` from the prompt pack.
- Added `.env.local` and `.env.local.example` placeholders for Supabase and integration secrets.
- Replaced the default starter page with a QuoteBase foundation console.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

Next likely step:

- Fill Supabase values in `.env.local`, then start Day 1: schema, RLS, magic-link auth, allowlist, and dashboard.

## 2026-05-30 - UI Polish Pass

- Restyled the foundation console with a smoother Mac-like visual language.
- Added translucent panels, softer shadows, rounded status chips, and cleaner information hierarchy.
- Kept the page as an operational project console rather than a marketing landing page.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

Next likely step:

- Fill Supabase values in `.env.local`, then start Day 1 schema/auth work.

## 2026-05-30 - Day 1 Auth Foundation

- Added official Supabase packages: `@supabase/supabase-js` and `@supabase/ssr`.
- Added Day 1 migration for organizations, users, user invites, feature flags, indexes, helper functions, seed data, and RLS policies.
- Added Supabase browser/server client helpers and middleware session refresh.
- Added six-email Western Materials allowlist.
- Added magic-link login page at `/login`.
- Added Supabase callback route at `/auth/callback`.
- Added authenticated dashboard shell at `/dashboard`.
- Linked the foundation console to login and dashboard.
- Added `NEXT_PUBLIC_SITE_URL=http://localhost:3006` to local env templates.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

Blocked until credentials:

- Supabase project URL and anon key are still needed in `.env.local`.
- The migration still needs to be run in Supabase.
- Actual magic-link login cannot be tested until Supabase is configured.

## 2026-05-30 - Local Supabase Setup

- Installed Docker Desktop.
- Installed Supabase CLI as a project dev dependency.
- Initialized local Supabase config in `supabase/config.toml`.
- Moved local Supabase ports to `55020-55029` because Windows reserved the default `5432x` range.
- Switched local database to Postgres 15 for stable local startup.
- Started local Supabase:
  - API: `http://127.0.0.1:55021`
  - Studio: `http://127.0.0.1:55023`
  - Mailpit: `http://127.0.0.1:55024`
  - DB: `postgresql://postgres:postgres@127.0.0.1:55022/postgres`
- Updated `.env.local` with local Supabase URL and local generated keys.
- Added auth trigger to create `public.users` from `public.user_invites` when a Supabase Auth user is created.
- Ran `supabase db reset`; migration applied successfully.
- Verified seed data: 1 organization, 6 invited users, 17 feature flags.
- Verified local magic-link flow by requesting login for `john@westernmaterials.net`; Mailpit captured the email and the trigger created John as admin.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

Next likely step:

- Open Mailpit, click the captured magic link for John, and verify `/dashboard` displays John as Admin.

## 2026-05-30 - Fix Login Runtime Error

- Fixed browser runtime error on `/login`: `__webpack_modules__[moduleId] is not a function`.
- Root cause was a version mismatch from the initial temporary scaffold: app was pinned to Next.js 15, but React/React DOM were still on `19.2.4` from the Next.js 16 scaffold.
- Pinned `react` and `react-dom` to `19.1.0`.
- Cleared `.next` cache and restarted the dev server.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Verified `/login` returns HTTP 200.

## 2026-05-30 - Add Local Test Admin

- Added `rinsad@gmail.com` to the app login allowlist.
- Added `rinsad@gmail.com` to local Supabase `user_invites` seed as Admin.
- Updated login page allowed-user list to show the test admin.
- Ran `supabase db reset` to apply the local seed update.
- Verified the local invite table now has 7 users.
- Verified `npm run lint` passes.

## 2026-05-30 - Day 1 Verification UI

- Enhanced `/dashboard` to show Supabase/session status, tenant slug, and visible feature flags.
- Added admin-only `/admin/system-check`.
- Added server-only service-role client for admin setup counts.
- Added system checks for Supabase config, active session, admin authorization, feature flag visibility, and invite-table RLS probe.
- Added admin counts for organizations, invited users, app users, and feature flags.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-30 - Local Dev Login Shortcut

- Added a local-only dev login button: `Continue as Rinsad`.
- The shortcut only runs when Supabase points to localhost/127.0.0.1 and `NODE_ENV` is not production.
- It still uses Supabase Auth by generating and verifying a magic-link token server-side, but skips manually opening Mailpit.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Restarted dev server and verified `/login` shows the dev login button.

## 2026-05-30 - Fix Dev Login OTP Verification

- Fixed local dev login error: `Only the token_hash and type should be provided`.
- Updated `verifyOtp` call to pass only `type` and `token_hash`.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Restarted dev server and verified `/login` still shows `Continue as Rinsad`.

## 2026-05-30 - Replace Dev Login Token Flow

- Replaced the token-hash dev login with a local-only password-backed Supabase Auth flow.
- The shortcut creates or updates `rinsad@gmail.com` in local Supabase Auth, ensures the matching `public.users` row exists, then signs in with `signInWithPassword`.
- This avoids repeated local errors from expired/invalid magic-link token hashes after database resets.
- Guard remains local-only: disabled in production and unavailable unless Supabase URL points to localhost/127.0.0.1.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Restarted dev server.

## 2026-05-30 - Day 2 Core Business Schema

- Added Day 2 migration for suppliers, materials, material price history, vehicle types, yards, pricing config, sales tax rates, audit log, and distance cache.
- Enabled RLS on every new business table.
- Added org-scoped RLS read policies and role-scoped write policies for admin/account-manager paths.
- Added immutable audit log policies: users can insert/read own-org audit entries; no update/delete policy exists.
- Seeded local sample data because the official 28-plant/400-material seed pack is not present in the workspace:
  - 3 suppliers
  - 6 materials
  - 5 vehicle types
  - 2 yards
  - 1 pricing config
  - 3 tax rates
- Added `logAction()` helper.
- Added admin data helper for plant/material summaries.
- Added read-only `/admin/plants` view showing suppliers and materials grouped by plant.
- Added dashboard link to `/admin/plants`.
- Ran `supabase db reset`; migrations applied successfully.
- Verified local database counts.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-30 - Mac-Style UI Polish

- Added shared Mac-style UI utilities for app backgrounds, glass windows, toolbar controls, soft rows, chips, inputs, and links.
- Updated the landing console, login, dashboard, system check, and plants/materials screens to use the same smoother Apple-inspired visual language.
- Refreshed stale landing-page status copy so it reflects the current Day 2 build state.
- Fixed the plants page supplier separator rendering.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-30 - Mac UI Color Pass

- Added a restrained macOS-inspired color system with soft blue, mint, lavender, and amber accents.
- Updated shared UI utilities so backgrounds, toolbars, links, primary actions, cards, and icon wells no longer feel black-and-white.
- Added accent heading treatment to key product areas.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-30 - Day 3 Quote Draft Builder

- Added quote draft migration for customers, job sites, quotes, and quote items.
- Added organization-aware composite foreign keys so quote records cannot point across tenants.
- Enabled RLS on all new quote tables before seeding local data.
- Seeded local sample customers and job sites for Western Materials.
- Added pricing helper that calculates draft totals from `pricing_config`, material cost, selected quantity, and sales tax.
- Added `/quotes/new` with a Mac-style quote draft form.
- Added dashboard links into the new quote workflow.
- Applied the migration with `supabase db reset`.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Restarted the local dev server and verified `/login` returns 200 and `/quotes/new` redirects unauthenticated users to login.

## 2026-05-31 - Quote Review Screens

- Added tenant-scoped quote list at `/quotes` with totals for all, draft, pending, and approved quotes.
- Added quote detail page at `/quotes/[id]` with customer, job-site, owner, tax, line item, totals, notes, and audit timeline sections.
- Updated draft creation to redirect to the saved quote detail page.
- Added dashboard and quote-form navigation links into the quote desk.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Quote Approval Workflow

- Added server actions to submit draft quotes for approval, approve pending quotes, and reject pending quotes.
- Enforced role checks: estimators can submit drafts; admins and account managers can approve or reject.
- Re-read quotes by `organization_id`, `id`, active status, and expected status before every transition.
- Added audit log entries with before/after status values for every quote transition.
- Added status-aware controls to `/quotes/[id]`, including rejection notes.
- Verified `npm run lint` passes.
- Verified `npm run build` passes after stopping the dev server and clearing the stale `.next` cache.

## 2026-05-31 - Draft Quote Line Editing

- Added a draft-only material line editor to `/quotes/[id]`.
- Added server action to append quote items after re-reading the quote by `organization_id`, `id`, active status, and draft status.
- Recalculated quote material, trucking, fee, tax, and total values after each new line.
- Logged `quote.item_added` audit entries with before/after totals.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Draft Quote Line Removal

- Added draft-only quote item removal from `/quotes/[id]`.
- Soft-disables removed line items instead of deleting them.
- Recalculates quote totals after removal and restores the line if the quote total update cannot safely complete.
- Logs `quote.item_removed` audit entries with removed item details and before/after totals.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Draft Quote Quantity Editing

- Added draft-only quantity editing for existing quote line items.
- Recalculates line pricing and quote totals from pricing config after quantity changes.
- Restores prior line item values if the quote total update cannot safely complete.
- Logs `quote.item_quantity_updated` audit entries with before/after line and quote totals.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Quote Print View

- Added authenticated print/PDF-ready quote view at `/quotes/[id]/print`.
- Added customer-facing quote layout with customer, job-site, line item, totals, notes, and prepared-by details.
- Added browser print button and quote detail navigation link.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Customer & Job Site Desk

- Added `/customers` for tenant-scoped customer and job-site management.
- Added customer creation/upsert action with audit logging.
- Added job-site creation/upsert action that validates the selected customer belongs to the current organization.
- Added customer/job-site counts, lists, and create forms using the existing Mac-style UI.
- Added dashboard navigation to the customer desk.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Admin Pricing Configuration

- Added admin-only `/admin/pricing` for DB-backed pricing configuration.
- Added form controls for tier markup ranges, trucking rates, minimums, fees, surcharge percentage, and overhead per ton.
- Added server action with admin role enforcement, range validation, organization-scoped update, and audit logging.
- Linked pricing admin from dashboard and plants/materials admin.
- Extended pricing config normalization to include minimums and surcharge fields.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Admin Tax Rate Configuration

- Added admin-only `/admin/tax-rates` for tenant-scoped sales tax areas.
- Added create/update server action with admin role enforcement, organization-scoped reads/writes, percentage validation, and audit logging.
- Stores sales tax as a decimal while presenting percentage inputs and labels in the UI.
- Linked tax admin from dashboard, pricing admin, and plants/materials admin.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Material Price Management

- Added `/admin/material-prices` for admins and account managers to update active material costs.
- Added organization-scoped material catalog cards, current supplier cost display, and recent price history.
- Added price update action that validates role, material ownership, date, and price before updating `materials`.
- Inserts `material_price_history` for each price change and restores the prior material price if history capture fails.
- Logs `material.price_updated` audit entries and revalidates quote/material admin views.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Feature Flag Admin

- Added admin-only `/admin/feature-flags` for tenant-scoped feature toggles.
- Added audited feature flag update action with organization-scoped reads/writes and JSON config validation.
- Linked feature flag admin from dashboard and admin tool headers.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Admin User Management

- Added admin-only `/admin/users` for app users and invite allowlist management.
- Added invite upsert action using the service-role client after admin role verification.
- Added app user update action for full name, role, and active status with self-deactivation protection.
- Logs `user_invite.saved` and `user.updated` audit entries for state changes.
- Linked user management from dashboard and admin tool headers.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Quote Sent Workflow

- Added migration to expand quote statuses with sent/viewed/accepted/declined lifecycle states.
- Added `quote.sent` server action for approved quotes with admin/account-manager role checks and audit logging.
- Added quote detail controls to mark an approved quote sent with a delivery note.
- Added sent status support and sent quote count to the quote desk.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Quote Customer Response Workflow

- Added manual `quote.accepted` and `quote.declined` transitions for sent quotes.
- Added quote detail controls for admins/account managers to record acceptance or decline notes.
- Reuses organization-scoped quote transition logic and audit logging.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-05-31 - Admin Audit Log Viewer

- Added admin-only `/admin/audit-log` to inspect the latest organization-scoped audit entries.
- Shows action, target, actor, and timestamp without exposing before/after payload internals in the UI.
- Linked the audit log from dashboard and admin tool headers.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-01 - Local Migration Applied

- Applied pending Supabase migration `202605310001_quote_sent_status.sql` to the local database.
- Local quote status constraint now allows sent/viewed/accepted/declined lifecycle states.
- Did not start the Next.js dev server.

## 2026-06-01 - Vehicle Load Pricing

- Added quote item vehicle/load fields with migration `202606010001_quote_item_vehicle_loads.sql`.
- Pricing calculations now choose an active vehicle type, calculate load count, apply DB-backed material/trucking minimums, and multiply per-load fees.
- Quote creation, draft line addition, and quantity edits now store vehicle type and load count on quote items.
- Quote builder, quote detail, and print view show vehicle/load planning context.
- Applied the migration to the local Supabase database.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Yard Location Admin

- Added admin-only `/admin/yards` for dispatch origin management.
- Added yard create/update action with admin role enforcement, organization-scoped writes, coordinate validation, soft active status, and audit logging.
- Linked yard management from dashboard and admin tool headers.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Supplier Location Admin

- Added admin-only `/admin/suppliers` for supplier/plant location management.
- Added supplier create/update action with admin role enforcement, organization-scoped writes, coordinate validation, contact fields, notes, active status, and audit logging.
- Linked supplier management from dashboard, plants/materials, pricing, yards, and material-price admin views.
- Extended the plants overview to show supplier latitude/longitude readiness.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Job Site Coordinates

- Added migration `202606010002_job_site_coordinates.sql` for job-site latitude and longitude.
- Updated customer/job-site creation to validate and store delivery coordinates.
- Updated the customer desk to show coordinate readiness for job sites.
- Applied the migration to the local Supabase database.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Distance Estimate Cache

- Added a server-side distance helper that estimates mileage from stored coordinates and upserts into the `distances` cache.
- Quote creation now captures supplier and job-site coordinates when available and records route distance/duration in quote audit metadata.
- Added coordinate fields to the new-quote job-site form for new delivery sites.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Vehicle Type Admin

- Added admin-only `/admin/vehicle-types` for fleet capacity management.
- Added vehicle type create/update action with admin role enforcement, organization-scoped writes, active status, ton/CY capacity validation, and audit logging.
- Linked vehicle management from dashboard and admin pricing/location views.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Tenant-Scoped Distance Cache

- Added migration `202606010003_tenant_scope_distances.sql` to add `organization_id` to `distances`.
- Replaced global distance RLS with organization-scoped select/insert/update policies.
- Updated the distance cache helper to upsert by organization and route coordinates.
- Applied the migration to the local Supabase database.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Plant Selection Engine

- Added server-side plant recommendation helper for active suppliers carrying the same material name/unit/tier.
- Recommendation logic compares supplier route distance, nearest-yard deadhead, calculated quote totals, material subtotal, and load count.
- Quote creation now treats the selected material as a material request and saves the recommended supplier/material.
- Draft line addition now uses the same plant recommendation path.
- Audit metadata records requested material, selected supplier, route distance, deadhead distance, and selection reason.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
- Kept the Next.js dev server stopped.

## 2026-06-01 - Grouped Navigation Cleanup

- Added reusable workspace, quote, and admin navigation components.
- Replaced cluttered admin link rows with a compact grouped Admin menu.
- Grouped admin tools into Operations, Pricing, and Workspace sections.
- Updated dashboard, customer, quote, and admin headers to use the shared navigation components.
- Adjusted the Mac toolbar shell so dropdown menus are not clipped.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-01 - Google Maps Distance Integration Foundation

- Upgraded the distance helper to read fresh organization-scoped cached route distances before making new calculations.
- Added Google Maps Distance Matrix support when the `google_maps_distance_api` feature flag is enabled and `GOOGLE_MAPS_API_KEY` is configured.
- Kept the local haversine estimate as the fallback for local development or failed/missing Google Maps responses.
- Added distance source metadata (`cache`, `google_maps`, or `estimate`) to quote creation and quote item audit events.
- Added an admin system check for Google Maps Distance Matrix configuration.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-01 - Slack Quote Workflow Notifications

- Added a server-side Slack notification helper for quote status transitions.
- Gated Slack delivery behind the `slack_notifications` feature flag and `SLACK_WEBHOOK_URL`.
- Wired notifications after successful quote updates and audit log writes for submit, approve, reject, sent, accepted, and declined transitions.
- Kept notifications non-blocking so missing or failed Slack delivery does not break quote workflow actions.
- Added an admin system check for Slack notification configuration.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-02 - API Route Foundation

- Added shared API response helpers with a consistent `{ data, error, meta }` envelope.
- Added shared API validation helpers for UUIDs, quote statuses, and pagination limits.
- Added authenticated, organization-scoped `GET /api/quotes` with status filtering and pagination.
- Added authenticated, organization-scoped `GET /api/quotes/[id]` for quote detail payloads.
- Added authenticated, organization-scoped `GET /api/customers` with active filtering and pagination.
- Verified API routes return safe errors without stack traces or internal paths.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-02 - Quote Workflow API

- Extracted quote status transitions into a reusable server-side workflow helper.
- Kept role checks, organization-scoped quote re-read, optimistic status guard, audit logging, Slack notifications, and note append behavior in the shared workflow path.
- Updated quote page form actions to use the shared workflow helper without changing UI behavior.
- Added authenticated `PATCH /api/quotes/[id]/status` for submit, approve, reject, send, accept, and decline actions.
- Added safe API validation for workflow action payloads and note text.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-02 - Customer Quote Link Foundation

- Added `quote_public_links` table for secure customer-facing quote tokens.
- Enabled RLS on public quote links and scoped authenticated access by organization and role.
- Added token generation that stores only a SHA-256 token hash in the database.
- Added internal quote detail action to create customer quote links for sent/customer-response quotes.
- Added public `/q/[token]` quote view rendered server-side from a valid, unexpired token.
- Added first-view tracking with `quote.customer_viewed` audit entries and `last_viewed_at`.
- Applied the local Supabase migration successfully.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.

## 2026-06-02 - Public Quote Response Actions

- Added public token-based accept/decline actions for customer quote links.
- Added customer response note capture with a 1000-character server-side limit.
- Updated the public quote page with Accept Quote and Decline Quote controls.
- First public quote view now transitions sent quotes to viewed and writes an audit entry.
- Public responses update viewed/sent quotes to accepted or declined and append customer notes.
- Public response updates write immutable audit log entries without requiring an internal user session.
- Verified `npm run lint` passes.
- Verified `npm run build` passes.
