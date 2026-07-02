<!-- apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md -->

# Hyperplexed Audit Tracker

> Rollup for the audit program driven by the
> [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md) (rubric) and
> [`HYPERPLEXED_FIX_PATTERNS.md`](./HYPERPLEXED_FIX_PATTERNS.md) (recipes).
> One row per surface: what's audited, what shipped, what's deferred, and whether the live
> before/after verification pass has run. **Every new audit adds a row here; every fix pass updates
> its row.** Created 2026-07-01.
>
> Stack with the pre-playbook audits so findings don't duplicate:
> `DESIGN_AUDIT_2026-06-12.md` (Inkprint tokens) and `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md`
> (tiers 4–5 still open).
>
> **To audit a surface, run `/hyperplexed-audit <surface>`** (`.claude/commands/hyperplexed-audit.md`) —
> it drives the full loop (audit → tiered findings → DJ approval → fix → verify → update this tracker)
> and keeps this doc current as a side effect.

---

## 1. Audited surfaces

| Surface                              | Audit doc                                                                                  | Audited    | Fix status                                                                                                                                                                                                                              | Live verify |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Project detail page (v2)             | [`PROJECT_PAGE_AUDIT_2026-06-26.md`](./PROJECT_PAGE_AUDIT_2026-06-26.md)                   | 2026-06-26 | ✅ Polish pass shipped; created shared `board-a11y.ts` + locked the two-radius rule                                                                                                                                                     | ⬜ pending  |
| Projects list page                   | [`PROJECTS_LIST_PAGE_AUDIT_2026-06-26.md`](./PROJECTS_LIST_PAGE_AUDIT_2026-06-26.md)       | 2026-06-26 | ✅ Full pass shipped (svelte-check + Prettier clean)                                                                                                                                                                                    | ⬜ pending  |
| Home dashboard (authed `/`)          | [`DASHBOARD_AUDIT_2026-06-26.md`](./DASHBOARD_AUDIT_2026-06-26.md)                         | 2026-06-26 | ✅ Systemic D1–D5 shipped; created shared `AttentionBanner.svelte`. Dashboard **modals were out of scope** → backlog row below                                                                                                          | ⬜ pending  |
| History page                         | [`HISTORY_PAGE_AUDIT_2026-06-26.md`](./HISTORY_PAGE_AUDIT_2026-06-26.md)                   | 2026-06-26 | ✅ Polish pass shipped                                                                                                                                                                                                                  | ⬜ pending  |
| Profile & settings (shell + 8 tabs)  | [`PROFILE_PAGE_AUDIT_2026-06-26.md`](./PROFILE_PAGE_AUDIT_2026-06-26.md)                   | 2026-06-26 | ✅ Full pass shipped across shell + all eight tabs                                                                                                                                                                                      | ⬜ pending  |
| App shell (nav, root layout, footer) | [`NAVIGATION_AND_LAYOUT_AUDIT_2026-06-26.md`](./NAVIGATION_AND_LAYOUT_AUDIT_2026-06-26.md) | 2026-06-26 | ✅ Shipped incl. A1 one-width/one-padding unification. **Deferred:** mobile bottom tab bar; chat-launcher img stack; S4 radius drift on onboarding CTA                                                                                  | ⬜ pending  |
| Admin console (~27 surfaces)         | [`ADMIN_PAGES_AUDIT_2026-06-26.md`](./ADMIN_PAGES_AUDIT_2026-06-26.md)                     | 2026-06-26 | ✅ Full S1–S6 pass + native dialogs→modals + users-page filter redesign shipped. **Deferred:** security event-detail modal a11y rewrite; 38 pre-existing lint warnings                                                                  | ⬜ pending  |
| Agent chat modal (6 regions)         | [`AGENT_CHAT_MODAL_AUDIT_2026-06-28.md`](./AGENT_CHAT_MODAL_AUDIT_2026-06-28.md)           | 2026-06-28 | ✅ Tier 0 + Tier 0.5 + all Tier 1 + Tier 2 shipped 2026-06-29→07-01 (T1-6 found already fixed). **Open: T2-3's scroll-edge affordance half** (min-widths shipped; the visible-scroll-cue half needs a live design pass — see audit doc) | ⬜ pending  |

**Legend:** ✅ shipped · 🔶 partially shipped · ⬜ not started.

### Open fix work, in priority order

1. **Admin security event-detail modal** — hand-rolled overlay, no ESC/focus-trap; reuse `ui/Modal.svelte`.
2. **Shell mobile bottom tab bar** — structural; matches the open Tier 4–5 items in the mobile audit.
3. **Agent chat modal T2-3 scroll-edge affordance** — small, deferred pending a live design pass
   (needs a table-specific scroll wrapper or a color-safe scroll-shadow; see audit doc).

---

## 2. Verification pass (the missing half of the method)

Every audit so far is a **static markup pass** — high confidence on structure, but the color/contrast
and real-device calls are flagged _suspected_ in every doc. Hyperplexed's own method is side-by-side
before/after. The verify pass per surface:

1. `pnpm dev --filter=web` → capture the surface at desktop + iPhone width, light + dark.
2. Confirm the flagged color calls (dashboard/history "color salad", admin S4 dark-mode calls,
   badge legibility) and the mobile card fallbacks at real phone width.
3. Screenshot after-state next to the audit's findings; note confirmations/regressions in the audit
   doc and flip this tracker's Live-verify cell to ✅ with the date.

No surface has had this pass yet — it's the single biggest gap in the program.

---

## 3. Unaudited backlog (pick the next surface here)

Roughly ordered by user exposure:

| Surface                                                                                                     | Notes                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Brain-dump modal / capture flow**                                                                         | The core product moment; named in playbook §3 lens 1 and never audited                       |
| **Dashboard modals** (`DailyBriefModal`, `BriefChatModal`, `OverdueTaskTriageModal`, `DashboardInboxModal`) | Explicitly carved out of the dashboard audit as "deserve their own audit"                    |
| **Onboarding / first-run flow**                                                                             | Stack with `ONBOARDING_AUDIT_2026-06-26.md` (copy-level P0s shipped; visual pass never done) |
| **Briefs surfaces** (daily brief page/views)                                                                | Retention-critical                                                                           |
| **Public marketing pages** (home, about, pricing, blog shell)                                               | First impression for the guerrilla-campaign traffic                                          |
| **Auth screens** (login, register, reset)                                                                   | Small but every user sees them                                                               |
| **Agentic-chat full-page + Work Panel / Run Stack deep pass**                                               | Modal Tier 0.5 touched `WorkPanel`/`ThinkingBlock` adjacently; no dedicated audit            |
| **Search / command surfaces**                                                                               | If/when the omnibar ships                                                                    |

---

## 4. Reference library (playbook §0.3 — steal taste on purpose)

**External bar** (his named references): Linear, Vercel (cursor-glow, gradient-in-text/border),
Superlist (header), Mobbin (screens library), Discord (vertical nav), Android app drawer (nested
radii), YouTube Music (subtle background gradients).

**In-repo bar** (cite these in audits as "the standard this repo already set"):

- `ui/Button.svelte` — tap targets, focus ring, reduced-motion loading. The model primitive.
- `Navigation.svelte` mobile drawer — focus trap, scroll lock, focus restore. The model a11y widget.
- `ProjectStateRow.svelte` — the model overflow-safe row (P1).
- `board-a11y.ts` — the model motion/keyboard helpers (P10/P11).
- Admin users page filter panel — the model filters-button + chips consolidation (P7).

Add to this list when an audit finds a new in-repo exemplar; prune if one regresses.
