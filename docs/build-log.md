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
