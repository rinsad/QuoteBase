# QuoteBase3 — Product Requirements Document (PRD)
*v1.0 · June 2026 · Owner: John · Builders: founder + junior dev (Codex/Claude Code) + development team (foundation & build-out), senior review on tenancy/auth/payments*

## 1. Problem
B2B distributors/resellers quote off messy supplier price sheets (slow, error-prone, stale costs) and almost never follow up on sent quotes. Evidence from customer zero (Western Materials): Quoter holds 19,896 quotes with every item at a $1.00 placeholder (no costs/margins anywhere); Pipedrive shows **$4,524,014 stalled in "Quote Sent"** with $0 in the follow-up stages and threads un-replied for 145 days. Three paid tools, none sharing data.

## 2. Customer & wedge
Owner-operators and inside sales at SMB distributors/resellers (~$1M–$25M revenue) who buy from suppliers, mark up, resell. Anti-persona: ERP shops, manufacturers selling direct, B2C. Horizontal across distribution verticals; never construction-only.

## 3. Product thesis
One AI-native platform for the whole motion: **supplier price sheet → live marked-up catalog → quote in minutes → AI follow-up until answered → won.** Tool-first architecture so the GUI, internal agents, the chat assistant, and (later) external agents via MCP all call the same capabilities through one safety gate.

## 4. Goals & success metrics (MVP pilot)
- Activation: ≥55% of new accounts import a supplier sheet AND send ≥1 quote within 7 days
- Time to first quote: <5 min from sheet upload (happy path <60s to catalog)
- Follow-up coverage: ~100% of sent quotes get ≥1 follow-up (baseline ~0%)
- Pilot: 5–10 design-partner distributors; measurable win-rate lift vs their baseline
- North star: MRR (90-day target set by John)

## 5. MVP scope (Phase 1)
**P0 — security & foundation hardening (immediate)**
- Remove public email/role list from login page; verify developer-shortcut auth bypass disabled in production
- De-hardcode Western Materials branding → tenant settings data

**P1 — core product**
1. **Supplier price book**: CSV/Excel upload → column mapping (remembered per supplier) → versioned catalog (sku, desc, uom, cost) → markup rules (global/category/item) → computed sell price + margin. Old quotes keep their version's costs.
2. **Quote builder**: multi-line items from catalog search, live margin per line + total, margin-floor warning (22% default, tenant setting), short quote numbers (Q-1042), human-fast happy path; overrides behind "Advanced pricing" disclosure. Keep the v1 build's pricing engine (tax areas, trucking/route logic, minimums) behind it.
3. **Hosted quote page**: customer view link, open/view tracking, accept/decline, e-sign (rented), Stripe payment on acceptance.
4. **Pipeline**: kanban Draft → Sent → Follow-up → Won/Lost (drag-drop). Won/Lost first-class so win rate computes.
5. **CRM-lite**: companies, contacts, deals; CSV lead import + web-form webhook capture.
6. **AI follow-up agent**: scheduler finds open quotes past followup_date → drafts context-aware message (tone escalation d2 friendly / d5 urgent / d10 final) → approval queue (one-tap) → send email/SMS → stop on reply/status change. Auto-send OFF in MVP. Big-quote threshold escalates to owner instead of automating.
7. **Dashboard**: 6 money KPIs (Quoted/Open/Won/Lost/Win rate/Follow-ups due), Hot Quotes (heat score from engagement events), Big Quotes, "Ask QuoteBase" assistant box.
8. **Conversational assistant**: chat over the tool layer; read tools free, write/confirm tools surface confirmation.
9. **Hermes onboarding (minimal)**: guided first-run orchestrating import → markup → contacts → first quote.
10. **Tool layer + safety gate + audit log**: every capability a classified tool (read/write/confirm); gate enforces approval + logging for all callers.

## 6. Explicitly deferred
PDF/OCR sheet parsing; real-time supplier feeds; templates/bundles/optional items; multi-currency/complex tax; recurring quotes; contracts; mailbox OAuth sync + email client UI (Phase 2); SMS-in-timeline (P2); Apollo/Clay/LinkedIn/ad-form connectors (P2); sequences builder UI (P2 — MVP ships the follow-up cadence, not the visual builder); inbound voice receptionist (P2 add-on); cold email subsystem + outbound dialer (P3, isolated); MCP server (P3); migration importer for Quoter/Pipedrive (P2 — dogfood path).

## 7. Non-negotiables
- tenant_id + Postgres RLS on every table from day one
- Warm and cold email never share infrastructure
- Agent sends default to human approval; autopilot opt-in per sequence
- Every outbound checks suppressions; every tool call lands in audit_log
- Branding/config is tenant data, never code

## 8. Acceptance criteria (samples)
- Upload the Western Materials supplier CSV → catalog renders with correct cost/sell/margin in <60s
- Build + send a 5-line quote in <5 min; customer link tracks open; accept → Stripe payment intent succeeds (test mode)
- Mark quote Sent, no reply: day-3 draft appears in approval queue; approving sends; customer reply stops cadence
- A second tenant cannot read tenant A's rows via any endpoint (RLS test required in CI)
