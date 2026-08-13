<!-- apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md -->

# Runtime Skill Authoring Guide

Rules for creating and structuring **agentic-chat runtime skills** (`definitions/<id>/SKILL.md`). Not for Claude Code skills — those live in `.claude/skills/` and follow `create-skill`.

Derived from: `docs/research/youtube-library/SKILL_QUALITY_AUDIT_2026-06-10.md` (the delta test), `SKILL_ARCHITECTURE_EVALUATION_2026-06-10.md` (sizing rules + eval evidence), `SKILL_GAP_ANALYSIS_AND_ACQUISITION_PLAN_2026-06-11.md` (weak-model ingredients). Linter: `skill-authoring-validation.ts`; parser: `markdown-skill.ts`.

## The two governing principles

1. **The delta test.** A skill earns existence only if an agent's output on a concrete task is materially better with it loaded. The base model already knows generic best practices — a skill carries what the model wouldn't reliably produce: decision rules, thresholds, named procedures, refusal rules, output contracts.
2. **One-load primary job.** Every `skill_load` / `skill_reference_load` is a full agent-loop round trip (latency + a context re-read). The shell must contain everything the skill's _primary job_ needs in a single `skill_load(full)`. Hops are the expensive unit; tokens within a hop are cheap.

## The 7 weak-model ingredients (what actually makes an agent smarter)

The whole system is designed so less-capable models perform like strong ones. Audit every skill against this list — prose principles don't count:

1. **Worked examples** — a completed, contract-perfect exemplar to imitate (inside `## Examples`). The single strongest lever. Manufacture them via the eval harness: strong-model run on the golden task → check markers → trim to ~50–80 lines → embed.
2. **Named patterns + closed vocabularies** — "the Delay pass," "fake warmth," "AI gradient." A weak model can match what it can't derive.
3. **Numeric thresholds + closed scales** — replace judgment with lookup (≥4.5:1, ≤170 words, spacing ∈ {4,8,…}).
4. **Templates and scaffolds** — fill-in-the-blank beats generate-from-scratch.
5. **Decision trees + routing tables** — replace inference with branching.
6. **Refusal + escalation rules** — explicit "refuse when X, route to Y." Weak models over-comply; this is the guardrail that matters most.
7. **Output contracts + stop conditions** — `## Contract` is parsed into `output_contract` and ships on every load format.

## Canonical block structure (the linter's contract)

The body is a sequence of H2 blocks drawn from a closed menu, **in this fixed order**:

`## Identity` → `## Activation` → `## Judgment` → `## Procedure` → `## Routing` → `## Contract` → `## Policy` → `## Knowledge` → `## Related Tools` → `## Examples` → `## Provenance`

A skill is **migrated** iff its body has `## Identity` — author every new skill migrated. On migrated skills the block linter is all hard errors:

- Any H2 outside the menu → `unknown_block`. Subordinate material goes under H3 _inside_ the owning block, never a new H2. (One tolerated spelling: `## Worked Example(s)` folds into the Examples slot.)
- Each block at most once (`duplicate_block`); menu order enforced (`blocks_out_of_order`).
- Required/forbidden blocks depend on `skill_type` (`missing_required_block` / `forbidden_block_present`). Identity + Activation are required everywhere; Related Tools + Examples are optional everywhere:

| skill_type    | Also required                          | Forbidden                    |
| ------------- | -------------------------------------- | ---------------------------- |
| procedure     | Procedure, Contract                    | —                            |
| strategy      | Judgment                               | —                            |
| reference     | Knowledge, Provenance                  | Judgment, Procedure, Routing |
| resource      | Contract                               | Routing                      |
| policy        | Policy                                 | Procedure, Routing           |
| orchestration | Judgment, Procedure, Routing, Contract | —                            |

- **Orchestration extras:** frontmatter `dependencies` must be non-empty; a route marker is an arrow followed by a backticked id — `` → `skill_id` `` (backticks required). Every Procedure route marker must match a dependency (`dangling_route`), and every dependency must appear as a route marker or in the Routing block (`orphan_dependency`).

**Legacy aliases (unmigrated skills only).** Old headings still parse on pending skills — `## When to Use`→Activation, `## Workflow`→Procedure, `## Guardrails`→Policy, `## Notes`→Provenance, `## Output`/`## Output Contract`→Contract — but on a migrated skill they are `unknown_block` errors. Never author new content with them.

## Frontmatter (what's load-bearing)

Fields the runtime parses: `name`, `description`, `catalog_line`, `skill_type`, `altitude`, `activation`, `dependencies`, `recommended_load_format`, `parent_id`, `depth`, `preserve_markdown`, `legacy_paths`, `child_skills`, `reference_modules`. Unknown keys are never rejected (Zod passthrough) but nothing reads them.

Migrated skills **must** declare, or the linter errors (`migrated_missing_frontmatter` / `migrated_requires_preserve_markdown`):

- `skill_type:` one of `procedure | strategy | reference | resource | policy | orchestration` — drives the required-block matrix
- `altitude:` `task | domain | meta`
- `activation:` `always_on | progressive | invoked`
- `preserve_markdown: true` — Identity/Judgment/Routing/Knowledge have no structured-field equivalent; only the raw-body render path serves them, so without this the model never sees them

Other load-bearing facts:

- `description` is the entire discovery API (the catalog table row). Write it in user-request vocabulary; no two siblings may claim the same phrasing. `catalog_line` (≤140 chars) is the short trigger line in the always-on catalog table.
- Body sections parsed into the short payload: `## Activation` (bullets), `## Procedure` (ordered list), `## Related Tools` (backticked bullets), `## Policy` (bullets), `## Examples` (### + bullets), `## Provenance` (bullets), `## Contract` (raw text → `output_contract`, ships on both formats). Everything else — Identity, Judgment, Routing, Knowledge, worked examples, tables — is served only via `preserve_markdown` + `full` loads.
- `child_skills` / `reference_modules` entries need `id`, `summary`, and non-empty `when_to_load` — an empty `when_to_load` draws a `linked_resource_without_load_rule` warning.
- Reference files auto-bundle from `definitions/<id>/references/*.md` (`import.meta.glob`); declared paths must be `references/….md` (no absolute paths, no `..`).

## Structure decision tree: inline vs. reference vs. child skill

Work top-down. Default is **inline in the shell**.

**1. Does the material fire on every standard use of the skill?**
→ **Inline in the shell.** A reference with `when_to_load: always` is shell body in disguise and costs a pointless round trip every use. (2026-06-11 fold: taste scorecard, reply taxonomy, compiler packaging+lint, learning-review diagnostics, offer-lab rubrics all moved inline for exactly this reason.)

**2. Is it genuinely conditional — per-mode, per-platform, failure-triggered, diagnosis-only?**
→ **Reference module.** The canonical pattern is `going_viral`: four platform deep-dives, and any task needs exactly one. Other valid triggers: "only when dimensions 1/2/7 fail" (taste fake-warmth), "only for ship decisions" (algorithm dual-audit). A reference must also be **substantial** (roughly ≥40 lines of rules/templates) — a thin conditional reference isn't worth its hop; inline it.

**3. Is it a separately _discoverable job_ with its own primary workflow, real depth, and its own user phrasing?**
→ **Child skill** (`parent_id` + `depth`). The bar is ALL THREE:

- **Own job:** a user would ask for this directly, in words that differ from the parent's catalog description ("update task status" vs "manage tasks" — the `task_state_updates` pattern).
- **Own depth:** it carries its own ingredient-1–7 machinery. A child under ~4KB with no unique decision rules fails the bar — deepen it with sources or fold it into the parent. "Discoverable and empty" is the worst quadrant: it costs a catalog row in every system prompt AND a wasted load.
- **Own boundary:** the parent can escalate to it by name without duplicating its content (escalations are tags, not loads).

**4. Is the shell now over ~20KB with no conditional seam?**
→ **Keep the big shell.** `hook_craft_short_form` (18.7KB, zero refs) is eval-validated at 12/12. A big coherent shell beats a lean shell with mandatory refs. Split only when a genuine conditional seam exists.

## Sizing targets

| Artifact         | Target                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Shell (SKILL.md) | 8–20KB (~2–5k tokens); primary job complete in one load                                     |
| Hop budget       | Primary job = 1 load · + one conditional branch = 2 · routine task needing 3+ = restructure |
| Reference module | ≥40 lines, genuinely conditional `when_to_load`                                             |
| Child skill      | ≥4KB of own machinery + own discovery phrasing, or don't create it                          |
| Worked example   | 50–80 lines, contract-perfect, elide repetition with "(…N more in the same shape…)"         |

**150-line root warning.** A root skill whose body exceeds 150 lines with no `child_skills` and no `reference_modules` draws an `oversized_root_skill` warning (`DEFAULT_ROOT_LINE_WARNING_THRESHOLD`). When a root shell grows past that, split its conditional material into references per the decision tree — or link the children it already implies — rather than shipping the warning.

## Birth checklist for a new runtime skill

```
□ Delta test: name 3 things the base model wouldn't do unprompted
□ Ingredients audit: which of the 7 does it carry? (1, 3, 6, 7 near-mandatory)
□ Frontmatter: skill_type + altitude + activation + preserve_markdown: true
□ description in user vocabulary, collision-checked against siblings; catalog_line ≤140 chars
□ Canonical blocks only, in menu order; required set for the skill_type (matrix above)
□ ## Contract with output shape + stop conditions
□ ## Policy incl. at least one refusal/escalation rule with a named route
□ Structure per the decision tree (inline > reference > child); >150-line root ⇒ references or split
□ Worked example inside ## Examples (manufacture via eval harness if no natural exemplar)
□ evals.md with 1–3 golden tasks (fixtures embedded, binary delta markers, expected load path)
□ Wire: wrapper .skill.ts import + registry.ts ALL_SKILLS + domains/catalog.ts useWhen
□ Draft stamped: status: registered, promoted_to, last_promoted
□ pnpm vitest run src/lib/services/agentic-chat/tools/skills/ — green, zero authoring errors or warnings
```

## Maintenance triggers

- Shell creeping past ~20KB → look for a _conditional_ seam; if none, leave it.
- A reference whose load log shows it loading on every use → fold it in.
- A child skill that evals at NO DELTA or stays under 4KB after two enrichment passes → fold into parent.
- Eval Results log shows a marker no run ever hits → the rule is too vague; operationalize or cut it.
