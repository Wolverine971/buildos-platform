---
description: Audit the BuildOS monorepo for misplaced docs, stale files, and broken references. Produce a prioritized cleanup plan.
argument-hint: "[optional scope: config | root | docs | thoughts | all]"
---

# Project Cleanup — BuildOS

You are auditing the BuildOS monorepo for organization issues. You do **not** move or delete anything without explicit confirmation. You produce a prioritized report the user can approve line-by-line.

## Scope

Default is `all`. If the user passes a scope argument, run only that phase.

- `config` — CLAUDE.md + READMEs accuracy
- `root` — stray files at repo root
- `docs` — structure + orphans under `docs/` and `apps/*/docs/`
- `thoughts` — research / ideas hygiene under `thoughts/shared/`
- `all` — everything, in the order above

## Phase 1 — Config accuracy

**Inspect** (only these; there is no per-app CLAUDE.md today):

- `/CLAUDE.md`
- `/README.md`
- `/apps/web/README.md`
- `/apps/worker/README.md`

**For each file, check:**

- Do the referenced paths still exist? (use Glob/Grep before reading)
- Are tech claims current? (e.g. "BullMQ" → now Supabase queue; "OpenAI primary" → now OpenRouter; job type lists match `apps/worker/src/worker.ts`)
- Are there conflicting statements across files?
- Are the scripts listed (`pnpm X`) actually defined in the relevant `package.json`?

If you find any path reference that points to a file that doesn't exist, flag it by line number.

**Output:**

```markdown
### /CLAUDE.md
Status: ✅ | ⚠️ | ❌
Broken refs: path:line
Stale claims: "…"
Suggested fixes: …
```

## Phase 2 — Root-level files

**Expected at repo root** (allowed; ignore):

`README.md`, `CLAUDE.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `nixpacks.toml`, `railway.toml`, `vercel.json`, `.gitignore`, `.env.example`, `.prettier*`, `eslint.config.*`, `tsconfig*.json`, `supabase.openapi*.json`.

**Flag anything else at root** — especially:

- `.md` files other than `README.md` / `CLAUDE.md`
- Chat session dumps (`chat-session-*.md`)
- Scratch agent files at root (`growth-agent.md`, etc.)
- CSV / JSON dumps that aren't version-controlled config
- PDFs, screenshots

**Suggested destinations:**

| Content | Goes to |
|---------|---------|
| Design / feature spec | `apps/*/docs/features/[feature]/` or `docs/specs/` |
| Architecture / cross-cutting design | `docs/architecture/` |
| Research note | `thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md` |
| Exploratory ideas | `thoughts/shared/ideas/` |
| Worker-specific feature doc | `apps/worker/docs/` |
| Marketing strategy / campaign | `docs/marketing/` |
| Raw chat / audit transcripts | `thoughts/shared/scratch/` or delete |

## Phase 3 — Docs structure

Under `/docs/` and `/apps/*/docs/`:

- Find files not linked from any README or index.
- Find duplicate-topic docs (e.g., multiple `DITHERING_*.md` at the top of `apps/web/docs/technical/`).
- Find docs that reference deprecated tech (BullMQ, Ollama primary, old pricing copy).
- Check naming conventions from `docs/DOCUMENTATION_GUIDELINES.md`.

## Phase 4 — Thoughts hygiene

Under `/thoughts/shared/`:

- Expected subdirectories: `ideas/`, `research/`, `scratch/` (the latter is fine if present).
- Research docs should use `YYYY-MM-DD_HH-MM-SS_topic-slug.md` naming.
- Flag research docs with missing frontmatter.
- Flag idea docs that have been implemented (e.g., referenced feature now exists under `apps/*/docs/features/`).
- Flag docs older than 90 days with no downstream references — candidates for archive (not delete).

## Phase 5 — Cross-reference validation

Verify link integrity across all inspected files:

- Internal markdown links resolve.
- Referenced paths (`apps/...`, `docs/...`) exist.
- Updated docs match actual code (e.g. if a doc lists ApiResponse method names, do they exist in `apps/web/src/lib/utils/api-response.ts`?).

## Phase 6 — Report

Produce one markdown block the user can review:

```markdown
# BuildOS Cleanup Report — <date>

## Summary
- Config issues: N
- Root stragglers: N
- Doc drift: N
- Thoughts hygiene: N

## High priority
1. <action> — <reason>

## Medium priority
1. …

## Low priority / archive candidates
1. …

## Suggested moves
| From | To | Reason |
|------|----|--------|

## Suggested deletions (needs confirmation)
| File | Reason | Last modified |
|------|--------|---------------|

## Broken references
| File:line | Bad ref | Fix |
|-----------|---------|-----|
```

## Rules

1. **Read before proposing.** Never suggest moving a file without looking at its contents.
2. **Never move/delete without explicit "yes".** Present the report, wait for the user to pick what to execute.
3. **Prefer consolidation over deletion.** If two docs cover the same topic, merge rather than drop.
4. **Preserve historical context.** Dated research captures decisions — archive to `thoughts/shared/archive/<year>/` rather than delete.
5. **Don't touch `.claude/`** in this command. That's a separate config surface.

## After the report

End with:

```
Which of these would you like me to execute? (e.g. "all high priority", "moves only", "1, 3, 7")
```
