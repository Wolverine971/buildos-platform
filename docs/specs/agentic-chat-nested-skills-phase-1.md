<!-- docs/specs/agentic-chat-nested-skills-phase-1.md -->

# Agentic Chat Nested Skills Phase 1

Status: phase 3 implemented
Started: 2026-05-15
Owner: BuildOS agentic chat

## Goal

Add first-class support for layered skill metadata without changing the default runtime behavior. A root skill should remain the primary operating playbook. Child skills and reference modules are optional depth handles that the agent can load only when the current task needs niche, mode-specific, or high-context guidance.

## Product Rule

Keep the root skill self-sufficient. Create a child skill only when a niche workflow needs enough extra context, examples, research, or guardrails that including it would make the root harder to use for normal cases.

Default behavior:

- Do not create child skills automatically.
- Do not load child skills automatically after loading a root skill.
- Keep the information needed for ordinary execution in the root skill.
- Pull out a child skill only when a thread becomes large, niche, or fragile enough to justify its own playbook.
- Prefer reference modules for long research, source maps, templates, and examples that are not themselves executable decision workflows.

## Phase 1 Scope

- Add typed metadata for child skills and reference modules.
- Parse optional child/reference metadata from runtime `SKILL.md` frontmatter.
- Return child/reference indexes from `skill_load` payloads.
- Update prompt policy so agents load roots first and only load deeper modules when justified.
- Preserve context by returning indexes, not nested skill contents.
- Add tests around parsing, payload shape, prompt rules, and model payload compaction.

## Not In Phase 1

- Automatic child-skill activation.
- Recursive or deeply nested skill loading.
- UI for browsing skill trees.
- Promoting draft research skills into runtime skills.
- External skill registry ingestion.

## Split Criteria

Create a child skill when at least two of these are true:

- The material is mode-specific and not needed for most root-skill invocations.
- The niche path has its own decision workflow, output contract, or validation loop.
- The root would exceed roughly 150-250 lines or become harder to scan if the material stayed inline.
- The niche path needs many examples, source-specific rules, or specialized failure modes.
- The agent should be able to ignore the niche path entirely for ordinary requests.

Prefer a reference module instead of a child skill when the content is mostly source material, citations, templates, examples, source maps, or background research.

## Initial Implementation Notes

Current system state:

- Runtime skills are flat `SkillDefinition` records.
- `skill_load` supports `short` and `full` formats.
- The lite prompt already exposes a compact skill catalog and discourages unnecessary skill loads.
- Stream payload compaction currently treats skill payloads as gateway metadata and should preserve enough full-skill content for deliberate `format: full` loads.

## Phase 1 Checklist

- [x] Extend skill types with `childSkills` and `referenceModules`.
- [x] Parse `child_skills` and `reference_modules` from markdown frontmatter.
- [x] Add child/reference indexes to `skill_load` payloads.
- [x] Render child/reference indexes in full skill markdown.
- [x] Update prompt policy for root-first loading.
- [x] Preserve child/reference indexes through model payload compaction.
- [x] Add focused tests.
- [x] Run focused skill and prompt test suite.

## Verification

2026-05-15:

```bash
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat/tools/skills/skill-load.test.ts src/lib/services/agentic-chat-v2/skill-activity.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts
```

Result: 4 test files passed, 34 tests passed.

## Open Decisions

- Resolved in Phase 3: executable child skills are registered as normal skills with `parent_id` and `depth`, and loaded through `skill_load`.
- Whether references should be fetched by `skill_load` options or by a separate reference-loading tool.
- Whether runtime skill authoring should use BuildOS-specific frontmatter directly or keep custom metadata under the Agent Skills `metadata` field for cross-client compatibility.

## Phase 2 Scope

Phase 2 adds one bounded way to go deeper after a root skill has exposed its indexes:

- Add a `skill_reference_load` gateway tool for declared reference modules.
- Only load references declared in the registered root skill metadata.
- Only resolve reference paths inside that skill's `definitions/<skill_id>/` directory.
- Keep child skills on the existing `skill_load` path; child skills should be registered as normal skills when they become executable playbooks.
- Preserve root-first behavior. Loading a root skill still does not automatically load any child or reference content.

## Phase 2 Checklist

- [x] Add a reference module loader.
- [x] Add `skill_reference_load` gateway tool definition and executor wiring.
- [x] Include `skill_reference_load` in gateway surface and read/discovery classification.
- [x] Preserve reference payloads through model payload compaction.
- [x] Add one small declared runtime reference module for end-to-end coverage.
- [x] Add focused tests.
- [x] Run focused skill, prompt, gateway, and compaction test suite.

## Phase 2 Verification

2026-05-15:

```bash
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat/tools/skills/skill-load.test.ts src/lib/services/agentic-chat/tools/skills/skill-reference-load.test.ts src/lib/services/agentic-chat-v2/skill-activity.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts src/lib/services/agentic-chat-v2/exact-entity-id.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
```

Result: 9 test files passed, 60 tests passed.

## Phase 3 Scope

Phase 3 makes executable child skills first-class registered skills:

- Register child skills as normal `SkillDefinition` records with `parent_id` and `depth`.
- Keep child skills loadable through the existing `skill_load` tool.
- Show root skills and child skills separately in the prompt catalog so roots remain the default.
- Enrich root `skill_load` payloads with registered child-skill handles, even when a child is registered independently.
- Add one focused runtime child skill for end-to-end coverage.

## Phase 3 Checklist

- [x] Add one registered child skill under `task_management`.
- [x] Add registry helpers for root skills and child skills.
- [x] Enrich root skill payloads with registered child handles.
- [x] Split the prompt skill catalog into root and child sections.
- [x] Add focused tests.
- [x] Run focused skill, prompt, gateway, and compaction test suite.

## Phase 3 Verification

2026-05-15:

```bash
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat/tools/skills/skill-load.test.ts src/lib/services/agentic-chat/tools/skills/skill-reference-load.test.ts src/lib/services/agentic-chat-v2/skill-activity.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts src/lib/services/agentic-chat-v2/exact-entity-id.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
```

Result: 9 test files passed, 61 tests passed.

## Phase 4 Scope

Phase 4 adds authoring validation so the skill tree can grow without losing the root-first discipline:

- Validate registered skill IDs are unique.
- Validate child skills reference an existing parent and declare the expected depth.
- Detect parent cycles before nested skills become deeper.
- Validate child and reference handles are unique and include `when_to_load` guidance.
- Validate reference module paths stay in safe `references/*.md` paths.
- Warn when a root skill gets large without child skills or reference modules, so niche threads can be split intentionally.
- Keep validation non-runtime-blocking for now; tests enforce the current registered tree has no authoring errors.

## Phase 4 Checklist

- [x] Add `bodyLineCount` metadata when parsing markdown skills.
- [x] Add skill authoring validation utilities.
- [x] Validate parent/depth wiring and cycle risks.
- [x] Validate linked resource handles and reference paths.
- [x] Add oversized-root warning support.
- [x] Add tests for the current registry and failure cases.
- [x] Run focused skill, prompt, gateway, and compaction test suite.

## Phase 4 Verification

2026-05-15:

```bash
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat/tools/skills/skill-authoring-validation.test.ts src/lib/services/agentic-chat/tools/skills/skill-load.test.ts src/lib/services/agentic-chat/tools/skills/skill-reference-load.test.ts src/lib/services/agentic-chat-v2/skill-activity.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts src/lib/services/agentic-chat-v2/exact-entity-id.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
```

Result: 10 test files passed, 65 tests passed.
