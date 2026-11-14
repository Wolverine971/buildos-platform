---
description: Audit the BuildOS monorepo for misplaced docs, stale files, and broken references. Produce a prioritized cleanup plan.
argument-hint: "[optional scope: config | root | docs | retired | all]"
---

# Project Cleanup — BuildOS

You are auditing the BuildOS monorepo for organization issues. You do **not** move or delete anything without explicit confirmation. You produce a prioritized report the user can approve line-by-line.

## Scope

Default is `all`. If the user passes a scope argument, run only that phase.

- `config` — CLAUDE.md + READMEs accuracy
- `root` — stray files at repo root
- `docs` — structure + orphans under `docs/` and `apps/*/docs/`
- `retired` — nothing has come back in the retired folders (`thoughts/`, `docs/archive/`)
- `all` — everything, in the order above

## Phase 1 — Config accuracy

**Inspect** (only these; there is no per-app CLAUDE.md today):

- `/CLAUDE.md` and `/AGENTS.md`
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

`README.md`, `CLAUDE.md`, `AGENTS.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `railway.toml`, `railway.chat.toml`, `railway.libri.toml`, `vercel.json`, `vitest.*.ts`, `skills-lock.json`, `.gitignore`, `.env.example`, `.nvmrc`, `.editorconfig`, `.prettier*`, `eslint.config.*`, `tsconfig*.json`, `supabase.openapi*.json`.

Also allowed, by decision (see "Files that stay at the repo root" in `docs/DOCUMENTATION_GUIDELINES.md`): `buildos-strat.md`, `buildos-strat-tasks.md`. Do not propose moving them.

`nixpacks.toml` is a legacy build plan. Its header says when it can be deleted; flag it only if that condition is met.

**Flag anything else at root** — especially:

- `.md` files other than `README.md` / `CLAUDE.md`
- Chat session dumps (`chat-session-*.md`)
- Scratch agent files at root (`growth-agent.md`, etc.)
- CSV / JSON dumps that aren't version-controlled config
- PDFs, screenshots

**Suggested destinations** (from `docs/DOCUMENTATION_GUIDELINES.md`):

| Content | Goes to |
|---------|---------|
| Design / feature spec | `apps/*/docs/features/[feature]/` or `docs/specs/` |
| Architecture / cross-cutting design | `docs/architecture/` |
| Research note | `docs/research/<topic>-YYYY-MM-DD.md` |
| Exploratory ideas | `docs/brainstorms/YYYY-MM-DD-<topic>.md` |
| Video transcript | `docs/research/youtube-library/transcripts/` (clean) or `inbox/` (raw paste) |
| Worker-specific feature doc | `apps/worker/docs/` |
| Marketing strategy / campaign | `docs/marketing/` |
| Raw chat / audit transcripts | `docs/research/` with a point-in-time banner, or delete |
| Personal or non-BuildOS files | Out of the repo |

## Phase 3 — Docs structure

Start with `pnpm check:doc-health` (free, about 10 seconds). It reports dead paths, dead schema names, broken links, unstamped point-in-time docs and unreferenced docs; `--json` lists every finding. Work from its output instead of re-deriving it.

Under `/docs/` and `/apps/*/docs/`:

- **Unreferenced docs**: for each one, read it and check it against today's code. Dead or finished → propose deletion. Still the only description of something live or planned → propose a link from the nearest README.
- Find duplicate-topic docs (several files on one subject at the top of a folder).
- Find reference docs that describe retired tech as current (BullMQ, Redis, Nixpacks, the `/api/agent/v2/stream` route, brain-dump processing).
- Check that `docs/README.md` lists every folder that exists and none that do not.
- Check naming and banners against `docs/DOCUMENTATION_GUIDELINES.md`.

## Phase 4 — Retired folders

`thoughts/` was retired on 2026-08-19 and `docs/archive/` on 2026-09-24. The rule now is: delete superseded docs; git history is the archive.

- Flag either folder if it exists again, at the root or under `apps/*`.
- Flag current (unstamped) docs that still point into them. The fix is a GitHub permalink at the last commit that had the file, or plain text.

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
- Retired folders: N

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
4. **Delete, don't archive.** Superseded docs are deleted; git history is the archive (`docs/DOCUMENTATION_GUIDELINES.md`). When a doc that stays still links a deleted file, replace the link with a GitHub permalink at the last commit that had it. Before proposing a deletion, check whether the doc records a decision nothing else records; move that decision into a current doc first.
5. **Don't touch `.claude/`** in this command. That's a separate config surface.

## After the report

End with:

```
Which of these would you like me to execute? (e.g. "all high priority", "moves only", "1, 3, 7")
```
