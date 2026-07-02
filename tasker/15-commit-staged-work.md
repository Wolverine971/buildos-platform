<!-- tasker/15-commit-staged-work.md -->

# 15 — Commit the standing worktree (4 coherent bundles + untracked strays)

**Priority:** P1 — cheap, removes risk; everything here is done work sitting uncommitted
**Type:** Engineering (housekeeping)
**Source:** `git status` as of 2026-07-01

## State — what's sitting in the tree

Four coherent staged bundles, all build-complete:

1. **Skill ontology refactor** — new `skill.schema.ts` (Zod frontmatter contract: 6 skill types, 3 altitudes, 3 activations, provenance vocabulary) + ~460-line body-block linter in `skill-authoring-validation.ts` + ~60 SKILL.md files migrated to the canonical block order. **Tests pass: 35/35** (`skill-authoring-validation.test.ts` 19, `skill-load.test.ts` 16). ~59 files, +4352/−1768.
2. **Loop-burst weighted-score hardening** — `project-loop-burst.service.ts` (score gate: source scores, threshold 4, 30-min lookback, de-dupe, no-double-count) + new test file (6 tests passing) + the five `api/onto/**` routes now passing `entityType`/`entityId`/`action` provenance. Producer AND consumer sides confirmed wired.
3. **/ideate + /moodboard commands** — `.claude/commands/ideate.md` + `moodboard.md` (iklipse directing engine ported to Real Media Rule / Inkprint). `/ideate` exercised once (author-workflow-teardown renders exist); **`/moodboard` never run** (empty output dir) — first real run validates it.
4. **Doc updates** — AI Inbox design + clarified-decisions spec status text (current through 6/30), Complete Project Audit spec (see [[14-complete-project-audit-build]]), HYPERPLEXED playbook edits, ONBOARDING/DASHBOARD/PROFILE audit updates.

Untracked strays worth committing or deciding on:

- `docs/specs/buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md` — the ONE remaining MCP-hardening artifact ([[07-mcp-hardening]])
- `docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md` — the smoke checklist itself
- `docs/marketing/research/anti-feed-receipts-library.md` — this IS the WS09 T45 target file, now created but untracked
- `tasker/` itself (this whole tracker)
- Root `test.md` (single HTML comment) — delete

Unstaged noise: WS09 table re-padding (cosmetic), WS10 one-line path fix, marketing doc touch-ups.

## Next action

1. Commit as ~4 commits matching the bundles above (skills refactor / burst hardening / commands / docs+trackers).
2. Fold the untracked strays into the docs commit; delete root `test.md`.
3. Then run `/moodboard` once for real to validate bundle 3's untested half.

## Done when

`git status` is clean (or intentionally minimal) and `/moodboard` has produced its first artifact.
