<!-- docs/DOCUMENTATION_CLEANUP_2026-06-22.md -->

# Documentation Cleanup Tracker — 2026-06-22

Living tracker for the monorepo-wide doc cleanup. Started 2026-06-22.

Scope audited: ~1,900 markdown files across `docs/`, `apps/web/docs/`, `apps/worker/docs/`,
`thoughts/`, and repo root. Five parallel research agents indexed staleness; findings were
bucketed into Tier 1 (safe purge) through Tier 5 (consolidation).

**Verdict legend:** PURGE (delete) · MOVE (relocate) · ARCHIVE (→ `docs/archive/`, preserve
history) · SALVAGE→PURGE (extract a loose end first) · KEEP.

---

## ✅ Tier 1 — DONE (safe purge, zero content loss)

Deleted 2026-06-22. 32 files removed + 5 broken-reference fixes.

### A. Empty stub / PLACEHOLDER files (24)

All created 2025-12-09, body was literally "PLACEHOLDER":

- `apps/web/docs/technical/database/schema.md`
- `apps/web/docs/technical/database/indexes.md`
- `apps/web/docs/technical/database/rls-policies.md`
- `apps/web/docs/technical/services/prompt-service.md`
- `apps/web/docs/technical/services/brain-dump-service.md`
- `apps/web/docs/technical/services/project-service.md`
- `apps/web/docs/technical/services/calendar-service.md`
- `apps/web/docs/technical/testing/strategy.md`
- `apps/web/docs/technical/testing/vitest-setup.md`
- `apps/web/docs/technical/testing/llm-testing.md`
- `apps/web/docs/technical/development/getting-started.md`
- `apps/web/docs/technical/deployment/runbooks/incident-response.md`
- `apps/web/docs/technical/deployment/runbooks/openai-rate-limiting.md`
- `apps/web/docs/technical/deployment/runbooks/supabase-recovery.md`
- `apps/web/docs/technical/deployment/runbooks/calendar-webhook-failures.md`
- `docs/user-guide/faq.md`
- `docs/user-guide/features/projects.md`
- `docs/user-guide/troubleshooting.md`
- `docs/integrations/stripe/runbooks/webhook-validation.md`
- `docs/business/info.md`
- `docs/business/strategy/features-notes.md`
- `docs/marketing/growth/target-influencers/tim-ferris.md`
- `docs/marketing/growth/target-influencers/patrick-bet-david.md`
- `docs/marketing/growth/target-influencers/viral-plan.md`

### B. Obsolete / superseded reports (4)

- `docs/reports/api-endpoint-standardization.md` — completed-project report (work done 2025-10-24)
- `docs/reports/bug-fixes-summary.md` — completed bug fixes (2025-10-24)
- `docs/reports/documentation-cleanup-findings.md` — old doc-cleanup pass (2025-11-07), superseded by this effort
- `docs/plans/AGENT_STREAM_ENDPOINT_REFACTORING_PLAN.md` — refactor plan for old `/api/agent/stream` (superseded by agentic-chat-v2 stream-orchestrator)

### C. Root-level dumps (3)

- `openrouter_activity_2026-04-16.csv` — 792KB LLM-usage CSV dump (not config)
- `openrouter-activity-20260416-014844.csv` — 14KB usage CSV dump
- `chat-session-audit-add-a-document-to-aurora-field-notes-titled-harv-ba04f59e-968c-4f-2026-06-19.md` — 515KB raw chat-session export

### D. Vestigial tooling (1)

- `apps/web/docs/technical/create_placeholders.sh` — the script that generated all the Tier 1A
  PLACEHOLDER stubs; would regenerate junk on re-run.

### Broken-reference fixes (live index files)

- `apps/web/docs/NAVIGATION_INDEX.md` — removed deleted stubs from the ASCII tree; repointed
  "Database Changes" link to `packages/shared-types/src/database.schema.ts`; repointed
  "Getting Started" / "New Developers" links to root `README.md`/`CLAUDE.md` +
  `DEVELOPMENT_PROCESS.md`.
- `apps/web/docs/technical/services/README.md` — removed dead bullets for the 4 deleted service stubs.
- `docs/integrations/stripe/README.md` — removed dead `webhook-validation.md` link.

> Note: dated/historical docs (ADRs, code-review snapshots, old plans) that mention the deleted
> stubs were intentionally left untouched — they are point-in-time records.

---

## ✅ Tier 2 — Root stragglers — DONE (2026-06-22)

Root now holds only `README.md`, `CLAUDE.md`, `buildos-strat.md`, `growth-agent.md` (last two = KEEP).
All moves used `git mv` (history-preserving) where tracked. Breadcrumb headers + inbound links updated.

### Move + rename map

| From (root)                                        | To                                                                                       | Notes                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `youtube-design.md`                                | `docs/research/youtube-library/transcripts/2026-03-14_kole-jain_every-uiux-concept.md`   | Was a raw transcript (Kole Jain UI/UX)                                                |
| `youtube-design-principles-guide.md`               | `docs/research/youtube-library/analyses/2026-03-14_kole-jain_uiux-concepts_analysis.md`  | The "unfinished skill" — it's the analysis feeding `ui-ux-quality-review` skill draft |
| `youtube-vid.md`                                   | `docs/research/youtube-library/inbox/2026-05-28_oren-meets-world_future-of-marketing.md` | Raw capture → inbox (awaiting processing)                                             |
| `ai-influencers.md`                                | `docs/marketing/growth/target-influencers/ai-native-builder-influencer-study.md`         | Per loose-ends inventory plan; renamed for clarity                                    |
| `youtuber-i-follow.md` + `youtubers-i-follow-2.md` | `docs/marketing/research/youtubers-i-follow.md`                                          | **Merged + de-duped** by @handle: 452 → 439 unique (13 dupes removed)                 |
| `home-page-design-review.md`                       | `apps/web/docs/design/home-page-design-review.md`                                        |                                                                                       |
| `AUDIT-WEB-2026-04-17.md`                          | `apps/web/docs/technical/audits/WEB_AUDIT_2026-04-17.md`                                 | Renamed to audit-folder convention                                                    |
| `buildos_api_audit.md`                             | `apps/web/docs/technical/audits/API_AUDIT_2026-05-01.md`                                 | Renamed + dated                                                                       |
| `PICKUP-2026-04-18.md`                             | `thoughts/shared/archive/2026-04-18_pickup.md`                                           | Point-in-time status → archive                                                        |
| `Knowledge_Graphs_Study_Notes.md`                  | `thoughts/shared/research/2026-04-30_knowledge-graphs-study-notes.md`                    |                                                                                       |
| `LIBRI_BUILDOS_DYNAMIC_TOOL_MANIFEST_SPEC.md`      | `docs/archive/specs/libri/`                                                              | **Dead** — added ARCHIVED banner (Corsair brokers integrations per 2026-05-21)        |
| `BUILDOS_LIBRI_DYNAMIC_DISCOVERY_BRIDGE.md`        | `docs/archive/specs/libri/`                                                              | Same — ARCHIVED banner added                                                          |

### Kept at root (decision)

- `buildos-strat.md` — master strategy; referenced as root-relative by ~25 files in `docs/marketing/distribution/`.
- `buildos-strat-tasks.md` — **was moved to `docs/marketing/strategy/`, then REVERTED to root.** It's the
  companion task list referenced as root-relative (`../../../../buildos-strat-tasks.md`, `/buildos-strat-tasks.md`)
  by the whole distribution workstream system + CONVENTIONS.md names both as root-level sources of truth.
  Moving it broke ~25 links, so both strat files stay together at root.
- `growth-agent.md` — mirrors the active `.claude/skills/growth-agent/` skill.

### Inbound-reference fixes (broken links repaired)

- `docs/marketing/growth/target-influencers/INDEX.md` — thesis-hub link → renamed study
- `docs/marketing/growth/target-influencers/CANDIDATE-PIPELINE-2026-06-19.md` + 6 dossiers
  (`swyx`, `riley-brown`, `simon-willison`, `geeihadagoodtime`, `matt-ganzak`, `elena-nisonoff`) — `related_docs` lineage → renamed study
- `docs/research/youtube-library/skill-combo-indexes/PRODUCT_AND_DESIGN.md` + `_GAP_AUDIT.md` — transcript link
- `docs/research/youtube-library/INDEX.md` + `skill-drafts/ui-ux-quality-review/lineage.yaml` — transcript local_path
- `docs/marketing/strategy/dj-wayne-personal-brand-vs-projects-2026-06-19.md` — 4 source-analysis links → new inbox path
- Analysis file's "Source transcript" link repointed to the new transcript path

> **Not rewritten (by design):** prose mentions of the old root names in dated/historical docs
> (`docs/brainstorms/2026-05-21-*`, `docs/reports/buildos-loose-ends-inventory-2026-06-11.md`,
> `docs/specs/buildos-*-2026-05-21.md`, `docs/marketing/segments/research-youtube-persona-2026-05-13.md`).
> These reference the artifacts as historical pointers; the rename map above is the lookup.

---

## ✅ Tier 3 — Archive batches — DONE (2026-06-22)

**110 files archived** via `git mv` (history preserved). Nothing deleted. Inbound links fixed.

| Batch                        | Count | From → To                                                                                                                                                      |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| Reports                      | 46    | `docs/reports/` → `docs/archive/reports/` (kept: `buildos-loose-ends-inventory-2026-06-11.md`, `daily-brief-quality-efficiency-review-2026-05-19.md`)          |
| SEO audits                   | 6     | `docs/seo-audits/` → `docs/archive/seo-audits/` (empty dir removed)                                                                                            |
| Q1 research                  | 34    | `thoughts/shared/research/` (Jan–Feb dated) → `thoughts/shared/archive/research-2026-Q1/`                                                                      |
| Implemented ideas            | 11    | `thoughts/shared/ideas/` → `thoughts/shared/archive/ideas/` (chat-spec/braindump-chat/conversational-project — features now live)                              |
| Brain-dump (removed feature) | 5     | architecture/blogs/user-guide/philosophy → `docs/archive/brain-dump/` (confirmed: the _served_ versions live in `apps/web/src/content/`, so no SEO impact)     |
| Code-review snapshots        | 3     | `docs/technical/reviews/2025-12-31                                                                                                                             | 2026-01-01 | 2026-01-08`→`docs/archive/technical/reviews/` |
| Legacy feature docs          | 3     | `apps/web/docs/design/design-system.md` (pre-Inkprint), `features/onboarding-v2/`, `features/conversational-agent/` (never shipped) → `docs/archive/apps-web/` |
| agentic-chat audits          | 2     | `AUDIT_2026-04-17_OVERVIEW.md`, `AUDIT_2026-05-12_UX-PASS-REVIEW.md` → `docs/archive/apps-web/agentic-chat/`                                                   |

**Excluded by design:** `AUDIT_2026-06-10_HOLISTIC_ASSESSMENT.md` + `PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md`
— both have uncommitted edits in your working tree (active agentic-chat work). Left in place.

**Inbound links repaired:**

- ~11 specs/plans (`docs/plans/AGENTIC_CHAT_WRITE_INTEGRITY_*`, `docs/specs/agentic-chat-*`, ontology specs) —
  `../reports/` and absolute report paths → `../archive/reports/`
- `apps/web/docs/NAVIGATION_INDEX.md` — removed dead `conversational-agent` entry; repointed `onboarding-v2` to archive
- `apps/web/docs/START-HERE.md` — repointed `onboarding-v2` to archive
- `apps/web/docs/features/chat-system/README.md` — 4 ideas links → archive
- Final scan: **0 broken links remain.**

### Ideas NOT archived (kept live, by decision)

`chat-spec-improved.md` (recently updated), `how-to-move-like-stalin.md` (strategy ref), the `ontology/` subdir
(foundational design), and 4 to verify-then-archive: `project-context-sub-node-design.md`,
`project-context-sub-node-system.md`, `project-scaffolding.md`, `sticky-scroll-markdown-editor.md`.

---

## ✅ Tier 4 — Deprecated-tech fixes — DONE (2026-06-22)

In-place edits (no moves). All remaining BullMQ mentions are now accurate "BullMQ-style adapter" context.

| File                                                              | Fix applied                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/docs/README.md`                                      | 2 lines: "BullMQ" as current queue → "Supabase-based queue (no Redis; BullMQ-style interface via JobAdapter)"                                                                                                       |
| `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md`           | Removed deprecated 100%-web SSE brain-dump flow section (→ note pointing to ADR + `docs/archive/brain-dump/`); replaced speculative "evolve to BullMQ/Redis" section with a "Redis-free is intentional" design note |
| `docs/architecture/AGENTIC_WORKFLOW_DESIGN_CONTEXT.md`            | Reworded JobAdapter "transitioning from BullMQ" → accurate bridge description                                                                                                                                       |
| `apps/web/docs/technical/architecture/BUILD_OS_MASTER_CONTEXT.md` | "OpenAI + local Ollama" → "OpenRouter primary + OpenAI/Anthropic fallback + Moonshot for Kimi"                                                                                                                      |

---

## ✅ Tier 5 — Duplicate clusters — DONE (2026-06-22)

Most sub-items were already resolved by earlier tiers; net-new work was the chat-system banner.

1. **Chat docs** — `agentic-chat/` is canonical. ✅ Added a **SUPERSEDED banner** to
   `apps/web/docs/features/chat-system/README.md` pointing to `../agentic-chat/README.md`.
   `conversational-agent/` already archived (Tier 3).
2. **Onboarding** — `onboarding-v2/` already archived (Tier 3). ✅
3. **SEO 9takes 03-24 vs 03-27** — both already archived (Tier 3); newer preserved. ✅
4. **youtuber lists** — merged + de-duped in Tier 2. ✅
5. **ADHD-positioning docs — NOT archived (decision).** On inspection these are **not stale orphans**:
   `adhd-productivity-os-strategy.md` is cross-referenced by ~13 marketing docs (incl. the _new_
   `anti-ai-show-dont-tell-strategy.md` and `strategy/README.md`, which keep it intentionally as the
   "ADHD wedge / earlier positioning" reference); `instagram-strategy.md` +
   `instagram-niche-expansion-research.md` are still listed in `START_HERE`/`INDEX`;
   `users-adhd.md` + `customer-lingo-adhd.md` are live audience research. The ADHD→thinking-environment
   **reconciliation is an active content/strategy decision (owner's call), not a doc-cleanup move.**
   Left all in place. They already carry their own "historical / needs reconciling" status notes.

---

## ✅ Second pass — additional stale sweep — DONE (2026-06-22)

Fresh 3-agent staleness pass after Tiers 1–5. **99 more files archived** via `git mv`, 6 inbound links fixed.

| Bucket                             | Count | From → To                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Daily-engagement logs >1wk old** | 75    | `docs/marketing/social-media/daily-engagement/` (pre-2026-06-15) → `docs/archive/marketing/social-media/daily-engagement/` (per that folder's own README Archive Rule). Kept 6 recent + README.                                                                                                                                                                                      |
| **Shipped-feature specs**          | 8     | `docs/specs/` → `docs/archive/specs/` (PROJECT_GRAPH_ENHANCEMENTS, DOCUMENT_VOICE_RECORDINGS_PANEL, PROJECT_ICON_GENERATION, PROJECT_MEMBER_ROLE_CONTEXT, ONBOARDING_BEHAVIORAL_SEED, DAILY_BRIEF_ONTOLOGY_MIGRATION, BRIEF_CHAT_EXECUTION_PLAN, sticky-scroll/STICKY_SCROLL_SPEC_UNIFIED) — all status-confirmed Implemented/Complete. Kept `BRIEF_CHAT_SPEC.md` (not yet shipped). |
| **Superseded engineering**         | 12    | `apps/web/docs/technical/` → `docs/archive/apps-web/` (MOBILE_RESPONSIVENESS_AUDIT_2026-04-27 → superseded by MOBILE_EXPERIENCE_2026-06-12; agent-stream-v2 assessment/concern-map 05-25/05-29 → 06-13; 3 resolved Feb incident analyses; 6 DITHERING completed-fix docs)                                                                                                            |
| **Marketing one-shots**            | 4     | dated publish-kits (2026-03-09 wave-1, 2× 2026-04-27) + `audits/2026-04-29-blog-audit.md` → `docs/archive/marketing/`                                                                                                                                                                                                                                                                |

**Inbound links fixed (6):** ONTOLOGY_AUTO_ORGANIZATION_SPEC + PROJECT_ONTOLOGY_LINKING_PHILOSOPHY (→ archived graph spec), WS09-anti-feed-cluster (×2, → archived publish-kit), onboarding/README (→ archived seed spec), design-system/README (→ archived DITHERING_MIGRATION_PLAN). Scan: 0 broken remaining.

### Second-pass decisions (NOT touched)

- **YouTube transcripts** (`docs/marketing/growth/research/youtube-transcripts/`, 87) — **KEEP**. New `docs/research/youtube-library/` is canonical but its INDEX still points back to these as a live migration staging ground. Don't force-consolidate mid-migration.
- **`ENNEAGRAM_PROJECT_COUNCIL_SPEC.md`** — abandoned (0 code) but left in place (not called out).
- **OpenClaw specs** — verified **37 source files** reference OpenClaw; actively integrated → KEEP (agent was wrong).
- **`agent-work/HANDOFF_2026-06-18.md`** — active work, referenced for landmines → KEEP (agent was wrong).
- The engineering agent's broader "64-file" list over-flagged the **Inkprint design-system + modal + component docs** — those are living reference, left in place.

---

## 🚩 Deferred — owner's call (NOT auto-touching)

- `docs/founder/` resumes + job-applications + conference-outreach (~21 files) — personal & arguably
  active (job search ongoing). Leave unless DJ wants them moved off-repo.
- `docs/marketing/growth/research/youtube-transcripts/` — keep until youtube-library migration finishes.

---

## Totals if all tiers executed

~35 PURGE · ~13 MOVE · ~140 ARCHIVE · 4 in-place edits. (Tier 1 = 32 purged + 5 ref fixes, complete.)
