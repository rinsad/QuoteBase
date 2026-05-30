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
