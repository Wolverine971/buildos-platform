---
title: BuildOS Platform - System Health Check
date: 2026-02-07
type: research
scope: full-platform
status: complete
path: thoughts/shared/research/2026-02-07_00-00-00_system-health-check.md
---

# BuildOS Platform — Full System Health Check

**Date:** February 7, 2026
**Scope:** Root config, Turborepo, Vercel, Supabase, Web App, Worker App, Shared Packages

---

## Overall Verdict

| Area | Health | Summary |
|------|--------|---------|
| Root Config (Turbo, pnpm) | **EXCELLENT** | Clean config, proper workspace setup |
| Web App (SvelteKit) | **EXCELLENT** | All deps current, build/deploy ready |
| Worker App (Node/Express) | **GOOD** | 2 fixable issues (ESLint, test export) |
| Shared Packages (5) | **EXCELLENT** | All building, no circular deps |
| Supabase | **GOOD** | RLS solid; migration naming inconsistent |
| Vercel Deployment | **EXCELLENT** | Production-ready, crons secured |

**Overall: HEALTHY — 2 blocking issues, 5 minor items**

---

## Critical / Blocking Issues

### 1. Worker: ESLint v9 Configuration Incompatibility

- **Severity:** HIGH (blocks `pnpm lint`, `pnpm check`, pre-push validation)
- **Location:** `/apps/worker/.eslintrc.js`
- **Problem:** The worker uses the legacy `.eslintrc.js` format, but ESLint v9.36.0 requires the new `eslint.config.js` flat config format.
- **Impact:** `pnpm lint` and `pnpm check` fail in the worker. Pre-push validation will also fail.
- **Fix:** Migrate `.eslintrc.js` to `eslint.config.js` using ESLint v9 flat config format.

### 2. Worker: Missing Test Export (`getOutputStatus`)

- **Severity:** MEDIUM (2 test failures, 1.3% of suite)
- **Location:** `apps/worker/tests/ontologyBriefDataLoader.test.ts`
- **Problem:** Tests import `getOutputStatus` from `ontologyBriefDataLoader.ts`, but that function is not exported.
- **Impact:** 2 of 150 worker tests fail (148 pass).
- **Fix:** Either export `getOutputStatus` from the source file or remove the orphaned tests.

---

## Minor / Non-Blocking Issues

### 3. Supabase: Migration Naming Inconsistency

- **Severity:** MEDIUM (risk of wrong execution order)
- **Location:** `/supabase/migrations/` (60 files) and `/apps/web/supabase/migrations/` (29 files)
- **Problem:** Three different naming formats are used:
  - `YYYYMMDDHHMMMSS_desc.sql` (correct, 11 files)
  - `YYYYMMDD_HHMMMSS_desc.sql` (underscore-separated time, 6 files)
  - `YYYYMMDD_desc.sql` or `YYYYMMDD_NNN_desc.sql` (no time, 43+ files)
- **Risk:** Lexicographic sort doesn't match chronological order. Some 2025-dated migrations sort after 2026-dated ones.
- **Also:** One future-dated migration: `20260419_allow_nullable_milestone_due_at.sql` (April 19, 2026).
- **Recommendation:** Verify actual execution order in Supabase dashboard. Standardize naming going forward.

### 4. Supabase: Split Migration Locations

- **Severity:** LOW (architectural clarity)
- **Problem:** 60 migrations at repo root + 29 in `/apps/web/supabase/`. No documentation explains the split.
- **Recommendation:** Document which set runs where and why.

### 5. Worker: Unscheduled Cron Endpoint

- **Severity:** LOW
- **Location:** `/apps/web/src/routes/api/cron/renew-webhooks/`
- **Problem:** Endpoint exists and is implemented but is NOT listed in `vercel.json` crons array.
- **Recommendation:** Either add it to `vercel.json` or remove the dead endpoint.

### 6. smart-llm Package: No Tests

- **Severity:** LOW
- **Location:** `/packages/smart-llm/`
- **Problem:** Test scripts (`test`, `test:run`) are configured in package.json but no test files exist.
- **Recommendation:** Either add tests or remove the test scripts.

### 7. turbo.json: Minor Env Var Gap

- **Severity:** VERY LOW
- **Problem:** 7 of 59 `globalEnv` vars are not in the `build` task's `env` array (`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_REGION`, `ANALYZE`, `TWILIO_*`, polling vars).
- **Assessment:** Likely intentional. No action required unless caching issues arise.

---

## Detailed Findings by Area

---

### 1. Root Configuration (Turborepo + pnpm)

**Status: EXCELLENT**

| File | Status | Notes |
|------|--------|-------|
| `package.json` | Clean | pnpm@9.15.2, Node >=20, 13 security overrides |
| `turbo.json` | Clean | 9 tasks, proper deps/caching, 59 globalEnv vars |
| `pnpm-workspace.yaml` | Clean | `apps/*` and `packages/*` correctly declared |
| `pnpm-lock.yaml` | Present | 362 KB, committed (good) |
| `vercel.json` | Clean | Correct build cmd, 2 crons, optimal cache headers |
| `.gitignore` | Comprehensive | node_modules, .env, build artifacts, IDE files |
| `.env.example` | Excellent | 136 lines, well-organized with examples |

**Turbo Task Pipeline:**

| Task | Depends On | Cache | Notes |
|------|-----------|-------|-------|
| `build` | `^build` | ON | Outputs: .vercel, .svelte-kit, dist |
| `dev` | none | OFF | Correct |
| `test` | `^build` | OFF | Correct |
| `test:run` | `^build` | ON | Reasonable |
| `lint` | none | ON | Good |
| `lint:fix` | none | OFF | Correct |
| `typecheck` | `^build` | ON | Good |
| `clean` | none | OFF | Correct |
| `pre-push` | typecheck, test, lint, build | OFF | Correct |

**Security Patches in Root package.json:** 13 pnpm overrides for CVE remediation — excellent practice.

---

### 2. Web App (SvelteKit on Vercel)

**Status: EXCELLENT**

**Key Dependencies (all current):**

| Package | Version | Status |
|---------|---------|--------|
| SvelteKit | ^2.31.0 | Current |
| Svelte 5 | ^5.37.2 | Current (runes syntax) |
| Vite | ^7.3.0 | Current |
| TypeScript | ^5.9.2 | Strict mode |
| @supabase/supabase-js | ^2.89.0 | Current |
| @sveltejs/adapter-vercel | ^5.8.0 | Current |
| Vitest | ^3.2.4 | Current |
| Stripe | ^18.4.0 | Current |
| OpenAI | ^5.11.0 | Current |

**Build Configuration:**
- Vite with gzip + brotli compression
- Smart vendor chunk splitting (ui-vendor, utils, ai-vendor, google-vendor, stripe-vendor)
- CSS code splitting enabled
- Source maps in dev only
- ES2020 target

**Vercel Deployment:**
- Adapter: `@sveltejs/adapter-vercel` with `nodejs22.x` runtime
- Response streaming enabled
- 298 API routes + page routes compiled
- Immutable asset caching (1 year)
- Prerendering for marketing pages (pricing, privacy, terms, etc.)

**Cron Jobs (secured with PRIVATE_CRON_SECRET + timing-safe comparison):**

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| 0 9 * * * | `/api/cron/dunning` | Stripe dunning |
| 0 10 * * * | `/api/cron/trial-reminders` | Trial expiration |

**Project Structure:**
- 384 Svelte components
- 257 service files
- 83 routes
- 24 stores
- Proper `(app)` / `(public)` route grouping

**No issues found.**

---

### 3. Worker App (Node.js on Railway)

**Status: GOOD (2 issues)**

**Key Dependencies (all current):**

| Package | Version | Status |
|---------|---------|--------|
| Express | ^4.18.2 | Current (4.21.2 resolved) |
| node-cron | ^3.0.3 | Current |
| @supabase/supabase-js | ^2.89.0 | Current |
| nodemailer | ^7.0.11 | Current |
| web-push | ^3.6.7 | Current |
| TypeScript | ^5.9.2 | Strict mode |

**Queue System:**
- Custom Supabase-based queue (no Redis/BullMQ dependency)
- Atomic job claiming via `claim_pending_jobs` RPC
- Deduplication support
- Progress tracking
- 13 registered job processors:
  1. `generate_daily_brief`
  2. `generate_brief_email`
  3. `generate_phases`
  4. `onboarding_analysis`
  5. `send_notification`
  6. `schedule_daily_sms`
  7. `send_sms`
  8. `classify_chat_session`
  9. `process_onto_braindump`
  10. `transcribe_voice_note`
  11. `buildos_homework`
  12. `buildos_tree_agent`
  13. `build_project_context_snapshot`

**Railway Deployment:**
- Builder: nixpacks (Node.js 20)
- Health check: `/health` endpoint
- Restart policy: ON_FAILURE (max 3 retries)
- Build: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@buildos/worker`

**Testing:** 148/150 passing (98.7%) — 2 failures from missing export (see Issue #2).

**Issues:** See Critical Issues #1 (ESLint) and #2 (test export) above.

---

### 4. Shared Packages

**Status: EXCELLENT**

All 5 packages build successfully, have no circular dependencies, and use consistent tooling.

| Package | Version | Deps | Tests | Build | Notes |
|---------|---------|------|-------|-------|-------|
| `@buildos/shared-types` | 1.0.0 | 0 prod | N/A | OK | Pure types, 533 KB .d.ts |
| `@buildos/shared-utils` | 0.1.0 | 3 prod | 1 passing | OK | Metrics + structured logging |
| `@buildos/smart-llm` | 0.1.0 | 2 prod | **None** | OK | LLM service abstraction (10 modules) |
| `@buildos/supabase-client` | 1.0.0 | 3 prod | N/A | OK | Thin typed wrapper, excellent docs |
| `@buildos/twilio-service` | 1.0.0 | 3 prod | 6 passing | OK | SMS sending + scheduling |

**Dependency Graph (no cycles):**
```
shared-types (root — no deps)
  ^--- supabase-client
  ^--- smart-llm
  ^--- shared-utils ---> supabase-client
  ^--- twilio-service --> supabase-client
```

**Consistency across packages:**

| Tool | Version | Consistent? |
|------|---------|-------------|
| TypeScript | ^5.9.2 | Yes |
| tsup | ^8.3.5 | Yes |
| vitest | ^3.2.4 | Yes |
| @types/node | ^20.11.10 | Yes |

All packages use `workspace:*` protocol for internal deps. All export dual ESM/CJS with types.

---

### 5. Supabase

**Status: GOOD (naming issues)**

**What's Working Well:**
- Row Level Security (RLS) extensively implemented with 3-tier policy pattern (user, service_role, admin)
- Database types auto-generated (340 KB `database.types.ts`, updated Feb 6)
- Type generation script at `scripts/generate-types.ts` uses `supabase gen types`
- Client library (`@buildos/supabase-client`) provides typed clients for browser, server, and service role
- Web app integration clean (`src/lib/supabase/index.ts` + `admin.ts`)

**Migration Stats:**
- 89 total migrations (60 root + 29 web app)
- Inconsistent naming (see Issue #3)
- No `seed.sql` for development fixtures
- No edge functions (all logic in Node.js worker — intentional)

**Config:**
- `config.toml` at `/apps/web/supabase/config.toml` (PostgreSQL 15, proper ports)
- No root `config.toml` (migrations-only directory)

---

### 6. Vercel Deployment

**Status: EXCELLENT**

- Adapter: `@sveltejs/adapter-vercel@^5.8.0` with `nodejs22.x`
- Build: `pnpm install --frozen-lockfile && turbo build --force --filter=@buildos/web...`
- Response streaming enabled
- 1,603 route definitions in output config
- Crons secured with bearer tokens + timing-safe comparison
- Cache headers: 1-year immutable for static assets (.js, .css, .webp, .mp4)
- No edge function misconfigurations detected

---

## Recommended Action Items

### Do Now (Before Next Deploy)

1. **Fix Worker ESLint config** — Migrate `apps/worker/.eslintrc.js` to `eslint.config.js` (flat config for ESLint v9)
2. **Fix Worker test export** — Export `getOutputStatus` from `ontologyBriefDataLoader.ts` or remove orphaned tests

### Do Soon (This Sprint)

3. **Standardize migration naming** — Use `YYYYMMDDHHMMMSS_description.sql` format going forward
4. **Resolve unused cron endpoint** — Add `/api/cron/renew-webhooks` to `vercel.json` or remove it
5. **Document migration split** — Explain why migrations exist in two locations (root vs web app)

### Nice to Have

6. Add tests to `@buildos/smart-llm` package
7. Create `supabase/seed.sql` for development fixtures
8. Add root `supabase/config.toml` for local migration management
9. Consider Vercel skew protection for deployment consistency
10. Periodically run `pnpm build:analyze` to monitor bundle size trends

---

## What's Working Really Well

- **Dependency hygiene** — All packages current, 13 CVE security overrides in place
- **TypeScript strictness** — Strict mode everywhere, `noUncheckedIndexedAccess` in web app
- **Build optimization** — Gzip + Brotli compression, smart vendor chunking, immutable caching
- **Security** — RLS policies, cron auth with timing-safe comparison, proper env var separation
- **Monorepo discipline** — Consistent tooling versions, proper workspace protocol, clean dependency graph
- **Queue system** — Custom Supabase-based queue avoids Redis dependency while maintaining atomicity
- **Deployment** — Both apps (Vercel + Railway) properly configured and production-ready
