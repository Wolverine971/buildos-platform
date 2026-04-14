# Claude Config Audit And Remediation Plan

**Date:** 2026-04-13  
**Scope:** `/Users/djwayne/buildos-platform/.claude`, nested project `.claude` folders, and selected global `~/.claude/skills` entries.

## Summary

The Claude config mostly works, but it has drift from current Claude Code behavior. The root issue is that the repo mixes older slash command conventions, flat skill files, and a stale command file placed under `.claude/agents`.

The safest cleanup path is:

1. Fix invalid references and unsupported metadata values.
2. Add command frontmatter where it preserves the existing command names.
3. Convert flat project skills into modern `SKILL.md` directories.
4. Move or remove stale command files only after deciding whether the command is still useful.
5. Tighten local permission rules separately from functional cleanup.

## Research Notes

These points are based on current Claude Code docs checked on 2026-04-13:

- Skills now cover custom-command behavior. Existing `.claude/commands/*.md` files still work, but `.claude/skills/<skill-name>/SKILL.md` is the preferred, more capable format. Source: https://code.claude.com/docs/en/slash-commands
- Skill/command frontmatter is expected and safe. It supports fields such as `name`, `description`, `argument-hint`, `disable-model-invocation`, `allowed-tools`, `model`, `context`, `agent`, and `effort`. Source: https://code.claude.com/docs/en/slash-commands
- Skill descriptions are used for routing and can be truncated around 250 characters per entry, so descriptions should front-load intent. Source: https://code.claude.com/docs/en/slash-commands
- `disable-model-invocation: true` is the right field for workflows that should only run when directly invoked. `user-invocable` controls menu visibility, not model access. Source: https://code.claude.com/docs/en/slash-commands
- Subagents require top-level YAML frontmatter with `name` and `description`; supported colors are `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, and `cyan`. Source: https://code.claude.com/docs/en/sub-agents
- Additional directories grant file access, not full config discovery. Skills in `.claude/skills/` are an exception; subagents and commands are not discovered from additional directories. Source: https://code.claude.com/docs/en/permissions
- Settings scopes are user, project, and local. `.claude/settings.local.json` is for personal local overrides and is not meant to be shared. Source: https://code.claude.com/docs/en/settings

Local checks:

- `claude --version` reports `2.1.104 (Claude Code)`.
- `claude agents` reports 8 project agents, not 9. The missing one is `.claude/agents/create_plan.md`, which has no top-level frontmatter and reads like a command.
- `claude skill list` could not be used in this shell because it returned `Not logged in · Please run /login`.
- `claude doctor` could not be used in this non-interactive runner because Ink raw mode failed.

## Safety Assessment

Adding frontmatter to a command file is low risk when:

- The command filename stays the same.
- The body content stays the same.
- The `name` field is omitted or matches the command name.
- `disable-model-invocation: true` is used only for manual workflows.
- `allowed-tools` is omitted unless there is a clear reason to pre-approve tools.

Adding frontmatter can hurt behavior when:

- `name` differs from the filename and changes the intended command identity.
- The description is too broad, making Claude auto-trigger the workflow too often.
- `allowed-tools` grants broad permissions.
- `context: fork` is added to a command that depends on conversation history.

Converting flat `.claude/skills/*.md` files to `.claude/skills/<skill-name>/SKILL.md` is low risk if all references are updated. It can break direct path references if commands still point to the old file paths.

Deleting `.claude/agents/create_plan.md` is functionally low risk because Claude is not loading it as an agent today. It is still a destructive cleanup, so the safer first step is to move it to an archive or convert it to a modern command only if the workflow is still valuable.

## Original Findings Before This Pass

### Agents

Loaded project agents:

- `accessibility-auditor`
- `cold-outreach-strategist`
- `content-editor`
- `creator-distribution-strategist`
- `growth-activation-architect`
- `growth-analyst`
- `growth-lifecycle-retention`
- `legion-lead-strategist`

Original issues:

- `.claude/agents/create_plan.md` is stale. It is not discovered as an agent and references missing agents like `codebase-locator`, `codebase-analyzer`, `thoughts-locator`, and `linear-ticket-reader`.
- `creator-distribution-strategist` used unsupported `color: magenta`. Fixed in this pass.
- `growth-activation-architect` used unsupported `color: teal`. Fixed in this pass.
- `accessibility-auditor` and `content-editor` have very long descriptions. This is valid YAML, but it wastes routing context and makes the agent list harder to reason about.
- `growth-analyst` says it delegates to specialist sub-agents, but subagents cannot spawn subagents when invoked as subagents. Keep orchestration instructions in a command/skill or in a main-session agent.

### Skills

Original project skill files:

- `.claude/skills/supabase/SKILL.md` is in the current layout.
- `.claude/skills/create-skill.md`, `.claude/skills/twitter.skill.md`, `.claude/skills/instagram.skill.md`, and `.claude/skills/linkedin.skill.md` were flat files. Fixed in this pass.

Global skill issues:

- `~/.claude/skills/seobeast-audit/SKILL.md` used `user-invokable`, which should be `user-invocable`. Fixed in this pass.
- `~/.claude/skills/youtube-transcript/SKILL.md` references project-specific files that do not exist in this repo, including `scripts/youtube-transcript.py`, `cadre-youtube-videos.md`, `wiki/*`, and `youtube-transcripts/*`.

### Commands

Original issues:

- Most `.claude/commands/*.md` files had no top-level frontmatter. Fixed in this pass for root commands.
- `.claude/commands/code-cleanup-agent.md` has `name: code-simplifier`, which does not match its filename.
- Multiple social warmup commands referenced `/.claude/skills/...`, which resolves to the filesystem root. Fixed in this pass and updated to modern skill paths.
- `.claude/commands/twitter-warmup-buildos.md` referenced `/.claude/commands/twitter-warmup.md`, which should be project-relative. Fixed in this pass.
- `.claude/commands/fix-bug.md` referenced `/docs/BUGFIX_CHANGELOG.md`, but the repo has `docs/reports/bug-fixes-summary.md`. Fixed in this pass.
- `.claude/commands/research_codebase_generic.md` referenced `/apps/worker/src/jobs/` and `/apps/worker/src/queues/`, but the current worker code lives under `apps/worker/src/workers/` and supporting `src/lib` directories. Fixed in this pass.
- `.claude/commands/project-cleanup.md` references `/apps/web/CLAUDE.md` and `/apps/worker/CLAUDE.md`; those files do not exist.

### Settings

Issues:

- Root `.claude/settings.local.json` has a large accumulated allow list with broad entries such as `Bash(pnpm:*)`, `Bash(node:*)`, `Bash(curl:*)`, `Bash(git checkout:*)`, and stale shell fragments.
- Nested app settings also allow broad `Bash(rm:*)`.
- There are no explicit deny rules for `.env`, secret files, or dangerous shell-network patterns.

This should be handled separately from discovery cleanup because permission changes can affect day-to-day workflow.

## Remediation Plan

### Phase 1: Safe Functional Fixes

- Fix unsupported agent colors:
    - `magenta` -> `pink`
    - `teal` -> `cyan` or `blue`
- Fix bad project-relative references:
    - `/.claude/skills/twitter.skill.md` -> `.claude/skills/twitter.skill.md`
    - `/.claude/skills/instagram.skill.md` -> `.claude/skills/instagram.skill.md`
    - `/.claude/skills/linkedin.skill.md` -> `.claude/skills/linkedin.skill.md`
    - `/.claude/commands/twitter-warmup.md` -> `.claude/commands/twitter-warmup.md`
- Fix clearly stale command references:
    - `/docs/BUGFIX_CHANGELOG.md` -> `/docs/reports/bug-fixes-summary.md`
    - `/apps/worker/src/jobs/` and `/apps/worker/src/queues/` -> current worker paths.
- Fix global `seobeast-audit` typo from `user-invokable` to `user-invocable`.

### Phase 2: Metadata Cleanup

- Add minimal frontmatter to commands without changing command filenames.
- Prefer `disable-model-invocation: true` for manual operational commands like warmups, replies, implementation plans, cleanup, and web research.
- Do not add broad `allowed-tools` in the first pass.
- Align `code-cleanup-agent.md` identity. Either rename the file to match `code-simplifier` or remove the `name` field so the command remains `/code-cleanup-agent`.

### Phase 3: Skill Layout Migration

- Convert:
    - `.claude/skills/twitter.skill.md` -> `.claude/skills/twitter/SKILL.md`
    - `.claude/skills/instagram.skill.md` -> `.claude/skills/instagram/SKILL.md`
    - `.claude/skills/linkedin.skill.md` -> `.claude/skills/linkedin/SKILL.md`
    - `.claude/skills/create-skill.md` -> `.claude/skills/create-skill/SKILL.md`
- Update command references to invoke the skill names or reference the new paths.
- Shorten `supabase` description to front-load routing keywords.

### Phase 4: Stale File Removal

- Decide what to do with `.claude/agents/create_plan.md`:
    - Remove it if the workflow is no longer used.
    - Or move it to `.claude/commands/create-plan.md` and modernize references if the workflow is still useful.
- Delete `.DS_Store` from `.claude` if desired.
- Move or disable global `youtube-transcript` if it belongs to another project.

### Phase 5: Permissions Hardening

- Prune stale shell-fragment rules from `.claude/settings.local.json`.
- Replace broad rules with specific command prefixes used in this repo.
- Add explicit deny rules for:
    - `Read(./.env)`
    - `Read(./.env.*)`
    - `Read(./**/*secret*)`
    - `Read(./**/*key*)` if not too noisy for this repo.
- Consider denying `Bash(curl *)` and using `WebFetch(domain:...)` for controlled web access.

## Proposed First Fix Batch

This first batch is intentionally small and should not remove files:

1. Fix invalid agent colors.
2. Fix `/.claude/...` references to project-relative `.claude/...` paths.
3. Fix `seobeast-audit` frontmatter typo.
4. Fix stale `fix-bug` changelog path.
5. Fix worker path references in `research_codebase_generic.md`.
6. Add minimal frontmatter to root commands without adding `allowed-tools`.

## Changes Applied In This Pass

- Added this review doc at `docs/technical/reviews/claude-config-audit-2026-04-13.md`.
- Fixed invalid agent colors:
    - `.claude/agents/creator-distribution-strategist.md`: `magenta` -> `pink`
    - `.claude/agents/growth-activation-architect.md`: `teal` -> `cyan`
- Migrated project browser automation skills to current skill layout:
    - `.claude/skills/twitter.skill.md` -> `.claude/skills/twitter/SKILL.md`
    - `.claude/skills/instagram.skill.md` -> `.claude/skills/instagram/SKILL.md`
    - `.claude/skills/linkedin.skill.md` -> `.claude/skills/linkedin/SKILL.md`
    - `.claude/skills/create-skill.md` -> `.claude/skills/create-skill/SKILL.md`
- Added frontmatter to the `twitter`, `instagram`, and `linkedin` skills.
- Shortened `.claude/skills/supabase/SKILL.md` description to avoid routing truncation.
- Updated root social commands to reference the new skill paths.
- Fixed stale references:
    - `/docs/BUGFIX_CHANGELOG.md` -> `/docs/reports/bug-fixes-summary.md`
    - `/apps/worker/src/jobs/` and `/apps/worker/src/queues/` -> current worker paths.
- Added minimal frontmatter to root commands. No `allowed-tools` were added.
- Fixed global `~/.claude/skills/seobeast-audit/SKILL.md`: `user-invokable` -> `user-invocable`.

## Open Decisions

- Should `create_plan.md` be deleted, archived, or converted to a command?
- Should `social-warmup-template/.claude/skills/*.skill.md` be migrated too, or left as template source material?
- Should permission hardening happen in this same cleanup branch, or as a separate pass to avoid changing development workflow unexpectedly?
