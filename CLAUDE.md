CLAUDE.md — Western Materials Quoting App
This file is read by Claude Code at the start of every session. Treat it as the source of truth for project context, conventions, and constraints.
Project Overview
Name: Western Materials Quoting App (Phase 1 MVP) Owner: John Montazeri, Western Materials (westernmaterials.net) Strategic destination: This codebase becomes QuoteBase AI, a multi-tenant B2B SaaS for SMB distributors. WM is Organization #1.
What this app does:
Produces customer quotes for construction materials (sand, gravel, base, recycled materials)
Calculates material cost + trucking cost + fees + taxes using a four-tier pricing framework
Routes quotes through admin approval before sending to customers
Pushes approved quotes to Quoter (ScalePad) for delivery
Audits every action for accountability and future AI training
What this app is NOT:
A generic quoting tool. The pricing engine encodes 40 years of John's domain expertise.
A single-tenant app. Multi-tenant from day 1, even though only WM uses it for the first 6+ months.
A throwaway internal tool. Architecture decisions are made with QuoteBase AI in mind.
Architectural Principles (Non-Negotiable)
Multi-tenant from day 1. Every business table has organization_id. Every query filters by it. RLS enforces isolation.
Configuration over code. Business rules (tier markups, minimums, fees, taxes) live in DB tables, not source code.
Industry-agnostic primitives. Use "Supplier" not "Pit", "Material" not "Sand/Gravel", "Vehicle Type" not "Truck Model".
Module boundaries from day 1. Pricing, Quote, Customer, Approval, Audit, FeatureFlag are independent modules.
Audit log on everything. Every state-changing action logs to audit_log table. No exceptions.
Feature toggle gates. Check isFeatureEnabled() before activating gated functionality.
API-first internally. Even when there's only a web client, write API routes as if mobile/voice clients will arrive later.
Never trust client-side claims. Always re-check role and organization_id server-side.
Tech Stack
Frontend: Next.js 15 (App Router) + TypeScript (strict mode) + Tailwind CSS v4 + shadcn/ui
Backend: Next.js route handlers + Supabase (Postgres 15 + RLS + Auth)
State: React Server Components primary; Zustand for client stores when necessary
Forms: React Hook Form + Zod
Workflows: n8n self-hosted (Pipedrive sync, Quoter push, Slack, backups, weekly summary)
External: Google Maps Distance Matrix, Pipedrive API, Quoter API, Slack webhooks
Hosting: Vercel (app) + Supabase Cloud (DB) + VPS (n8n)
File Structure
/app
  /(auth)                  # Magic-link login
  /(dashboard)             # Authenticated routes
    /quotes                # List, create, detail, edit
    /customers             # List, detail, create
    /suppliers             # Plant list, plant detail, material editor
    /approvals             # Pending approval queue
    /admin                 # Admin-only: users, feature flags, pricing config, audit log
  /api
    /quotes                # Quote CRUD + actions (submit, approve, reject, send)
    /customers             # Customer CRUD + search
    /materials             # Material price updates
    /admin                 # Feature flags, users, audit log queries
    /webhooks              # n8n callbacks
/lib
  /pricing                 # Pricing engine (calculateQuote, selectOptimalPlant, applyMinimums)
  /supabase                # Client setup, RLS helpers
  /audit                   # logAction helper
  /features                # isFeatureEnabled helper
  /integrations            # google-maps, pipedrive, quoter, slack clients
/types                     # Shared TypeScript types
/docs
  /build-log.md            # John's daily build log
  /decisions               # Architectural decision records
Conventions
Naming
Variables/functions: camelCase
Types/interfaces: PascalCase
Files: kebab-case.ts (quote-calculator.ts)
Components: PascalCase.tsx (QuoteBuilder.tsx)
DB tables: snake_case plural (quote_line_items)
DB columns: snake_case (created_at, organization_id)
TypeScript
Strict mode enabled — no implicit any
Prefer type for unions/utilities, interface for object shapes
Zod schemas live next to the types they validate
All API route handlers validate inputs with Zod before processing
Database
Every business table has: id, organization_id, created_at, updated_at
Foreign keys explicit, never inferred
RLS enabled on every business table before any data inserted
Migrations versioned in /supabase/migrations
API Routes
File pattern: /api/[resource]/[id]/[action]/route.ts
Always verify session via supabase.auth.getUser() before processing
Always check role + organization_id for the action
Always call logAction() on state-changing operations
Return typed responses; never return raw DB rows without filtering
Components
Server Components by default; 'use client' only when needed (forms, interactivity)
Co-locate small components with the page that uses them
Shared components in /components
shadcn/ui components installed via CLI, not copy-pasted
Workflow: How Claude Code Should Operate
Plan Mode is Mandatory For:
Any change touching more than one file
Any schema change (tables, columns, RLS policies)
Any change to auth, authorization, or feature flags
Any integration with an external API
Any refactor moving code between files
Type /plan first, get John's approval, then build.
Before Every Multi-File Change
Read the relevant existing files (don't assume)
Identify all files that will need to change
State the plan in 3-5 bullet points
Wait for approval
After Every Meaningful Change
Run the relevant tests (if they exist)
Verify the build still compiles: npm run build
Commit with a descriptive message
Mention if anything else should change as a follow-up
When Stuck or Uncertain
Ask John. Never invent business rules. Never assume domain knowledge.
If a price, tier, fee, or threshold isn't documented in the seed data or pricing_config — ask.
If multiple architectural paths exist — list them with trade-offs, don't just pick.
Always Do (Hard Rules)
Filter every query by organization_id. Even read queries. RLS is the safety net, not the primary protection.
Call logAction() on every state-changing operation. Audit log is the foundation of QuoteBase AI's trust model.
Check isFeatureEnabled() before activating gated features. Don't hardcode feature behavior.
Validate inputs with Zod at API route boundaries. Never trust the client.
Use parameterized queries / Supabase client builders. Never concatenate strings into SQL.
Generate readable error messages. Never expose stack traces to users.
Use shadcn/ui components. Don't reinvent dropdowns, modals, forms.
Cache Google Maps distance results in the distances table.
Never Do (Hard Rules)
Never modify the audit_log table with UPDATE or DELETE. It's immutable.
Never store passwords or credit card numbers. Magic-link auth only. Stripe handles payments later.
Never inline business rules (prices, tiers, fees, taxes). Always read from DB.
Never assume domain knowledge. Ask John for pricing rules, customer behavior, edge cases.
Never write a query without organization_id in the WHERE clause (even with RLS).
Never deploy to production without running migrations on staging first.
Never delete data. Soft-delete with is_active = false.
Domain Vocabulary
Organization: A tenant. WM is Org #1.
User: A person with login access in one organization. Roles: admin, account_manager, estimator.
Supplier: A plant or pit where materials are sourced. (Industry-agnostic.)
Material: A product available at a supplier. Tier R1-R4.
Tier: R1 = commodity, R2 = standard, R3 = specialty, R4 = premium. Markups in $/unit, not %.
Yard: WM truck parking location (Acton or Sun Valley).
Quote: A priced offer to a customer. Statuses: draft → pending_approval → approved → sent → viewed → accepted/declined/expired.
Line Item: One material + quantity + delivery destination within a quote.
Deadhead: Empty miles from yard to supplier (no revenue, but real cost).
Three-Zone Plant Selection: 1 load = minimize round-trip; 2-3 loads = weighted; 4+ loads = cheapest material.
User Roster (Org #1)
Permission rule: Everyone can edit any quote in draft or pending_approval status. Audit log tracks edits. Once approved, only admins edit. Once sent, immutable (create revision instead).
Approval rule: Admins (John or Judd) approve. Self-approval allowed but flagged in audit log.
Phase 1 Scope (3-4 Weeks)
In scope:
Customer search + create (synced with Pipedrive)
Quote builder with pricing engine
Three-zone plant selection
Approval queue + Slack notification
Vendor price management (inline edit + CSV upload)
Quoter push on approval (or PDF fallback)
Feature toggle admin UI
Audit log (table + minimal admin view)
Out of scope (cut first if running hot):
Mobile optimization
Advanced reporting dashboards
Quote PDF custom branding polish
Bulk CSV upload UI (inline edit acceptable)
Out of scope (Phase 2):
Internal quoting that replaces Quoter (Phase 2A)
Internal CRM that replaces Pipedrive (Phase 2B)
Email/SMS automation that replaces ActiveCampaign (Phase 2C)
AI features
When You Disagree With Me
If I ask for something that contradicts these principles — push back. Examples:
"Let's just hardcode this price for now" → No, add to pricing_config.
"We can skip the audit log for this one action" → No, log it.
"We don't need RLS, we're single-tenant" → We're not single-tenant; we're WM-only-for-now.
State the conflict clearly, propose the better path, then let me decide.
Reference Documents (Living Outside This File)
PRD: What we're building and why (read for product context)
SRS: Technical architecture deep-dive (read for data model and module interfaces)
Sprint Plan: Day-by-day execution (read for what's next)
Seed Data SQL: Run this on Day 1 to populate DB
AGENTS.md: Code review checklists (for Codex review pattern)
This file is the source of truth. If you find yourself doing something not covered here, ask first.
