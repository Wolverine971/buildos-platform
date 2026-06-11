<!-- apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md -->

# Runtime Skill Authoring Guide

Rules for creating and structuring **agentic-chat runtime skills** (`definitions/<id>/SKILL.md`). Not for Claude Code skills — those live in `.claude/skills/` and follow `create-skill`.

Derived from: `docs/research/youtube-library/SKILL_QUALITY_AUDIT_2026-06-10.md` (the delta test), `SKILL_ARCHITECTURE_EVALUATION_2026-06-10.md` (sizing rules + eval evidence), `SKILL_GAP_ANALYSIS_AND_ACQUISITION_PLAN_2026-06-11.md` (weak-model ingredients).

## The two governing principles

1. **The delta test.** A skill earns existence only if an agent's output on a concrete task is materially better with it loaded. The base model already knows generic best practices — a skill carries what the model wouldn't reliably produce: decision rules, thresholds, named procedures, refusal rules, output contracts.
2. **One-load primary job.** Every `skill_load` / `skill_reference_load` is a full agent-loop round trip (latency + a context re-read). The shell must contain everything the skill's _primary job_ needs in a single `skill_load(full)`. Hops are the expensive unit; tokens within a hop are cheap.

## The 7 weak-model ingredients (what actually makes an agent smarter)

The whole system is designed so less-capable models perform like strong ones. Audit every skill against this list — prose principles don't count:

1. **Worked examples** — a completed, contract-perfect exemplar to imitate (`## Worked Example`). The single strongest lever. Manufacture them via the eval harness: strong-model run on the golden task → check markers → trim to ~50–80 lines → embed.
2. **Named patterns + closed vocabularies** — "the Delay pass," "fake warmth," "AI gradient." A weak model can match what it can't derive.
3. **Numeric thresholds + closed scales** — replace judgment with lookup (≥4.5:1, ≤170 words, spacing ∈ {4,8,…}).
4. **Templates and scaffolds** — fill-in-the-blank beats generate-from-scratch.
5. **Decision trees + routing tables** — replace inference with branching.
6. **Refusal + escalation rules** — explicit "refuse when X, route to Y." Weak models over-comply; this is the guardrail that matters most.
7. **Output contracts + stop conditions** — `## Output` is parsed into `output_contract` and ships on every load format.

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

## Parser facts (what's load-bearing)

- Frontmatter read by the runtime: `name`, `description`, `parent_id`, `depth`, `preserve_markdown`, `legacy_paths`, `child_skills`, `reference_modules`. Everything else is ignored (harmless, self-documentation only).
- Body sections parsed into the short payload: `## When to Use` (bullets), `## Workflow` (ordered list; headings starting/ending with "workflow" match), `## Related Tools`, `## Guardrails`, `## Examples` (### + bullets), `## Notes`, and `## Output` / `## Output Contract` (raw text → `output_contract`, both formats).
- Any other section (`## Worked Example`, principle tables, scorecards) survives ONLY via `preserve_markdown: true` + `full` loads — set it on every content-bearing skill.
- `description` is the entire discovery API (the catalog table row). Write it in user-request vocabulary; no two siblings may claim the same phrasing.
- Reference files auto-bundle from `definitions/<id>/references/*.md` (`import.meta.glob`); declare them in frontmatter with namespaced id, summary, sharp `when_to_load`, `references/…` path.

## Birth checklist for a new runtime skill

```
□ Delta test: name 3 things the base model wouldn't do unprompted
□ Ingredients audit: which of the 7 does it carry? (1, 3, 6, 7 near-mandatory)
□ description in user vocabulary; collision-checked against siblings
□ ## When to Use / ## Workflow (steps name which section/reference applies when)
□ ## Output contract + stop conditions; preserve_markdown: true
□ ## Guardrails incl. at least one refusal/escalation rule with a named route
□ Structure per the decision tree above (inline > reference > child)
□ ## Worked Example (manufacture via eval harness if no natural exemplar)
□ evals.md with 1–3 golden tasks (fixtures embedded, binary delta markers, expected load path)
□ Wire: wrapper .skill.ts import + registry.ts ALL_SKILLS + domains/catalog.ts useWhen
□ Draft stamped: status: registered, promoted_to, last_promoted
□ pnpm vitest run src/lib/services/agentic-chat/tools/skills/ — green
```

## Maintenance triggers

- Shell creeping past ~20KB → look for a _conditional_ seam; if none, leave it.
- A reference whose load log shows it loading on every use → fold it in.
- A child skill that evals at NO DELTA or stays under 4KB after two enrichment passes → fold into parent.
- Eval Results log shows a marker no run ever hits → the rule is too vague; operationalize or cut it.
