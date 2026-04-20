<!-- apps/web/docs/technical/performance/VERCEL_OPTIMIZATIONS_2026-04-18.md -->

# Vercel Optimizations — 2026-04-18

Tracking doc for cost + efficiency optimizations on the Vercel deployment of `@buildos/web`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped

---

## 1. High-impact (cost)

### 1.1 Per-route function config (`maxDuration` + `memory`)

- [x] Set adapter-level defaults in `apps/web/svelte.config.js` (`memory: 512`, `maxDuration: 10`). Every function inherits these unless it sets its own `export const config`.
- [x] Override on streaming / heavy / cron routes:
    - `api/agent/v2/stream/+server.ts` → `maxDuration: 300, memory: 1024` (SSE)
    - `api/agentic-chat/agent-message/+server.ts` → `maxDuration: 60, memory: 1024`
    - `api/transcribe/+server.ts` → `maxDuration: 120, memory: 1024`
    - `api/onto/projects/[id]/members/me/role-profile/+server.ts` → `maxDuration: 60, memory: 1024`
    - `api/onto/projects/[id]/members/me/role-profile/alternatives/+server.ts` → `maxDuration: 60, memory: 1024`
    - `api/onto/goals/[id]/reverse/+server.ts` → `maxDuration: 60, memory: 1024`
    - `api/cron/dunning/+server.ts` → `maxDuration: 60`
    - `api/cron/trial-reminders/+server.ts` → `maxDuration: 60`
    - `api/cron/billing-ops-monitoring/+server.ts` → `maxDuration: 60`
    - `api/cron/welcome-sequence/+server.ts` → `maxDuration: 60`
    - `api/cron/security-events-retention/+server.ts` → `maxDuration: 60`
- [ ] After first deploy: watch the Vercel "Functions" tab for any 504 (timeout) or OOM. Bump the offending route up.
- [ ] Document the convention in `apps/web/docs/technical/architecture/` so future routes follow it.

**Why:** Vercel bills GB-Hours = `memory × duration × invocations`. Default Pro is 1024MB / 300s. Halving both halves the cost ceiling per invocation. Even when a request finishes in 200ms, the _allocation_ affects scheduling.

**Approach:** Setting at the adapter level avoids touching 325 route files. Routes self-select higher limits via `export const config`.

### 1.2 ISR for marketing + content pages

- [ ] Add `export const config = { isr: { expiration: 3600 } }` to:
    - `apps/web/src/routes/blogs/[slug]/+page.server.ts` (or wherever blog detail loads)
    - `apps/web/src/routes/docs/...` dynamic doc pages
    - any other content-driven public route not already in `prerender.entries`
- [ ] Verify which pages are currently SSR'd on every hit using Vercel's "Functions" tab.

**Why:** Marketing pages don't need to render per request. ISR caches at the edge, refreshes in the background. Removes function invocations entirely for crawler / repeat traffic.

### 1.3 Static asset optimization

- [x] Audited references. Moved 12MB of unused brand source files out of `/static` → `apps/web/brand-source/`:
    - `brain-bolt-big.png` (1.3MB) — unused in src
    - `BuildOS.png` (1.4MB) — unused in src
    - `dj-wayne-profile.jpg` (1.9MB) — unused (WebP variant already in use)
    - `brain-bolt-icon.png` (236KB) — unused in src
    - `brain-bolts/` (3.2MB) — Midjourney source files, unused
    - `old-icons/` (3.9MB) — legacy, unused
    - `brain-bolt 120 x 120.png` — unused
- [x] Shrunk `brain-bolt.png` from 512×446 (250KB) to 256×? (75KB). Original preserved as `brain-bolt-original.png`.
- [x] Generated `brain-bolt.webp` (11KB) using `cwebp -q 85`.
- [x] Updated 16 Svelte files to reference `/brain-bolt.webp` instead of `/brain-bolt.png`:
    - Navigation, AgentChatHeader, AnalyticsDashboard
    - 7 ontology edit modals (Document, Project, Plan, Task, Risk, Milestone, Goal)
    - 3 auth pages (reset-password, forgot-password, gmail-callback)
    - 3 marketing routes (beta, synesthetic-texture, road-map)
- [x] Kept `.png` where platform-required:
    - `IOSSplashScreens.svelte` — iOS `apple-touch-startup-image` requires PNG
    - Email templates — email clients don't consistently support WebP (use `s-brain-bolt.png`)
    - Stripe invoice config — server-side

**Per-visit savings:** 250KB → 11KB = **239KB** (96% reduction) on pages that render the logo. Authenticated users see this on every page via Navigation.

#### Remaining static assets to consider

| Dir / file            | Size  | Status                           |
| --------------------- | ----- | -------------------------------- |
| `AppImages/`          | 7.2MB | PWA/app icons — mostly required  |
| `onboarding-assets/`  | 5.1MB | In use — candidate for WebP pass |
| `textures/`           | 4.3MB | In use — candidate for WebP pass |
| `mountain-moving.mp4` | 652KB | Confirm if needed; consider lazy |

- [ ] WebP pass for `onboarding-assets/` (biggest remaining in-use dir)
- [ ] WebP pass for `textures/`
- [ ] Confirm `mountain-moving.mp4` is still used

**Why:** Bandwidth is metered. Big PNG/JPGs also slow LCP — bad for SEO + ad spend efficiency.

### 1.4 Cron job efficiency

Crons in `vercel.json`:

- `/api/cron/dunning` — daily 09:00
- `/api/cron/trial-reminders` — daily 10:00
- `/api/cron/billing-ops-monitoring` — daily 11:00
- `/api/cron/welcome-sequence` — hourly (720/month)
- `/api/cron/security-events-retention` — daily 04:30

- [ ] Audit each handler: short-circuit early when there's nothing to process (return 204).
- [ ] Add `maxDuration` ceilings appropriate to each cron's actual workload.
- [ ] Verify `welcome-sequence` hourly schedule is actually needed (could it be every 4h?).

---

## 2. Medium-impact

### 2.1 Edge runtime where applicable

- [ ] Identify simple, stateless API routes that could move to `runtime: 'edge'`:
    - error tracking ingestion
    - tracking pixels / analytics beacons
    - simple pass-through proxies
- [ ] Validate Supabase + auth flows still work on edge for any candidate.

**Why:** Edge functions cost less per invocation, cold-start faster, and don't count against Node GB-Hours.

### 2.2 Drop `--force` from Turborepo build

Current `vercel.json`:

```
"buildCommand": "turbo build --force --filter=@buildos/web..."
```

- [x] Remove `--force` so Turborepo cache (and Vercel build cache) actually works.
- [ ] Verify a clean build still produces correct output (next deploy).
- [ ] If remote cache isn't linked, run `turbo login && turbo link`.

**Why:** `--force` invalidates the cache every build. With a working cache, repeat builds drop from minutes to seconds → fewer build minutes consumed.

### 2.3 Bundle analysis

- [x] Ran `pnpm build:analyze`. Report at `apps/web/build/bundle-analysis.html`.
- [x] Confirmed server-only deps are NOT in client bundle: `googleapis`, `google-auth-library`, `nodemailer`, `twilio`, `stripe`, `sharp`. ✅
- [x] Confirmed heavy graph libs ARE properly lazy-loaded:
    - `@antv/g6` — `await import('@antv/g6')` in `G6Graph.svelte` ✅
    - `cytoscape` stack — `OntologyGraph` dynamically imported by `ExampleProjectGraph` (lazy on landing), `ProjectModalsHost`, and `+page.svelte` for projects list ✅
    - `@xyflow/svelte` — `SvelteFlowGraph` dynamically imported in admin ✅
    - `swagger-ui-dist` — dynamic import in `SwaggerUI.svelte`, only on `/docs/api` ✅

**Total client bundle:** 4.90 MB gzip across 239 chunks. Most is lazy per-route.

#### Remaining concerns

- [ ] **`BocJCGsD.js` common chunk (622 KB gzip)** — contains `lucide-svelte` (319 KB) + svelte runtime + `prosemirror-view` + `@tiptap/core`. Verify if this chunk is on the critical path of the landing page or dashboard via DevTools → Network. If yes:
    - Test `lucide-svelte` subpath imports (`import X from 'lucide-svelte/icons/x'`) in one high-traffic component and rebuild to see if the icon bundle shrinks. If it does, codemod all 250 files.
    - Consider lazy-loading `RichMarkdownEditor.svelte` at the modal boundary to pull TipTap/ProseMirror out of the shared chunk.
- [ ] **Dagre duplication (59 KB combined)** — `dagre@0.8.5` (via cytoscape-dagre) + `@dagrejs/dagre@1.1.8` (via @xyflow/svelte). Different upstream projects, can't dedupe without dropping one graph lib. Accept or consolidate graph libs.
- [ ] **Three graph libraries shipping** — `cytoscape`, `@antv/g6`, `@xyflow/svelte`. Each is lazy, but maintaining three is overhead. Decide whether to consolidate.

### 2.4 Fluid Compute + Skew Protection

- [ ] Enable **Fluid Compute** in Vercel project settings.
- [ ] Enable **Skew Protection** to reduce 4xx errors during deploys.
- [ ] Verify monitoring dashboards show the change.

### 2.5 Edge middleware for routing concerns

- [ ] Evaluate moving login redirects, bot/crawler short-circuits, geo, locale to edge middleware.
- [ ] Reduces Node lambda warm-ups on bot traffic.

---

## 3. Low-effort cleanups

### 3.1 Cache header audit

- [x] Confirmed `apps/web/static/` has no top-level `.js` / `.css` files, so the wildcard `immutable` rule only catches hashed Vite output. Safe as-is.

### 3.2 Remove deleted-but-uncommitted files

Per `git status`:

- [ ] Commit deletions of `apps/web/scripts/merge-comments.ts` and `apps/web/src/lib/types/postgrest.api.d.ts`.

### 3.3 Re-evaluate `@vercel/analytics` + `@vercel/speed-insights`

- [ ] Confirm both are actively used. If not, remove to shave a per-page client request.

---

## 4. Out of scope (for now)

- Migrating off Vercel
- Switching SvelteKit adapters
- Changing the Supabase region

---

## Decision log

- _2026-04-18:_ Doc created. Starting from item 1.1.
- _2026-04-18:_ Implemented 1.1 (adapter defaults + per-route overrides), 2.2 (dropped `--force`), 3.1 (cache header audit confirmed safe). `svelte-kit sync` passes. Pending verification on first production deploy.
- _2026-04-18:_ Ran bundle analysis. Server libs correctly isolated. Major graph libs (g6, cytoscape, xyflow, swagger-ui) are properly lazy-loaded. Remaining concern is `BocJCGsD.js` common chunk with 319 KB of lucide-svelte — need to verify critical path before codemod.
- _2026-04-18:_ Captured prod HAR of `build-os.com/`. Real initial transfer is **0.94 MB gzip**, not the 4.9 MB the rollup-visualizer suggested. The `BocJCGsD.js` chunk is 148 KB gzip over the wire — lucide + svelte runtime compress well together. Tree-shaking is working. Canceled lucide-svelte codemod plan.
- _2026-04-18:_ Verified third-party tracking scripts (Meta Pixel, Clarity, Ahrefs) are already deferred in `app.html` — Clarity+Ahrefs gate on first interaction or 3s; Pixel uses `requestIdleCallback`. No change needed.
- _2026-04-18:_ Shrank brain-bolt.png (250KB → 75KB) + added WebP (11KB). Updated 16 Svelte files to use `.webp`. Kept PNG for iOS splash + email templates. Moved 12MB of unused brand source files out of `/static`.
