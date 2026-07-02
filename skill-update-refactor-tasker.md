<!-- skill-update-refactor-tasker.md -->

# Handoff: Canonical SKILL.md Block Ontology Refactor

**To:** Claude Code (operating inside the BuildOS repo)
**From:** DJ (via a planning session with Claude)
**Status:** Ready to execute. Read this whole doc before touching a file.
**Golden example:** `going_viral/SKILL.md` (rewritten) — the reference implementation of everything below.

---

## 0. TL;DR — what you are doing

BuildOS skills currently work but are **structurally a mesh**: different _types_ of content (steps, heuristics,
facts, routing, policy) are interleaved inside the same sections, and orchestration (who-owns-what) is narrated
across the whole file instead of declared in one place. This makes skills hard to read, hard to keep DRY, and prone
to rotting back into soup as they grow.

You will impose a **canonical block ontology**: a fixed frontmatter schema + a fixed, ordered menu of typed body
blocks, where **each block answers exactly one question and no concept is taught twice**. A skill becomes a
_selection_ from that menu. You will then build **build-time validation** so skills can't silently drift back into a mesh.

This is a **structural refactor, not a content rewrite.** Preserve every claim, source, and reference verbatim in
meaning. Do not "improve" the substance. See §7 Non-Goals — this is the rule most likely to be violated.

---

## 1. The problem (why we're doing this)

Take `going_viral/SKILL.md` as it exists today. The _topics_ are cleanly separated — that's not the issue. The issue
is two things:

1. **Types are interleaved inside sections.** A single "Workflow" step simultaneously states _what to do_
   (procedure) and _who owns it_ (orchestration: "defer to sibling X"). Steps 2–8 each end in a defer-to-X. Anything
   reading the file has to disentangle intent from ownership on every line.

2. **Orchestration is smeared across the whole file** instead of declared once. `going_viral` is _fundamentally_ an
   orchestrator — it calls itself a "per-piece integration layer" whose job is composing siblings — but that role is
   implicit and scattered rather than named and structural.

That combination is "the mesh." The fix has two levels:

- **Level 1 — type the skill.** Name its dominant type in frontmatter (`going_viral` → `orchestration`). The file's
  shape then follows from the type: an orchestrator is thin on its own knowledge and heavy on routing, with its
  dependency graph _declared, not narrated_.
- **Level 2 — type every block.** Stop letting each skill invent its own headers. Give it a fixed menu of typed
  blocks in a fixed order, each block pure. The mesh literally cannot re-form, because no concept can be taught in
  two places.

---

## 2. Core concepts (the thinking behind the schema)

### 2.1 Skill vs. tool

- **Tool** = a discrete, callable function invoked at runtime with arguments (`web_search`, `read_file`). Atomic,
  closed, deterministic. _You call it._
- **Skill** = context/strategy/knowledge that shapes _how_ the model wields tools it already has. Open, adaptable.
  _The model reads and adapts it._
- **Heuristic for the boundary:** make it a **tool** when the action is discrete, deterministic, and just needs
  arguments; make it a **skill** when the value is in context, judgment, sequencing, or assets. A "technique" skill
  that ships a script blurs the line on purpose — that's fine; it's still a skill (the model reads instructions that
  say "run this").

### 2.2 The six skill families (what a skill primarily supplies)

Every skill mostly answers **one** of these verbs. Naming the verb types the skill.

| Family            | Verb      | Supplies                                                             | Authoring style            |
| ----------------- | --------- | -------------------------------------------------------------------- | -------------------------- |
| **procedure**     | _do_      | ordered, deterministic steps; runbook with checkpoints               | ordered steps              |
| **strategy**      | _decide_  | heuristics, decision criteria, prioritization; playbook              | principles / branches      |
| **reference**     | _know_    | declarative grounding — schemas, ontology, API conventions, glossary | dense facts, no flow       |
| **resource**      | _use_     | payload files — templates, scaffolds, boilerplate, brand tokens      | thin instructions          |
| **policy**        | _comply_  | constraints, standards, definition-of-done, security rules           | normative rules            |
| **orchestration** | _compose_ | planning, decomposition, delegation, sequencing other skills         | routing + dependency graph |

Dominant type ≠ monogamy. `going_viral` is an orchestrator that _also_ owns the seven tensions (a judgment spine no
sibling holds). That's expected. Pick the **dominant** type; the schema still lets a skill carry a secondary block.

### 2.3 The cross-cutting axes (why "type" felt slippery to DJ)

A skill is a point across several axes; the family above is just the "dominant content" view. Record these in
frontmatter so the compound description is honest instead of forced into one bucket:

- **altitude:** `task` ("make a docx") → `domain` ("financial modeling") → `meta` ("plan and delegate").
- **activation:** `always_on` vs. `progressive` (description matched → body loaded → bundled files lazy-loaded) vs.
  `invoked` (explicitly called). Reference skills benefit most from deep lazy-loading (large); policy skills usually
  want to sit high in context.
- **payload (informational, not a required field):** instruction-heavy / script-heavy / asset-heavy / data-heavy.
  Script-heavy is where a skill starts turning into a tool.

### 2.4 Two structural laws

- **One concept, one owner (DRY for skills).** Each concept is taught in exactly one skill; everyone else _routes_
  to it. This is what the Routing block enforces structurally. `going_viral`'s old "do not re-teach sibling material"
  guardrail was this rule stated as a reminder — the schema makes it structural instead of hope-based.
- **Stability/volume partition (SKILL.md vs. references).** `SKILL.md` holds the **stable spine** (identity,
  judgment, routing, contract, policy). `references/` holds the **volatile and voluminous** detail (dated algorithm
  facts, long procedures, big tables). The split is by _stability and volume, not topic_ — which is why
  `going_viral`'s seven tensions stay in SKILL.md (stable, central) but the Mosseri algorithm facts live in
  `instagram.md` (volatile, dated, will rot).

### 2.5 Provenance tagging (promote this — it's the crown jewel)

`references/instagram.md` already does the most sophisticated thing in the whole system: every claim carries a
confidence/source tag (**PRIMARY** / **practitioner** / **internal-default**) plus an explicit **REMOVED / CORRECTED**
audit trail. This makes stale facts _visibly_ stale instead of silently wrong. **Promote it to a system-wide rule:**
every claim in a `Knowledge` block or a reference module carries a source tag. This is arguably worth more than the
reorganization — do not lose it during migration.

---

## 3. The canonical schema

### 3.1 Frontmatter (the contract)

```yaml
---
name: <Human Name>
description: >-                      # unchanged role: the TRIGGER. what it does AND when to use it.
    <one dense paragraph>
skill_type: orchestration            # REQUIRED: procedure | strategy | reference | resource | policy | orchestration
altitude: domain                     # REQUIRED: task | domain | meta
activation: progressive              # REQUIRED: always_on | progressive | invoked
parent_id: <id | null>               # existing
depth: <int>                         # existing
preserve_markdown: true              # existing
dependencies:                        # REQUIRED for orchestration; optional otherwise. Machine-readable routing.
    - id: <sibling_skill_id>
      owns: <one line: what that skill is the single owner of>
reference_modules: [...]             # existing shape, unchanged — keep as-is where present
legacy_paths: [...]                  # existing
path: <repo path to this SKILL.md>   # existing
---
```

Only **four things are new**: `skill_type`, `altitude`, `activation`, `dependencies`. Everything else already exists
in your files. Do not remove existing frontmatter keys — the loader may depend on them (see §8 Risks).

### 3.2 The body block ontology (fixed menu, fixed order)

Nine blocks. Each answers one question. A skill includes the blocks it needs, **always in this order**, and never
invents a header outside this menu:

| #   | Block          | Question it answers            | Notes                                                 |
| --- | -------------- | ------------------------------ | ----------------------------------------------------- |
| 1   | **Identity**   | what is this + its type        | one paragraph; state skill_type + altitude in prose   |
| 2   | **Activation** | when to load / not / escalate  | the old "When to Use" + escalation map                |
| 3   | **Judgment**   | how to decide when it branches | heuristics, decision criteria, the "editorial spine"  |
| 4   | **Procedure**  | the ordered steps              | sequence + intent ONLY — stripped of who-owns-what    |
| 5   | **Routing**    | who owns what                  | the dependency map, declared once; steps reference it |
| 6   | **Contract**   | the output shape               | the old "Output"                                      |
| 7   | **Policy**     | what's required / forbidden    | the old "Guardrails"                                  |
| 8   | **Knowledge**  | stable declarative grounding   | short + stable only; volatile/voluminous → references |
| 9   | **Provenance** | sources, maintainers, tags     | the old "Notes" + the provenance standard             |

**The single highest-leverage edit is #4 vs #5:** pull routing OUT of the procedure. Procedure keeps _sequence and
intent_; Routing holds _who owns what_, declared once. In the procedure, a routed step just carries a `→ <skill_id>`
marker and states intent; the Routing table resolves ownership. This is the specific move that kills the mesh.

### 3.3 Which blocks are required by skill_type

Not every skill needs every block. Validation (§6) enforces this matrix. `R` = required, `·` = optional, `✗` = forbidden.

| Block \ Type | procedure | strategy | reference | resource | policy | orchestration |
| ------------ | :-------: | :------: | :-------: | :------: | :----: | :-----------: |
| Identity     |     R     |    R     |     R     |    R     |   R    |       R       |
| Activation   |     R     |    R     |     R     |    R     |   R    |       R       |
| Judgment     |     ·     |    R     |     ✗     |    ·     |   ·    |       R       |
| Procedure    |     R     |    ·     |     ✗     |    ·     |   ✗    |       R       |
| Routing      |     ·     |    ·     |     ✗     |    ✗     |   ✗    |       R       |
| Contract     |     R     |    ·     |     ·     |    R     |   ·    |       R       |
| Policy       |     ·     |    ·     |     ·     |    ·     |   R    |       ·       |
| Knowledge    |     ·     |    ·     |     R     |    ·     |   ·    |       ·       |
| Provenance   |     ·     |    ·     |     R     |    ·     |   ·    |       ·       |

Key rules the matrix encodes: a `reference` skill **cannot** have Procedure/Routing/Judgment (it's pure _know_);
an `orchestration` skill **must** have Routing + dependencies; a `policy` skill **cannot** have Procedure.

---

## 4. The golden example

`going_viral/SKILL.md` has been rewritten into this schema and ships alongside this handoff. Read it before migrating
anything else — it demonstrates every rule above:

- `skill_type: orchestration`, `altitude: domain`, `activation: progressive`, and machine-readable `dependencies`.
- The old Workflow split into **Procedure** (sequence + intent, `→` markers) and **Routing** (the ownership table).
- The seven tensions + sharing psychology moved into **Judgment** (owned here, nowhere else).
- **Knowledge** deliberately thin — it points to the references instead of duplicating platform facts.
- `references/instagram.md` cited as the **canonical provenance pattern** every reference module should follow.

Treat it as the acceptance bar: a migrated skill is "done" when it reads like this one.

---

## 5. Migration procedure (per skill)

Do this for one skill at a time. Do not batch-rewrite.

1. **Classify.** Read the skill. Assign its **dominant** `skill_type`, `altitude`, `activation`. If it looks
   multi-type, pick the dominant verb (§2.2) and note the secondary in a comment — do not split the skill yet.
2. **Extract dependencies.** List every place the skill defers to, re-teaches, or overlaps another skill. Each becomes
   a `dependencies:` entry (`id` + one-line `owns`). If two skills teach the same concept, flag it — that's a DRY
   violation to resolve, not encode.
3. **Sort existing content into the nine blocks.** Every existing paragraph maps to exactly one block. If a paragraph
   serves two blocks, it's a mesh seam — split it.
4. **Perform the #4/#5 split.** Walk the procedure/workflow. For each step: keep sequence + intent in **Procedure**
   with a `→ <id>` marker; move the "who owns it" into the **Routing** table. This is the core move.
5. **Thin the Knowledge block.** Anything volatile (dated facts, changing thresholds) or voluminous (big tables, long
   enumerations) moves to a reference module. Only short + stable + owned-here declarative content stays.
6. **Apply provenance tags.** Every surviving Knowledge claim and every reference-module claim gets a source tag
   (§2.5). Preserve any existing REMOVED/CORRECTED audit trail verbatim.
7. **Order the blocks** into the canonical sequence and delete any header not in the menu (fold its content into the
   right block).
8. **Validate** against the schema (§6). Fix until green.
9. **Diff-check for fidelity.** Confirm no claim, source, or reference was dropped or altered in substance (§7).

---

## 6. Validation & enforcement (build this so it can't rot back)

Reorganizing once is tidying. The durable win is a validator that fails the build when a skill drifts. Build two things:

### 6.1 `skill.schema.ts` (Zod)

- Enum `skill_type`, `altitude`, `activation`.
- `dependencies: z.array({ id, owns }).optional()`, but **`.refine`**: if `skill_type === "orchestration"`,
  `dependencies` must be non-empty.
- Validate `reference_modules` shape where present.
- Parse frontmatter and fail on unknown/missing required keys — but **allow existing keys** so nothing breaks (§8).

### 6.2 A markdown block linter

- Parse H2 headers; assert they're all in the canonical menu and in canonical order.
- Enforce the **required-by-type matrix** (§3.3): required blocks present, forbidden blocks absent.
- For `orchestration`: assert a **Routing** block exists and every `→ <id>` marker in Procedure resolves to a
  `dependencies` entry (and vice versa — no orphan dependencies, no dangling routes).
- For `reference` skills and reference modules: assert every claim line carries a provenance tag (or is inside an
  explicit un-tagged narrative block).
- Wire it into CI / pre-commit so a mesh can't merge.

**Payoff of typed blocks beyond tidiness:** the loader can load the spine always and lazy-load heavy blocks only when
the skill fires (finer progressive disclosure, real token savings); the build can validate structure; and the
dependency graph can be built straight from frontmatter so you can _see_ the skill system as it grows.

---

## 7. Non-goals (do NOT do these)

- **Do not rewrite content.** This is structural. Every claim, number, source, example, and reference survives with
  its meaning intact. Moving a paragraph between blocks is fine; rephrasing its substance is not.
- **Do not drop the provenance/audit trail.** The REMOVED/CORRECTED notes in `instagram.md` are load-bearing. Keep them.
- **Do not merge or split skills** on your own initiative during this pass. If you find a DRY violation (two skills
  own one concept) or a skill that's really two skills, **flag it in the report** for DJ to decide — don't act.
- **Do not remove existing frontmatter keys** (`parent_id`, `depth`, `preserve_markdown`, `legacy_paths`, `path`,
  `reference_modules`). Only add the four new ones.
- **Do not touch the loader's behavior** without explicit sign-off (§8).
- **Do not invent new block types.** The menu is fixed at nine. If content doesn't fit, it belongs in a reference or
  it's a sign the skill is mis-typed — flag it.

---

## 8. Risks & pre-flight checks (do these FIRST)

1. **Loader/parser compatibility — highest risk.** Something already parses this frontmatter and loads these files.
   Before adding fields, **find and read the loader** (start at
   `apps/web/src/lib/services/agentic-chat/tools/skills/` and trace how `SKILL.md` + `reference_modules` are read).
   Confirm that adding unknown frontmatter keys (`skill_type`, etc.) is non-breaking. If the loader is strict about
   keys, patch it to accept-and-ignore the new fields _before_ migrating any skill. **Report what you find before
   proceeding.**
2. **Reference-module frontmatter — DECIDED: add lightweight frontmatter (DJ, 2026-07-01).** Reference modules get
   their own lightweight YAML frontmatter. The loader now strips it before serving content (see the loader note
   below), so this is safe to roll out. Canonical shape:

    ```yaml
    ---
    reference_id: going_viral.instagram # must match the id declared in the parent SKILL.md `reference_modules`
    parent_skill: going_viral # the owning skill id
    provenance_required: true # asserts every claim in this file carries a source tag; the validator enforces it
    updated: 2026-07-01 # last-reviewed date — staleness triage for volatile/dated facts
    ---
    ```

    Keep the set minimal — these four fields only. `provenance_required` is the crown-jewel hook (§2.5): it lets the
    validator require a source tag on every claim line in that module. `updated` gives the dated-facts-rot problem a
    handle. `reference_id` / `parent_skill` make each module self-describing instead of only identifiable via its
    parent's frontmatter.

    **Loader prerequisite (already handled 2026-07-01):** `skill-reference-load.ts` reads each module via `?raw` and
    serves the whole file as `payload.content`. It now calls `stripReferenceFrontmatter()` first, so the YAML block
    never reaches the model. This is a no-op for modules that have no frontmatter, so modules can gain frontmatter one
    at a time during rollout. The regex strips a leading `---` fenced block only — a mid-file `---` thematic break is
    left intact (unit-tested).

3. **`going_viral` filename.** The rewritten file ships here as `going_viral_SKILL.md`. In the repo it is the drop-in
   replacement for `apps/web/.../definitions/going_viral/SKILL.md`. Rename on placement.
4. **Ordering churn.** Reordering H2s produces large diffs. That's expected and fine; don't try to minimize the diff
   at the cost of correct order.
5. **Body-parser header coupling — the real loader break (see §8.5).** The frontmatter loader is lenient, but the
   _body_ parser extracts structured fields by matching specific H2 names. Renaming those headers silently empties
   those fields unless the parser is taught the new block names. This is a **prerequisite loader patch**, not an
   afterthought. Status: **PATCHED for the canonical block names** (2026-07-01) — details in §8.5.

### 8.5 Body-parser header coupling (resolved — read before rollout)

The §8.1 pre-flight was framed as "will unknown frontmatter keys break parsing?" The answer is **no** — the loader
(`apps/web/src/lib/services/agentic-chat/tools/skills/markdown-skill.ts`) runs `yaml.parse()` then a loose cast,
reads only known keys, and ignores unknown ones. Adding `skill_type` / `altitude` / `activation` / `dependencies`
is non-breaking. **But that is not the whole loader story.**

The same file's `collectSections()` splits the body by H2 and `defineMarkdownSkill()` then pulls structured fields
**by matching specific lowercased header names**:

| Structured field | Legacy header matched        | Canonical block that replaces it |
| ---------------- | ---------------------------- | -------------------------------- |
| `whenToUse`      | `when to use`                | **Activation**                   |
| `workflow`       | `workflow`                   | **Procedure**                    |
| `guardrails`     | `guardrails`                 | **Policy**                       |
| `outputContract` | `output` / `output contract` | **Contract**                     |
| `notes`          | `notes`                      | **Provenance**                   |

Renaming the headers (which this refactor does) therefore **silently empties those fields** — the file still parses,
but the structured payload loses its workflow/guardrails/output/notes. Severity depends on `preserve_markdown`:

- **`preserve_markdown: true` skills (38 of 52 markdown skills, incl. the whole `going_viral` family):** the model is
  served the _raw body_ via `renderPreservedSkillMarkdown` → `sourceMarkdown`, so all nine blocks reach the model
  verbatim. The only leak is `skill.whenToUse`, which feeds **`skill-search.ts` (discovery ranking + the
  `when_to_use` hint)** — losing it silently degrades searchability.
- **Non-`preserve_markdown` skills (14 of 52):** these are rendered by `renderSkillMarkdown`, which **rebuilds the
  payload from the structured sections**. For these, renaming headers **drops workflow/guardrails/output from what the
  model sees entirely** — real content loss, not cosmetic. Do **not** migrate any of these until the parser accepts
  the new names.

**Resolution (already applied 2026-07-01):** `markdown-skill.ts` now accepts both the legacy header and its
canonical-block alias (via a `pickSection(sections, [...])` helper and a `procedure` branch in
`parseWorkflowSections`). Pre- and post-refactor skills parse identically, so migration can proceed one skill at a
time without a flag-day. Verified: existing loader/search/discoverability tests stay green, and the new-format
`going_viral` draft populates `whenToUse` (Activation), `workflow` (Procedure), `guardrails` (Policy), `notes`
(Provenance), and `outputContract` (Contract).

**Follow-ups for the executor:**

- The alias map is the compatibility shim, not the end state. When the validator (§6.2) lands, it should assert the
  _canonical_ block names; the legacy aliases can stay in the parser as a permanent back-compat courtesy or be
  removed in a final sweep once every skill is migrated — DJ's call (add to §11).
- `Identity`, `Judgment`, `Routing`, and `Knowledge` are **new** blocks with no legacy structured-field equivalent.
  They currently reach the model only through the raw-body path (fine for `preserve_markdown` skills). If any
  non-`preserve_markdown` skill needs those blocks surfaced structurally, the parser + `SkillDefinition` type must
  grow fields for them first — flag before migrating such a skill.

---

## 9. Rollout order

1. **The loader patch (§8.5)** — DONE 2026-07-01. This is the true prerequisite; nothing else is safe without it.
2. **`going_viral`** — already rewritten; land it as the reference other skills are measured against.
3. **The validator (§6)** — build it early so every subsequent migration is checked, not eyeballed.
4. **An inventory pass** — enumerate every skill under `definitions/`, assign `skill_type` / `altitude` /
   `activation` to each in a table, and flag multi-type / DRY-violation / mis-typed cases. Produce this table as a
   deliverable _before_ migrating the long tail.
5. **Migrate highest-traffic skills next**, then the long tail, one at a time, each validated green.

---

## 10. Definition of done (per skill)

- [ ] Frontmatter has valid `skill_type`, `altitude`, `activation`; `dependencies` present iff needed.
- [ ] Body uses only canonical blocks, in canonical order.
- [ ] Required-by-type matrix satisfied; no forbidden blocks.
- [ ] Procedure carries sequence + intent only; all ownership lives in Routing; `→` markers and `dependencies` fully
      reconcile (no orphans, no dangles).
- [ ] Knowledge block is short + stable; volatile/voluminous content is in references.
- [ ] Every Knowledge / reference claim is provenance-tagged; existing audit trails preserved.
- [ ] Validator passes.
- [ ] Fidelity diff confirms no substantive content lost or altered.
- [ ] Reads like `going_viral/SKILL.md`.

---

## 11. Decisions (resolved 2026-07-01)

DJ deferred the judgment calls to a reasonable default and made one explicit call (#3). Locked:

1. **Enforcement point — build-time (CI + pre-commit) only.** No runtime assertions. Skills are static and validated
   at build; a runtime check would add per-load latency for a class of error the build already caught. If a
   validated skill somehow drifts at runtime, that's a build-pipeline bug, not something to re-litigate on every load.
2. **Enum finality — keep six `skill_type` values.** No seventh. `technique` (the script-shipping skill/tool hybrid)
   is authored as a script-heavy `procedure`; if a "skill" is really just a callable script, it's a tool, not a skill
   (§2.1). Revisit only if a concrete skill genuinely can't be typed as one of the six.
3. **Reference-module frontmatter — ADD lightweight frontmatter (DJ's explicit call).** Schema + loader handling
   specified in §8.2. Four fields: `reference_id`, `parent_skill`, `provenance_required`, `updated`.
4. **Secondary types — no `secondary_type` field.** Multi-type skills declare their **dominant** type only and note
   the secondary in an Identity-block comment (as `going_viral` does: an orchestrator that also owns the seven
   tensions). A field would invite hedging and complicate the required-by-type matrix (§3.3). If a skill is _genuinely_
   two skills, that's a split — flag it for DJ (§7), don't encode duality.
5. **Provenance tag vocabulary — closed set of three, plus two audit markers.** Confidence tags:
   **`PRIMARY`** (creator/official source, dated), **`practitioner`** (credible operator, not official),
   **`internal-default`** (BuildOS's own reasoned default, no external source). Audit-trail markers, preserved
   verbatim where they exist: **`REMOVED`** and **`CORRECTED`**. The validator treats a claim line as tagged if it
   carries one of the three confidence tags; `REMOVED`/`CORRECTED` annotate the audit trail, not live claims. Adding
   a sixth tag requires a deliberate schema bump, not ad-hoc use.

---

## 12. Migration execution addendum (2026-07-01 — discovered from the full 52-skill inventory)

Three refinements the golden example alone didn't surface. They are binding on the migration + validator work.

### 12.1 The "migrated" gate is `## Identity`, not `skill_type`

Six skills already carry `skill_type` in frontmatter but still have **old-ontology bodies** (`When to Use` /
`Workflow` / `Output` / `Guardrails` / `Notes` / `Pillars`): `algorithm_aware_publishing`,
`content_strategy_beyond_blogging`, `hook_craft_short_form`, `story_driven_content_craft`,
`viral_video_script_structure`, `youtube_channel_craft_for_founders`. So **`skill_type` presence does not mean
migrated.** The validator (§6) must gate its full block-ontology + required-by-type checks on the presence of a
**`## Identity`** H2 (a new block with no old-ontology equivalent — old files never have it). Files without
`## Identity` are "pending migration": the validator skips structural checks for them but still validates any
frontmatter keys that ARE present (e.g. a stray `skill_type` must still be a valid enum value). This is what keeps CI
green while skills migrate one at a time.

### 12.2 The block menu gains two optional, loader-coupled sections: `Related Tools` and `Examples`

The fixed-9 menu was designed against `going_viral` (an orchestration skill with neither). The broader population has
two more sections that the **runtime loader already parses and existing tests already cover**:

- **`Related Tools`** → `relatedOps` (tool-oriented skills: `task_management`, `calendar_management`, `google_calendar`,
  `document_workspace`, `people_context`, `plan_management`, `project_*`, `libri_knowledge`, `task_state_updates`, …).
- **`Examples`** / **`Worked Example`** → `examples` (via `parseExamples`; covered by `skill-output-contract.test.ts`).

Dropping or renaming these would silently empty load-bearing payload fields. So the canonical menu is extended:
**both are OPTIONAL blocks, allowed for any `skill_type`.** Canonical order (Provenance stays last):

`Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance`

The validator's ordered-header check must accept these two. `Worked Example` is normalized to `Examples`. This is a
pragmatic extension of §3.2 driven by loader reality — flagged for DJ to ratify; trivially foldable if rejected.

### 12.3 Migration is re-slot-in-place; reference extraction is FLAGGED, not auto-performed

Per §7 (no content rewrite; don't act on judgment calls unilaterally), a migration agent **re-slots existing content
into the canonical blocks in place** and does **not** create new reference modules or move large content out of
`SKILL.md` on its own. When a `Knowledge` block comes out large or volatile, the agent **flags it as a
reference-extraction candidate** in its report. Exception: a skill that **already has a `references/` directory** may
have volatile Knowledge relocated into an _existing_ module. New-module extraction is a separate, DJ-gated pass. This
keeps every migration mechanical, reversible, and fidelity-checkable.

---

## 13. Migration complete (2026-07-01) — final state + refinements

**All 52 markdown skills are migrated to the canonical block ontology and the skills test suite is green (55/55),
typecheck clean.** Executed via three orchestrated workflow passes (validator build → inventory → pilot → mass
migrate), each migration adversarially fidelity-verified, plus a repo-wide content-preservation audit (no skill lost

> 5% of its content) and hand-fixes for everything the test suite caught.

### 13.1 Validator refinements made during rollout (all in `skill-authoring-validation.ts` + `skill.schema.ts`)

- **`## Identity` is the migration gate** (§12.1) — structural checks run only on migrated skills; pending skills are
  skipped, and a stale `skill_type: combo` on a pending skill is a _warning_, on a migrated skill an _error_.
- **orphan_dependency accepts Routing-block references.** A dependency is reconciled if referenced by a Procedure
  `→ \`id\``marker **or** a backticked id in the Routing block. This supports dynamic-dispatch orchestrators
(e.g.`build_quality_ui_ux`: "choose 1–3 child lenses per surface") that enumerate children in the Routing table
rather than one Procedure step each. Static pipelines (golden `going_viral`) still reconcile via Procedure markers.
- **New invariant: migrated ⟹ `preserve_markdown: true`** (code `migrated_requires_preserve_markdown`). The new
  blocks (Identity/Judgment/Routing/Knowledge) have no structured-field equivalent, so a non-`preserve_markdown`
  skill would have them silently dropped by `renderSkillMarkdown` (the §8.5 hazard, realized: `project_creation`
  lost `tech_stack`/`target_word_count` until this was enforced). All 11 tool-oriented skills that lacked the flag
  now set it.

### 13.2 Bugs found + fixed post-migration

- **Tool-wrapper garbage** (`</content>`/`</invoke>`) written into EOF of 7 files by migration agents — stripped.
- **`ui_ux_quality_review`** — the Severity rubric was mis-slotted into Judgment; moved to Contract (where the
  output-contract test expects it and where it belongs — it defines finding labels).
- **`google_calendar`** — procedure requires Contract (§3.3) but the source had no Output section; added a Contract
  synthesized from the skill's own Examples/behavior (the operation-result shape it already returns). ⚠️ This is the
  one spot where content was _made explicit_ rather than purely moved — DJ should sanity-check it.
- **`skill-load.test.ts`** — one assertion hard-coded the old `## Workflow` header; updated to `## Procedure`.

### 13.3 DJ decision queue (flagged, NOT acted on — §7)

Structural refactor is done; these are semantic calls left for DJ. Full detail in
`docs/research/youtube-library/skill-drafts/SKILL_REFACTOR_INVENTORY.md`:

- **DRY single-owner rulings** — clusters: `calendar_management` ↔ `google_calendar`; UI-review overlaps (8);
  cold-email overlaps (11); content/lens overlaps (9); ontology entity-chain defs duplicated across
  `plan_management`/`project_audit`/`project_creation`/`project_forecast`.
- **Merge candidate** — `project_audit` ↔ `project_forecast` (near-duplication).
- **Reference-extraction candidates** — `viral_video_script_structure` (342 lines) and `cold_email_learning_review`
  (dated vendor benchmark bands); both deferred because new-module creation is DJ-gated (§12.3).
- **`google_calendar` synthesized Contract** — ratify or revise (§13.2).
- **Nothing is committed** — review `git diff` on `definitions/**/SKILL.md` before landing.
