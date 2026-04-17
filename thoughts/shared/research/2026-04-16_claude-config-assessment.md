<!-- thoughts/shared/research/2026-04-16_claude-config-assessment.md -->
# Claude Internal Config Assessment

**Date:** 2026-04-16
**Scope:** `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, `.claude/settings*.json` (project) + `~/.claude/` (global)

---

## Progress log (pass 1 — 2026-04-16)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Delete `agents/create_plan.md`, `commands/research_codebase_generic.md`, `commands/implement_plan.md` | ✅ DONE | Files removed. `create-plan` still available via built-in agent. |
| 2 | Fix `commands/code-cleanup-agent.md` frontmatter + identity | ✅ DONE | Renamed to `commands/code-cleanup.md`. Dropped `name`, `path`, `model`, `disable-model-invocation`. Now registers as `/code-cleanup`. |
| 3 | Fix `commands/project-cleanup.md` | ✅ DONE | Rewrote. Removed references to non-existent `/apps/*/CLAUDE.md`. Added scoped phases (`config | root | docs | thoughts | all`), strict no-mutation rule, and a concrete report format. |
| 4 | Fix `commands/fix-bug.md:60` (BullMQ drift) + tighten | ✅ DONE | Full rewrite. Dropped BullMQ. Added Supabase-queue paths, consumption-billing gate as a common trap, and a cleaner triage/verify flow. |
| 5 | Rewrite `skills/create-skill/SKILL.md` | ✅ DONE (revised) | First pass over-simplified to ~90 lines; second pass expanded to 275 lines with the teaching substance restored: degrees-of-freedom framing, three-tier loading model, progressive-disclosure patterns A/B/C, explicit frontmatter pitfalls for this harness, decision table for skill/command/agent, 10-step skeleton + checklist. Still BuildOS-scoped, still defers to the plugin for exotic cases. Name now matches directory. |
| 6 | Clean `settings.local.json` | ✅ DONE | 201 → 116 lines. Removed cross-machine `annawayne` path, embedded commit blob, shell fragments (`Bash(fi)`, `Bash(do)`, etc.), redundant `pnpm` / `pnpm run` pairs, and ~60 one-off WebFetch domains. Grouped what's left. Validated JSON. |
| 7 | Fix Opus pinning | ✅ DONE | `accessibility-auditor.md` and `content-editor.md` switched from `model: opus` → `model: inherit`. Also collapsed their ~2KB AI-generated descriptions to one-liners. |
| 8 | Tighten twitter/linkedin/instagram skills | ✅ DONE | Each SKILL.md now 54–61 lines (was 248–287). Detailed flows moved to `references/workflows.md` under each skill. LinkedIn's direct-post-URL extraction kept prominent as "mandatory read before capturing URLs". |
| 9 | Consolidate twitter warmup commands | ↩️ REVERTED | Rolled back: the two accounts are intentionally distinct workflows (personal @djwayne3 vs product @build_os) with different voice docs, scan priorities, and product-mention rules. Both commands restored from git. |
| 10 | Drop `NotebookEdit` from growth `disallowedTools` | ✅ DONE | All 6 growth/outreach agents cleaned. `Write, Edit, MultiEdit` retained. |
| 11 | Reassess `disable-model-invocation` | ✅ DONE | **Allowed auto-invocation:** `fix-bug`, `code-cleanup`, `project-cleanup`, `design-update`, `web-research` (non-destructive, useful for proactive suggestion). **Kept disabled** (user must slash-invoke): all social warmup + reply commands, both lead-campaign commands — these affect external state or require deliberate user intent. |

---

## TL;DR

The project-level Claude config is **functional but drifting**. There are concrete bugs from a botched template import (HumanLayer), stale tech references (BullMQ, missing `CLAUDE.md` files), naming/casing inconsistency, AI-generated description cruft, and a permissions file that's ballooned with one-off allowances. Nothing is on fire, but a ~30-minute cleanup would materially improve reliability and cost (less Opus usage), and a handful of additions would close real gaps.

**Status (2026-04-16):** pass 1 landed all the Quick Wins from §5.1 and one Medium (`settings.local.json`). One Medium reverted by design (twitter-warmup split). Four Mediums + five New Additions still open. See the progress log above and the status tags in §5.

---

## 1. Inventory

### Project-level (`/Users/djwayne/buildos-platform/.claude/`)

| Type         | Count | Notes |
|--------------|-------|-------|
| Agents       | 9     | 1 is a botched HumanLayer import (`create_plan.md`) |
| Commands     | 15    | 1 is malformed (`code-cleanup-agent.md`) |
| Skills       | 5     | `instagram`, `linkedin`, `twitter`, `supabase`, `create-skill` |
| Settings     | 2     | `settings.json` (clean), `settings.local.json` (bloated) |

Line counts: agents = ~3.9k lines, commands = ~5.1k lines, skills = ~1.4k lines. Total ~10k lines of prompt payload.

### Global (`~/.claude/`)

- Enabled plugins: `ralph-loop@claude-plugins-official`, `compound-engineering@every-marketplace`
- Global skills: `find-skills`, `resend`, `seobeast-audit`, `youtube-transcript`
- Global `settings.json`: clean (3 keys).

---

## 2. Critical Bugs & Broken References

### 2.1 `agents/create_plan.md` — HumanLayer template leaked in, heavily broken

This file was pulled from the HumanLayer open-source agent template and never adapted. Concrete problems:

- **Non-existent sub-agents referenced by name** (agent will try to invoke these and fail):
  - `codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`
  - `thoughts-locator`, `thoughts-analyzer`
  - `linear-ticket-reader`, `linear-searcher`
- **Path cruft from a different team**:
  - `thoughts/allison/tickets/eng_1234.md` (Allison is a HumanLayer dev; you use `thoughts/shared/`)
  - `humanlayer-wui/` directory doesn't exist in this repo
- **Commands that don't exist here**:
  - `humanlayer thoughts sync`
  - `make -C humanlayer-wui check`
- **Uses `TodoWrite`** (the old task-tracking tool) rather than `TaskCreate`/`TaskUpdate`.
- **Naming inconsistency**: filename is `create_plan.md` (underscore), `name:` field is `create-plan` (hyphen). Every other agent file uses hyphens.
- **Identity confusion**: file lives in `/agents/` but its own example flow says `User: /implementation_plan`, implying slash-command use. Also: a built-in generic `create-plan` agent already exists via Claude Code itself, so this custom one competes with it by name.

**Verdict:** biggest single source of weirdness. Either delete it (built-in `create-plan` covers the slot), or rewrite top-to-bottom for BuildOS.

### 2.2 `commands/code-cleanup-agent.md` — malformed frontmatter, agent/command identity crisis

```yaml
name: code-simplifier              # ← won't match slash /code-cleanup-agent
argument-hint: "[files or scope]"
disable-model-invocation: true
model: opus                        # ← `model` isn't a standard command field
path: code-cleanup-agent.md        # ← not a real frontmatter field
```

The slash command derived from the filename is `/code-cleanup-agent`, but `name:` is `code-simplifier`. The `path:` field is non-standard. `model: opus` on a command is unusual — commands typically inherit. This file is shaped like an agent that was filed under `/commands/`.

### 2.3 `commands/fix-bug.md:60` and `commands/research_codebase_generic.md:101` — BullMQ drift

Both still reference **BullMQ**:

- `fix-bug.md:60`: "Verify BullMQ job configuration"
- `research_codebase_generic.md:101`: "BullMQ usage patterns"

The worker has been Redis-/BullMQ-free for a while; the queue is Supabase-backed. Any agent following these instructions will hunt for code that no longer exists.

### 2.4 `commands/project-cleanup.md` — references CLAUDE.md files that don't exist

- Line 37: `/apps/web/CLAUDE.md` — doesn't exist
- Line 38: `/apps/worker/CLAUDE.md` — doesn't exist
- Line 55: header `### /apps/web/CLAUDE.md`

Only the root `CLAUDE.md` exists. Either create per-app CLAUDE.md files (there's a legitimate reason to do this for focused context) or remove the references.

### 2.5 `skills/create-skill/SKILL.md` — skill name ≠ directory name

Directory is `create-skill/`, but `name:` field is `skill-creator`. Anthropic's skill convention is that the slug/directory/name should all match. This will register as `skill-creator`, which is also the name used by the built-in `create-skill` and the plugin `compound-engineering:skill-creator` — three ways to invoke roughly the same thing with different names.

### 2.6 `settings.local.json` has cross-machine / malformed entries

- `Bash(for file in /Users/annawayne/buildos-platform/supabase/migrations/*.sql)` — refers to user `annawayne`, a different account. Copy-paste leftover.
- A multi-line git commit message baked into the allowlist (the huge `git commit -m "$(cat <<'EOF' … EOF)"` block). That exact string will never match again.
- Fragment entries that aren't real commands: `Bash(do echo \"\")`, `Bash(fi)`, `Bash(else)`, `Bash(then)`, `Bash(do)`, `Bash(for:*)`. These are pieces of shell syntax captured mid-construct.
- Redundant pairs: `Bash(pnpm build:*)` + `Bash(pnpm run build:*)`, `Bash(pnpm check:*)` + `Bash(pnpm run check:*)`, `Bash(pnpm lint:*)` + `Bash(pnpm run lint)`.
- ~60 one-off `WebFetch(domain:…)` entries from transient research sessions.

Total size is ~9.5KB of allowlist, most of it never-to-be-used.

---

## 3. Quality & Consistency Issues

### 3.1 AI-generated description cruft in frontmatter

`accessibility-auditor.md` and `content-editor.md` both have **~2KB descriptions** containing multiple fabricated `<example>` dialogues including references to things that aren't yours (e.g. "UXM Training website"). This pattern is the output of agent-generator tooling and was never cleaned. Every conversation loads this noise into context when the agent tool list is discoverable.

Recommendation: collapse to a one-liner description; move examples into the agent body (where they only load if the agent is actually invoked).

### 3.2 Naming convention is mixed

| File | Problem |
|------|---------|
| `agents/create_plan.md` | underscore filename (hyphen convention elsewhere) |
| `commands/implement_plan.md` | underscore filename |
| `commands/research_codebase_generic.md` | underscore filename |
| `commands/code-cleanup-agent.md` | filename ≠ `name:` field |
| `skills/create-skill/` | directory ≠ `name:` field |

Commands derive the slash from filename, so `/implement_plan` and `/research_codebase_generic` work but violate the all-hyphen pattern in the other 13 commands. Small thing; easy to fix with `git mv`.

### 3.3 Opus pinning where Opus isn't needed

- `agents/accessibility-auditor.md` — `model: opus`, 1953 lines of WCAG reference material. Most work is structured checklisting; Sonnet (or inherit) is sufficient.
- `agents/content-editor.md` — `model: opus`.
- `commands/code-cleanup-agent.md` — `model: opus` (and probably ignored there).

Other growth agents correctly use `model: inherit`. The two Opus pins are straight cost/latency drag — and accessibility-auditor's length should be split into a small SKILL.md + `references/wcag-2.2-criteria.md` so it doesn't pull its entire reference manual into every invocation.

### 3.4 Skill length — twitter/linkedin/instagram SKILL.md are long

- `twitter/SKILL.md`: 286 lines
- `instagram/SKILL.md`: 287 lines
- `linkedin/SKILL.md`: 248 lines

Anthropic's skill guidance: keep `SKILL.md` lean and put detail in `references/`. Only `supabase/` has a `references/schema.md`.

### 3.5 Duplicative twitter warmup commands

`twitter-warmup.md` (588 lines) and `twitter-warmup-buildos.md` (526 lines) are near-identical except for the account handle and voice reference. The structural 80% could live in one command or a shared skill; the 20% that differs (voice doc, target accounts tracker) should be arguments/branches.

### 3.6 `disallowedTools: NotebookEdit` on growth agents

All 5 growth agents disallow `Write, Edit, MultiEdit, NotebookEdit`. `NotebookEdit` is ineffective here (there are no Jupyter notebooks in the repo). Not broken, just noise; harmless but consistent cleanup.

### 3.7 `disable-model-invocation: true` on every command

Every command sets this. That means Claude will **never** suggest a command on its own — you must slash-invoke. Fine as a discipline choice, but worth knowing: this blocks proactive suggestions like "you should run `/design-update` on this component." If you want proactive suggestions, flip a couple of the less-destructive ones (e.g. `fix-bug`, `design-update`) to allow model invocation.

---

## 4. Gaps — Things I'd Expect but Don't See

### 4.1 No per-app `CLAUDE.md`
Only the root `CLAUDE.md` exists. Sub-app CLAUDE.md files (which Claude Code auto-loads when working in a sub-directory) would cut the top-level file in half and give web-vs-worker-specific rules without context bloat. Your `commands/project-cleanup.md` already assumes they exist.

### 4.2 No verification/test-runner agent
Your commands have `fix-bug`, `implement_plan`, `code-cleanup-agent`, but no explicit post-change verifier. The built-in `general-purpose` can do this, but a small `test-verifier` agent with instructions to run `pnpm pre-push` and summarize failures would be very useful.

### 4.3 No Svelte 5 / SvelteKit code reviewer
You have Rails/Python/TypeScript reviewers available via the compound-engineering plugin (`kieran-typescript-reviewer`, `dhh-rails-reviewer`), but nothing Svelte-specific. Given your code is 90% Svelte 5 + SvelteKit, a `svelte5-runes-reviewer` with your conventions baked in would pay for itself quickly.

### 4.4 No migration/schema agent
Your worker schema + RLS policies change regularly. A `supabase-migration-writer` that knows about `supabase/migrations/`, RLS patterns, and `pnpm gen:all` would turn a recurring manual sequence into a one-shot.

### 4.5 No hooks
`.claude/settings.json` has no hooks. Options that might earn their cost:
- **PostToolUse on Write/Edit for Svelte files**: prompt Claude to run `pnpm check` on a component it just touched.
- **Stop hook**: append a one-line "run `pnpm pre-push` before committing" reminder.

### 4.6 No shared "BuildOS brand discipline" skill
You have 5+ growth/outreach agents that each include 30-100 lines of the same BuildOS positioning ("thinking environment for people making complex things", anti-AI marketing). Extract to a `buildos-brand-voice` skill; each agent references it. Removes ~500 lines of duplicated prompt across the set.

### 4.7 Plugin ↔ skill name collision
Plugin `supabase@claude-plugins-official` (MCP integration) and project skill `supabase` (how-to guide) share the name. Not a bug today, but worth disambiguating — e.g. rename the project skill to `supabase-ops` or `buildos-supabase`.

### 4.8 No "twitter warmup" voice test
You have a massive warmup → reply two-stage pipeline but no agent that audits the drafts for voice. Your `feedback_linkedin_comment_tone.md` and `feedback_instagram_comment_tone.md` memories show you've had to correct tone by hand. A `social-voice-guardrail` agent that reads queued drafts against those memories before you post would catch the exact issue the memories were saved for.

---

## 5. Recommendations (ranked by effort × impact)

### Quick wins (≤ 15 min each)

1. ✅ **Delete or rewrite `agents/create_plan.md`.** → Deleted. Built-in `create-plan` covers the slot.
2. ✅ **Fix `commands/code-cleanup-agent.md` frontmatter.** → Renamed to `code-cleanup.md`; frontmatter cleaned.
3. ✅ **Patch BullMQ drift** in `fix-bug.md` and `research_codebase_generic.md`. → `fix-bug.md` rewritten (BullMQ → Supabase queue RPCs); `research_codebase_generic.md` was deleted outright, which resolves its drift.
4. ✅ **Patch `project-cleanup.md`** to remove references to non-existent `/apps/*/CLAUDE.md`. → Rewrote the command; those refs gone.
5. ✅ **Rename `skills/create-skill/` → match `name:`.** → Fixed by setting `name: create-skill` in the frontmatter (kept directory name; no rename needed).
6. ✅ **Rename command files (underscore → hyphen).** → `code-cleanup-agent.md` → `code-cleanup.md`. The other two (`implement_plan.md`, `research_codebase_generic.md`) were deleted, so no renames needed.
7. ✅ **Collapse bloated agent descriptions** on `accessibility-auditor` and `content-editor`. → Both descriptions now one sentence each.
8. ✅ **Drop `NotebookEdit`** from all `disallowedTools:` lists. → Removed from all 6 growth/outreach agents.
9. ✅ **Replace `TodoWrite` references.** → All 3 files that mentioned it (`create_plan.md`, `implement_plan.md`, `research_codebase_generic.md`) were deleted, so no remaining `TodoWrite` refs in project config.

### Medium (~30–60 min)

10. ✅ **Clean `settings.local.json`.** → 201 → 116 lines. Cross-machine path, commit blob, shell fragments, dupes, and one-off WebFetch domains all removed. Grouped what remained.
11. ⏳ **Split `accessibility-auditor` into skill + references.** → NOT DONE. Description collapsed and model switched to `inherit`, but the 1953-line WCAG reference body has not been split into `references/`. Still an efficiency win on the table.
12. ⏳ **Create per-app `CLAUDE.md` files** for `apps/web/` and `apps/worker/`. → NOT DONE. Root `CLAUDE.md` still carries web+worker rules.
13. ⏳ **Extract `buildos-brand-voice` skill.** → NOT DONE. The 5 growth/outreach agents still duplicate BuildOS positioning copy.
14. ↩️ **Merge twitter warmup commands.** → **REVERTED by design.** Personal (@djwayne3) and product (@build_os) are intentionally distinct workflows (different voice doc, scan order, product-mention cadence, cross-promo logic). Keeping them as two commands is correct.

### New additions to consider

15. ⏳ **`svelte5-runes-reviewer` agent** — reviews PRs for runes usage, Inkprint token usage, `ApiResponse` compliance, etc.
16. ⏳ **`supabase-migration-writer` agent** — writes safe migrations + `gen:all`.
17. ⏳ **`test-verifier` agent** — runs `pnpm pre-push`, parses failures, reports root-causes.
18. ⏳ **`social-voice-guardrail` agent** — audits queued social drafts against your saved tone memories.
19. ⏳ **PostToolUse hook on Svelte files** — auto-run `pnpm --filter=web check` on touched files.

---

## 6. Appendix: Raw drift list

Missing path refs (found by grepping `.claude/` for `/apps/...` and `/docs/...` and testing existence):

| Referenced | Status |
|-----------|--------|
| `/apps/web/CLAUDE.md` | missing (referenced in `project-cleanup.md`) |
| `/apps/worker/CLAUDE.md` | missing (referenced in `project-cleanup.md`) |
| `/docs/architecture/decisions/ADR-XXX.md` | placeholder, OK |
| `/docs/path/file.md` | placeholder, OK |

All 41 marketing `/docs/marketing/...` paths referenced across commands **exist**. That's actually impressive given the churn.

Stale tech mentions:

| File | Issue |
|------|-------|
| `commands/fix-bug.md:60` | BullMQ job config |
| `commands/research_codebase_generic.md:101` | BullMQ usage patterns |
| `agents/create_plan.md:*` | HumanLayer agents, `humanlayer-wui/`, `humanlayer thoughts sync`, `thoughts/allison/` |
| `agents/create_plan.md:102,341`; `commands/implement_plan.md:37`; `commands/research_codebase_generic.md:38` | `TodoWrite` instead of `TaskCreate` |

---

**Outstanding work** (not yet done):

- §5.11 — split `accessibility-auditor` into SKILL-style references to trim its 1953-line body.
- §5.12 — per-app `CLAUDE.md` files for `apps/web/` and `apps/worker/`.
- §5.13 — extract `buildos-brand-voice` skill to stop duplicating positioning copy across 5 agents.
- §5.15–19 — all new-addition agents/hooks (Svelte 5 reviewer, migration writer, test verifier, social-voice guardrail, Svelte PostToolUse hook).

Say the word on any of these and I'll pick it up.
