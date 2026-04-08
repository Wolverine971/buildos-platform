<!-- apps/web/docs/technical/DEAD_WEIGHT_CLEANUP_2026-04-08.md -->

# Dead-Weight Cleanup — 2026-04-08

> Tracking doc for the apps/web dead-code audit and cleanup pass.
> Scope: web app only (apps/web). Mode: report-then-pick — user drives deletions.

## What got deleted this pass

### CSS utility files (~491 lines)

All three were `@import`-ed by `apps/web/src/app.css` but their class names had **zero** consumers across the codebase. The only "live" class name (`animation-complete`) is self-defined inside `Modal.svelte` and `dashboard.css`, so the imports were pure bloat.

| File                                                    | Lines | Status     |
| ------------------------------------------------------- | ----: | ---------- |
| `apps/web/src/lib/styles/animation-utils.css`           |   304 | 🗑 deleted |
| `apps/web/src/lib/styles/containment.css`               |    72 | 🗑 deleted |
| `apps/web/src/lib/styles/performance-optimizations.css` |   115 | 🗑 deleted |

Also removed the three `@import` lines from `apps/web/src/app.css:6-8`.

### Tailwind config trim (`apps/web/tailwind.config.js`)

| Block                                 | Why dead                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `spacing.dense-3`..`dense-20`         | Zero usage. Custom dense spacing scale that nothing references.          |
| `maxWidth.dense-7xl`                  | Zero usage.                                                              |
| `transitionTimingFunction.{ink,snap}` | Generated `ease-ink`/`ease-snap` classes — zero usage.                   |
| `backdropBlur.{xs,md,lg}`             | Only `backdrop-blur-sm` and `backdrop-blur-xl` are used. Kept those two. |

### Service file (~570 lines incl. test)

| File                                                      | Lines |
| --------------------------------------------------------- | ----: |
| `apps/web/src/lib/services/dashboardData.service.ts`      |   429 |
| `apps/web/src/lib/services/dashboardData.service.test.ts` |  ~140 |

`DashboardDataService` and its singleton `dashboardDataService` had zero importers anywhere in apps/web/src. Only the test file referenced it, and the service itself had no production callers — almost certainly an abandoned refactor.

**Total this pass:** ~1,060 lines + 5 files removed, plus dead config blocks trimmed.

## Verification done before deletion

- Greped every class name in the three CSS files across `apps/web/{src,docs}` for `class=`, `class:`, `@apply`, and bare-token usage
- Verified `animation-complete` is a marker class with self-contained rules in `Modal.svelte:633` and `dashboard.css:79` — the version in `animation-utils.css` was redundant
- Greped every `dense-*` token and the generated `ease-ink`/`ease-snap` classes — zero hits
- Verified `backdrop-blur-xl` IS used (`CalendarConnectionOverlay.svelte:61`, `AdminShell.svelte:238`) and kept it
- Greped `DashboardDataService`, `dashboardDataService`, `dashboardData.service` across the entire monorepo — only the file itself, its test, and stale tracking files referenced it
- Post-deletion sweep: zero leftover references in `apps/web/src`
- Parsed `tailwind.config.js` after edits to confirm clean shape

## Documentation updates done

Surgical edits to remove stale references to the deleted utilities/tokens:

| Doc                                                               | Edit                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`    | Removed dense spacing scale block from §8.2                                    |
| `apps/web/docs/technical/MOBILE_PERFORMANCE_OPTIMIZATION_PLAN.md` | Updated status table, "Good Base" section, and code example (3 surgical edits) |
| `apps/web/docs/technical/LAZY_LOADING_OPPORTUNITIES_ANALYSIS.md`  | Replaced `skeleton-loader` example with `animate-pulse bg-muted` pattern       |
| `docs/testing/COVERAGE_MATRIX.md`                                 | Removed `dashboardData.service.ts` row                                         |
| `docs/testing/WEB_APP_COVERAGE.md`                                | Deleted the full `dashboardData.service.test.ts` section                       |

Added historical-note banners (preserve as-is for context, but flag as outdated):

| Doc                                                                     | Banner                                    |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `apps/web/docs/technical/ANIMATION_PERFORMANCE_OPTIMIZATION_SUMMARY.md` | Utilities removed; principles still valid |
| `apps/web/docs/technical/ANIMATION_PERFORMANCE_AUDIT.md`                | Same                                      |
| `apps/web/docs/technical/DITHERING_STACKING_CONTEXT_FIX.md`             | Two of three offending files now gone     |

**Left alone (intentional):**

- `apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md` and `apps/web/docs/design/design-system.md` both define a `.hover-scale` class via `@apply`, but as inline pattern examples — they don't reference the deleted file. The class name collides with the deleted utility but the implementation is local. Left as-is; can revisit if you want to enforce a single source of truth.

---

## Parking lot — flagged but not deleted

### 🟢 High confidence — safe to cut after a worker-side grep

**Nine admin analytics API routes** at `apps/web/src/routes/api/admin/analytics/`:

- `brief-stats`, `comprehensive`, `daily-signups`, `daily-users`, `daily-visitors`, `overview`, `recent-activity`, `system-metrics`, `visitor-overview`
- Total: ~245 lines
- Zero frontend fetchers found in apps/web/src
- Admin dashboard uses `dashboard-analytics.service.ts` + `/api/admin/analytics/dashboard` + `/api/admin/analytics/export` (these are alive — keep)
- **Before deleting:** grep `apps/worker` and any webhook handlers for any internal references
- Quickest contained next win

**`research_unused_web_scan.json` at repo root** — 340 KB stale audit artifact, no code references it. Delete + add the filename to `.gitignore`.

### 🟡 Medium confidence — judgment call

**`apps/web/src/lib/server/embedding.manager.ts` (424 lines)**
Only consumer is `apps/web/scripts/generate-embeddings.ts`. If the embeddings pipeline still runs from that script, keep both. If it moved (e.g. into the worker), you can cut ~500+ lines together.

**`apps/web/src/lib/stores/brain-dump-v2.store.ts`**
21 exported state creators, only ~3 actively subscribed externally. Either intentional state-machine surface area or leakage from a refactor — worth reviewing next time you're in that file.

**~25 more admin API routes flagged but not individually verified:**
`/api/admin/beta/*`, `/api/admin/calendar-errors`, `/api/admin/chat/sessions/[id]`, `/api/admin/emails/[id]*`, `/api/admin/errors/[id]/resolve`, `/api/admin/feedback/overview`, `/api/admin/migration/*` (5 routes), `/api/admin/notifications/deliveries/*`, `/api/admin/notifications/nlogs/correlation/[id]`, `/api/admin/notifications/real-data/[userId]/[eventType]` (393 lines — biggest one), `/api/admin/retargeting/*` (3 routes), `/api/admin/subscriptions/overview`, `/api/admin/users/[id]/context`, `/api/admin/users/[id]/notification-context`, `/api/admin/users/[userId]/activity`.

Some are likely dead, but several may be called from the worker, webhooks (Stripe, Twilio, Google), or external integrations. Each group needs a targeted second-pass verification before deletion.

---

## ❌ False positives — DO NOT re-flag in future audits

Things that look dead by simple grep but are actually wired up. Capture here so future cleanup passes don't waste time:

### Admin component tree (looks orphaned, isn't)

These admin components have no direct route imports, so a naive grep flags them as dead. They're all reachable via two intermediary modals:

```
/admin/users          ─┐
/admin/subscriptions  ─┤── EmailComposerModal.svelte ──┬── UserContextPanel.svelte
/admin/feedback       ─┤                               └── EmailHistoryViewerModal.svelte
/admin/beta           ─┘

/admin/users  ────────────── UserActivityModal.svelte ──┬── ActivityTimelineChart.svelte
                                                        ├── ProjectActivityChart.svelte
                                                        └── UserContextPanel.svelte

/admin/* (all)  ───────────  AdminShell.svelte ──── AdminSidebar.svelte
```

**All of these are alive:** `UserContextPanel`, `EmailHistoryViewerModal`, `ActivityTimelineChart`, `ProjectActivityChart`, `AdminSidebar`, `AdminCollapsibleSection`, `AdminNavCard`, `AdminCard`, `AdminPageHeader`, `AdminStatCard`. Plus `UserActivityModal` and `EmailComposerModal` which wrap them.

### Other things audit agents got wrong

- `dashboardData.service.ts` was claimed dead by an agent and turned out to be — good — but the same agent also flagged the entire admin component tree above. Treat agent dead-code reports as "candidates for verification," not as truth.
- Marker classes like `animation-complete` — when something looks like a duplicate class definition, check whether the consuming file defines its own rule for the marker. Don't blindly delete the "duplicate."

### Web app dependencies, types, stores

Audit came back essentially clean — package.json deps, type exports, and Svelte stores are well-maintained. Don't re-scan unless something specific is suspicious.

---

## Recommended next steps

**Fastest contained win:** Verify and delete the **9 admin analytics routes**. Run one grep against `apps/worker` and any webhook handlers — if clean, delete. ~245 lines + 9 files for ~5 minutes of work.

**Quick wins after that:**

1. Delete `research_unused_web_scan.json` and add it to `.gitignore` — 340 KB removed from the repo
2. Decide on `embedding.manager.ts` + `scripts/generate-embeddings.ts` together — either keep both or cut both (~500 lines)

**Bigger second-pass investigations:**

3. Targeted verification of the remaining ~25 admin API routes, grouped by feature (notifications, retargeting, migration, beta, etc.) — each group is ~5-10 minutes of greps + a deletion call
4. Pass through `brain-dump-v2.store.ts` to assess whether the 21 exports are intentional or refactor leakage

**Hygiene:**

5. After all deletions land, run `pnpm pre-push` (typecheck + test + lint + build) to catch any miss
6. After confirming the bundle still builds, eyeball the dev server once for visual regressions in admin and dashboard pages (the highest-touch areas in this cleanup)
