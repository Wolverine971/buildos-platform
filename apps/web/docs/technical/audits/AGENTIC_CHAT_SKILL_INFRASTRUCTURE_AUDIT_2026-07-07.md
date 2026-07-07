<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_SKILL_INFRASTRUCTURE_AUDIT_2026-07-07.md -->

# Agentic Chat Skill Infrastructure Audit - 2026-07-07

**Companion to:** `AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md`.

**Scope:** Runtime skill capabilities only: skill corpus, `skill_search`, `skill_load`,
`skill_reference_load`, domain sensing, the skill-load gate, tool materialization from skills,
and skill observability/evals. This does not re-audit the full chat backend or the security
Wave 3 write-policy work except where the skill layer changes the risk.

**Method:** Read the current tree, not only the July 1 companion audit. The companion doc's
older O4/O5/O6/O14/O15 notes are partly stale in this working tree: skill payloads now receive
the 20k outer budget, materialization notices are buffered until after tool messages, op aliases
resolve to callable names, and same-round auto-exec revalidates newly materialized tools. The
findings below are live in the current code.

---

## Headline

You have the right **raw ingredients**: a real runtime skill corpus, source-backed markdown,
child/reference handles, related-op wiring, domain sensing, a skill-load gate, authoring lint,
and prompt eval hooks.

The weak point is that the skill layer is still mostly **advisory at runtime**. The agent can
load a skill, but the model may not receive the skill's output contract, the gate can be
satisfied by the wrong or stale skill, load format is not policy-driven, typed skill ontology is
validated but not carried into runtime, and observability cannot answer "was a required skill
actually applied?"

Short version: the infrastructure exists, but it is not yet clean enough to guarantee that
skills reliably change behavior.

---

## What is solid

- **Authoring shape is strong.** `SkillDefinition` includes ids, parent/child depth, related ops,
  guardrails, examples, reference modules, and output contracts
  (`tools/skills/types.ts:27-47`). Source markdown is parsed into runtime payloads
  (`tools/skills/markdown-skill.ts:321-337`).
- **Static hygiene exists.** The block-ontology linter validates migrated skills for canonical
  block order, required blocks, `preserve_markdown`, and orchestration dependencies
  (`skill-authoring-validation.ts:504-590`).
- **Discovery is wired.** `skill_search` filters by domain/capability/query and auto-materializes
  `skill_load` (`skill-search.ts:131-170`), while the root skill catalog is in the lite prompt
  (`build-lite-prompt.ts:706-747`).
- **A deterministic gate exists.** Domain sensing marks skill-covered turns with
  `skill_load_required` (`domain-sensing.ts:64-70`), and finalization injects one repair round
  when a gated turn tries to answer without any skill load (`repair-instructions.ts:51-95`).
- **Some live regressions are already covered.** Tests verify discoverability, related-op
  integrity, reference bundling, skill payload budget behavior, and prompt scenarios requiring
  `skill_loaded` events.

---

## Findings

### SK1. `output_contract` is built, promised, then dropped before the model sees it - HIGH, CONFIRMED

The authoring guide says `## Output` is parsed into `output_contract` and "ships on every load
format" (`AUTHORING_GUIDE.md:23-24`). `buildSkillLoadPayload` does attach it
(`skill-load.ts:193-195`). But the model-facing compaction for `type === 'skill'` copies only
`type/id/name/summary/when_to_use/workflow/related_ops/child_skills/reference_modules/guardrails/markdown/examples/notes`
and omits `output_contract` (`tool-payload-compaction.ts:172-193`).

This is worse with the current prompt default: the model is told to use `format: short` for gated
skill loads (`build-lite-prompt.ts:666`), and short loads have no markdown body
(`skill-load.ts:205-217,222-230`). So for the common path, the model gets neither the structured
`output_contract` nor the full markdown that might contain the contract.

**Impact:** Skill-loaded turns can satisfy the skill gate while losing the primary thing that
makes the output "nice and clean": the output contract. This directly contradicts the skill
authoring contract and weakens every eval whose markers live in the `## Output`/`## Contract`
block.

**Fix:**

1. Include `output_contract` in `compactGatewayMetaPayload` for `type === 'skill'`.
2. Add a targeted test: short `skill_load(ui_ux_quality_review)` survives
   `buildToolPayloadForModel` with `output_contract`.
3. Add a prompt-eval assertion type that checks contract markers, not just `skill_loaded`.

### SK2. The skill-load gate can be satisfied by the wrong skill or any stale prior skill - HIGH, CONFIRMED

The gate's "already satisfied" logic is boolean:

- any loaded-skills ledger in history disables the repair (`repair-instructions.ts:63-68`);
- any successful `skill_load` in the current turn disables it (`repair-instructions.ts:76-81`).

The ledger check is also boolean: it only checks for a system message starting with
`Previously loaded skills in this session:` (`session-service.ts:191-206`). It does not check
whether the loaded skill matches the current domain, outcome card, or recommended skill ids.

**Impact:** A user can load `cold_email_engagement_first_outreach`, then later ask for a UI audit
or video hook. If the domain gate fires, the unrelated prior ledger can satisfy the gate. In the
same turn, loading any skill, including a sibling or wrong root, satisfies the gate.

**Fix:**

1. Change `skillGate.historyHasLoadedSkillsLedger: boolean` to parsed
   `loadedSkillIds: string[]`.
2. Build `acceptableSkillIds` from `candidate_outcome_cards.default_skill_id`,
   `candidate_outcome_cards.skill_ids`, and `recommended_skill_ids`.
3. Satisfy the gate only when the loaded skill intersects `acceptableSkillIds`, or when an
   allowed parent/child relation is explicit.
4. Persist `skill_gate_required`, `expected_skill_ids`, `skill_gate_satisfied`,
   `skill_gate_satisfied_by`, and `loaded_skill_format` in turn events or `chat_turn_runs`.

### SK3. Load format is not capability-aware; the default short load is often too weak - HIGH, CONFIRMED

The tool executor defaults to `short` unless the model explicitly asks for `full`
(`tool-execution-service.ts:1018-1030`; `skill-load.ts:222-230`). The prompt reinforces that by
telling the model to default to short on active skill gates (`build-lite-prompt.ts:666`).

But the skill eval guide says usage quality includes the expected load path and explicitly warns
that short drops everything outside the parsed sections, so skills whose output contracts or
pillar tables live outside those sections need `full` (`EVALS_GUIDE.md:38-45`). The authoring
guide also says the primary job must fit in one `skill_load(full)` (`AUTHORING_GUIDE.md:11-12`).

**Impact:** The gate can force a load and still starve the model of the actual playbook. This
shows up most in craft/judgment skills: video scripts, hooks, story, cold email taste, UI review,
and growth diagnostics.

**Fix:**

1. Add `recommended_load_format: 'short' | 'full'` to skill frontmatter or derived metadata.
2. Let domain/outcome-card sensing pass the recommended format into the gate.
3. For active gates, either require `full` by default for craft/judgment skills or make short
   payloads include a compact contract + critical rules digest.
4. Add eval assertions for "loaded expected format" and "did not overload references."

### SK4. The typed skill ontology is validated but not available to runtime routing - MEDIUM-HIGH, CONFIRMED

The frontmatter schema has a meaningful ontology: `skill_type`, `altitude`, `activation`, and
orchestration `dependencies` (`skill.schema.ts:16-74`). The linter enforces the migrated skill
frontmatter trio and required blocks (`skill-authoring-validation.ts:504-590`).

But `SkillDefinition` does not carry those typed fields (`types.ts:27-47`), and
`defineMarkdownSkill` parses only parent/depth/children/references plus legacy textual sections
into runtime (`markdown-skill.ts:309-342`).

**Impact:** Runtime cannot mechanically distinguish a `policy` skill from a `procedure`, an
`orchestration` skill from a leaf, or `always_on` from `invoked`. Those distinctions are only
text inside markdown. That prevents clean policy enforcement such as "always include policy
skills for calendar writes" or "load orchestration roots before their child lenses."

**Fix:**

1. Add `skillType`, `altitude`, `activation`, and `dependencies` to `SkillDefinition` and
   `SkillHelpPayload`.
2. Parse them in `defineMarkdownSkill`.
3. Use them in search/gating: root orchestration first, policy skills as preconditions, child
   skills only after a matching root or outcome card.

### SK5. Reference-module `visibility` is metadata only - MEDIUM, CONFIRMED

Reference modules support `visibility: 'public' | 'internal'` in schema
(`skill.schema.ts:47-57`). `loadSkillReference` finds the declared module and returns its content,
then simply echoes `visibility` in the payload (`skill-reference-load.ts:58-117`). There is no
caller-surface or user-role check in the loader.

**Impact:** This is probably acceptable for authenticated internal chat, but it is not a clean
capability boundary. The same registry contains public-facing portable skill routes and internal
source maps / acquisition queues. If any external or public surface reuses `loadSkillReference`,
`visibility` will not protect internal material.

**Fix:**

1. Add a `surface: 'chat_internal' | 'public_portable' | 'external_agent'` option to
   `loadSkillReference`.
2. Enforce `visibility !== 'internal'` outside internal chat/admin surfaces.
3. Add a regression test that public portable/reference routes cannot load internal modules.

### SK6. Skill-related tools are treated as capability grants without a policy gate - MEDIUM-HIGH, CONFIRMED

`skill_load` resolves `related_ops` into `materialized_tools` (`skill-load.ts:154-167`). Tool
search exposes both read and write operations (`tool-search.ts:93-130`). `materializeGatewayTools`
then adds requested tools by name if they are enabled and not already loaded
(`gateway-surface.ts:319-349`), with no read/write/destructive distinction.

This overlaps the companion audit's S3 materialization risk, but the skill-specific issue is that
loading a skill can act as a tool-surface expansion event. Some skills legitimately need writes,
but the runtime treats "this skill mentions an op" as enough to expose the direct tool.

**Impact:** Skills are partly acting as permissions. That is not clean: a skill should provide
procedure and quality constraints; authorization should come from context scope, policy, and
confirmation state.

**Fix:**

1. Split `related_ops` into `read_ops`, `write_ops`, and `destructive_ops`, or derive the split
   from the registry and expose it in the skill payload.
2. Materialize read tools freely, but require context-policy approval for write tools and explicit
   confirmation for destructive/bulk tools.
3. Include the skill id in materialization telemetry so "skill X granted tool Y" is auditable.

### SK7. Observability cannot answer "was the skill gate required and correctly satisfied?" - MEDIUM, CONFIRMED

`DomainSensingResult` has `skill_load_required` (`domain-sensing.ts:64-70`), but the persisted
`domain_sensing_applied` event records source, domains, candidate outcome cards, recommended
skills, and gaps -- not the boolean gate state (`stream/+server.ts:3372-3378`). `chat_turn_runs`
tracks `first_skill_path`, but not expected skills, load format, gate status, or contract presence.
Prompt evals currently assert first/observed skill paths and `skill_loaded`/`done_emitted`
(`prompt-evaluator.ts:253-262`; `prompt-eval-scenarios.ts:103-110`).

**Impact:** After a bad answer you can see that a skill loaded, but not whether a skill was
required, whether the loaded skill matched the requirement, whether the required format loaded,
or whether the contract made it into the model payload.

**Fix:**

1. Add telemetry fields/events:
   `skill_gate_required`, `expected_skill_ids`, `expected_skill_format`,
   `loaded_skill_ids`, `loaded_skill_formats`, `skill_gate_satisfied`,
   `skill_gate_violation_repaired`, `skill_contract_present`.
2. Teach prompt evals to assert expected format/reference usage and marker compliance.
3. Add an admin query: "skill-covered turns with no matching skill, wrong format, or no
   contract."

---

## Recommended next pass

Do these before broadening the skill corpus:

1. **Patch the model-facing payload:** preserve `output_contract` for skill payloads and add tests.
2. **Make the gate relevance-aware:** wrong skill and stale unrelated ledger must not satisfy it.
3. **Make load format explicit:** skill/outcome-card metadata should say whether `short` is enough.
4. **Promote typed frontmatter to runtime:** `skill_type`, `activation`, `altitude`, and
   `dependencies` should be available to routing and policy code.
5. **Add skill-gate telemetry:** measure required vs. satisfied vs. contract-present.

After that, skills become a real capability layer instead of a high-quality hint library.
