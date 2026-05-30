# QuoteBase / Western Materials Project Memory

Last updated: 2026-05-30

## Current Workspace State

- Current folder: `D:\work\QuoteBase`
- Existing source material lives in `docs/` as Word documents.
- There is not yet a detected Git repo or app scaffold in this folder.
- `.env` exists with `OPENAI_API_KEY=` for future app/API configuration.
- `.gitignore` excludes `.env` and `.codex_tmp/`.

## Product Identity

- Phase 1 product: Western Materials Quoting App MVP.
- Strategic destination: QuoteBase AI, a multi-tenant B2B SaaS for SMB distributors.
- Western Materials is Organization/Tenant #1.
- Owner/domain expert: John Montazeri, Western Materials.
- Core business problem: WM creates roughly 50-80 quotes/week through Excel, Pipedrive, and Quoter. Current quote time is 20-45 minutes with inconsistent pricing. MVP goal is under 5 minutes per quote with consistent margin protection.

## Non-Negotiable Architecture

- Multi-tenant from day 1: every business table has `organization_id`; every query filters by it; Supabase RLS enforces isolation.
- Configuration over code: tier markups, minimums, fees, taxes, truck rates, and business rules live in database config tables.
- Industry-agnostic primitives: use `Supplier`, `Material`, `Vehicle Type`, not hardcoded sand/gravel/pit/truck-model language.
- Module boundaries from day 1: Pricing, Quote, Customer, Approval, Audit, FeatureFlag, and later CRM/Email/SMS must stay cleanly separated.
- Audit log on every state-changing action. Audit is immutable: no update/delete.
- API-first internally: web app is one client; routes should support future mobile, voice, and integration clients.
- Feature flags per organization gate functionality.
- Never trust client-side role/org claims; verify user, role, and organization server-side.

## Target Stack

- Frontend: Next.js 15 App Router, TypeScript strict, Tailwind CSS v4, shadcn/ui.
- State: React Server Components by default; Zustand only when client state is needed.
- Forms/validation: React Hook Form + Zod.
- Tables: TanStack Table.
- Backend: Next.js route handlers.
- Database/Auth: Supabase Postgres 15+ with RLS and Supabase Auth magic-link email.
- Storage: Supabase Storage for PDFs/profile photos.
- Workflows: self-hosted n8n.
- Hosting: Vercel app, Supabase Cloud database, VPS for n8n.
- Integrations: Google Maps Distance Matrix, Pipedrive, Quoter/ScalePad, Slack, later Postmark/Resend and Twilio.

## Users and Roles

- John: `john@westernmaterials.net`, Admin, owner/primary approver.
- Judd: `admin@westernmaterials.net`, Admin, operations manager/backup approver.
- Gloria: `estimate@westernmaterials.net`, Account Manager, senior estimator/vendor pricing.
- Kristina: `bid@westernmaterials.net`, Account Manager or Estimator, bid/project quotes.
- Claudina: `dispatch@westernmaterials.net`, Estimator-capable dispatcher.
- Carlos: `info@westernmaterials.net`, Estimator/customer service.

Role rules:

- Admins approve quotes and manage users/features/pricing config.
- Account managers can create quotes and update vendor pricing where allowed.
- Estimators create quotes.
- Everyone can edit drafts and pending approvals; once approved, only admins edit; once sent, create a revision.
- Self-approval is allowed for admins but must be flagged in audit log.

## Core Domain

- Quote statuses: `draft`, `pending_approval`, `approved`, `rejected`, `sent`, `viewed`, `accepted`, `declined`, `expired`.
- Tier framework: R1 commodity, R2 standard, R3 specialty, R4 premium.
- Markups are dollar-per-unit, not percentages.
- Trucking is hourly:
  - Floor: 115/hr, admin override only.
  - Standard: 135/hr.
  - Target: 165/hr default.
  - Premium: 195/hr.
  - Stretch: 225/hr.
- Truck capacities:
  - Super-10: 17 tons.
  - Super-Tag/Super-18: 20 tons.
  - End-Dump: 22 tons.
  - Bottom-Dump: 25 tons, excluded from initial scope per docs.
  - Transfer: 25 tons.
- Yards: Acton and Sun Valley.
- Deadhead: empty miles from nearest yard to supplier.
- Minimums:
  - Material minimum: 200 per quote.
  - Trucking minimum: 400-450 per truck.
- Fees:
  - Fuel surcharge: 79.95 per load.
  - Environmental fee: 29.95 per load.
  - Credit card surcharge: 4 percent on COD credit-card payments.
  - Sales tax by SoCal delivery city/county.

## Pricing Engine

For each line item:

1. Resolve material to all available suppliers.
2. Calculate supplier-to-delivery distance and nearest-yard deadhead.
3. Pick efficient vehicle type and number of loads.
4. Calculate trucking, material cost, fees, taxes, and margin.
5. Select plant with three-zone logic:
   - 1 load: minimize total round-trip cost including deadhead.
   - 2-3 loads: weighted optimization between material and trucking.
   - 4+ loads: prioritize cheaper material; trucking matters less per ton.
6. Apply tier markup from `pricing_config`.
7. Apply minimums and flag/route overrides.

Important: no hardcoded business values in app logic except seed/default config. Runtime logic reads from DB.

## Primary Data Model

Core tables expected:

- `organizations`
- `users`
- `feature_flags`
- `customers`
- `suppliers`
- `materials`
- `material_price_history`
- `vehicle_types`
- `yards`
- `pricing_config`
- `sales_tax_rates`
- `quotes`
- `quote_line_items`
- `audit_log`
- `distances`

Every business table needs RLS before data insertion and explicit org scoping in queries.

## API Shape

Routes follow `/api/{resource}/[id]/[action]`.

Key routes include:

- `POST /api/quotes`
- `GET /api/quotes`
- `GET/PATCH /api/quotes/[id]`
- `POST /api/quotes/[id]/submit`
- `POST /api/quotes/[id]/approve`
- `POST /api/quotes/[id]/reject`
- `POST /api/quotes/[id]/send`
- `POST /api/quotes/calculate`
- `GET/POST /api/customers`
- `GET/PATCH /api/customers/[id]`
- `GET /api/suppliers`
- `GET /api/suppliers/[id]`
- `POST /api/materials/price`
- `POST /api/materials/bulk-price-update`
- `GET/PATCH /api/admin/feature-flags`
- `GET/PATCH /api/admin/users`
- `GET /api/admin/audit-log`
- `POST /api/webhooks/n8n/*`

Every route verifies `supabase.auth.getUser()`, checks role/org server-side, validates input with Zod, and uses typed responses.

## Phase Plan

Phase 1 MVP, 3-4 weeks:

- Week 1: schema, auth, customers, vendor pricing, feature toggles, admin users.
- Week 2: pricing engine, three-zone plant selection, quote builder, approval workflow.
- Week 3: n8n/Pipedrive/Google Maps/Quoter/Slack integrations, performance/security testing.
- Days 16-20: shadow mode alongside Excel/Quoter.
- Day 21: go-live if shadow mode passes.

Phase 2:

- 2A internal quoting replaces Quoter.
- 2B internal CRM replaces Pipedrive.
- 2C email/SMS automation replaces ActiveCampaign.

Phase 3:

- QuoteBase AI SaaS, external tenants, billing, onboarding, AI features.

## Day 0 / Current Next Steps

The docs say Day 0 should produce:

- Private GitHub repo `wm-quoting-app`.
- Next.js 15 + TypeScript + Tailwind + shadcn/ui scaffold.
- Supabase project named `wm-quoting-app`.
- Supabase client SDK connected.
- `.env.local` with Supabase, Google Maps, Pipedrive, Quoter/Slack/n8n values as they become available.
- Root `CLAUDE.md` and `AGENTS.md` generated from prompt pack.
- `docs/build-log.md` and `docs/decisions/`.

This workspace currently has not been scaffolded. The logical next build step is Day 0 app/repo setup, unless the user wants to generate root `CLAUDE.md` and `AGENTS.md` first.

## Review Rules for Codex

When asked to review, lead with findings. Block on:

- Missing `organization_id` filter or RLS.
- Missing auth/role/org checks.
- Missing Zod validation.
- Missing audit log on state change.
- Hardcoded business rules.
- Secrets committed.
- SQL string concatenation.
- Unsafe HTML/eval.
- Audit log update/delete.
- Cross-tenant leakage.

## Resume Instruction

When this project resumes after shutdown, first read this file, then inspect current files and `docs/build-log.md` if present. Ask what day/task the user wants next only if it is not inferable from workspace state.

