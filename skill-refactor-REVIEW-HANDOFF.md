<!-- skill-refactor-REVIEW-HANDOFF.md -->

# Review Handoff: Skill Block-Ontology Refactor

**To:** the reviewing agent
**From:** the implementing agent
**Date:** 2026-07-01
**Your job:** adversarially inspect this refactor for correctness, fidelity (no lost skill content), and
soundness of the validator + loader changes. Assume nothing is correct because a test is green — the test suite
already missed one real content loss (see §6.1). Sample the actual diffs.

---

## 0. TL;DR of what was done

All **52 markdown skills** under
`apps/web/src/lib/services/agentic-chat/tools/skills/definitions/*/SKILL.md` were restructured from an ad-hoc header
layout into a fixed **canonical block ontology**. A build-time **validator** was added to enforce the ontology, and
the runtime **loader** was patched so old- and new-format skills both parse. This was a **structural** refactor:
content was meant to be _re-slotted, not rewritten_ (spec §7 non-goals).

The full spec + decision log is `skill-update-refactor-tasker.md` (read §3 schema, §7 non-goals, §11 decisions,
§12 addendum, §13 completion record). The per-skill classification + DJ-decision flags are in
`docs/research/youtube-library/skill-drafts/SKILL_REFACTOR_INVENTORY.md`.

Nothing is committed. Everything is in the working tree for you to diff against `HEAD`.

---

## 1. The canonical block ontology (the target you're reviewing against)

Frontmatter gained four keys: `skill_type` (procedure | strategy | reference | resource | policy | orchestration),
`altitude` (task | domain | meta), `activation` (always_on | progressive | invoked), and `dependencies`
(orchestration only). Body H2s must be a subset of this fixed menu, **in this order**:

`Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance`

- `Related Tools` and `Examples` are optional, loader-coupled additions (spec §12.2).
- A skill is "migrated" iff its body has a `## Identity` H2 (spec §12.1). The golden reference is
  `definitions/going_viral/SKILL.md` — a finished skill should read like it.
- Required-by-type matrix is in spec §3.3 and encoded in the validator.

---

## 2. Exact change inventory

**Engine code (6 files):**

- `skills/skill.schema.ts` — **NEW**. Zod frontmatter contract (enums, `dependencies` refine, reference-module
  frontmatter schema, provenance tag constants).
- `skills/skill-authoring-validation.ts` — added the block-ontology linter (new issue codes, `parseSkillMarkdown`,
  ordered-menu + required-by-type matrix, orchestration route↔dependency reconciliation, provenance check).
- `skills/skill-authoring-validation.test.ts` — new tests for the linter (fixtures + runtime-tree guard).
- `skills/markdown-skill.ts` — body-parser now accepts both legacy and canonical H2 names (alias map + `procedure`
  in the workflow parser).
- `skills/skill-reference-load.ts` — strips lightweight YAML frontmatter from reference modules before serving.
- `skills/skill-load.test.ts` — one obsolete `## Workflow` assertion updated to `## Procedure`.

**Content:**

- `definitions/**/SKILL.md` — **52 files changed, +3439 / −1750**. All migrated.
- `definitions/going_viral/SKILL.md` — the golden example, landed from the draft (its `references/` were left
  untouched — they are richer than the draft copies).
- `definitions/algorithm_aware_publishing/references/quality-gate-and-tactics.md` — the `Reject (1)→Reject (4)`
  catalog expansion (this predates the migration; see §6.4).
- Draft mirrors touched: `docs/research/youtube-library/skill-drafts/going-viral/SKILL.md` and
  `.../algorithm-aware-publishing/SKILL.md`.

**Docs:** `skill-update-refactor-tasker.md` (§8.5, §12, §13 appended), `SKILL_REFACTOR_INVENTORY.md` (new).

---

## 3. How to verify the baseline

```bash
cd apps/web
pnpm test:run src/lib/services/agentic-chat/tools/skills/     # expect 7 files, 55 tests, all pass
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i skill        # expect no output (no skill type errors)
```

Completeness / hygiene sweep:

```bash
D=apps/web/src/lib/services/agentic-chat/tools/skills/definitions
grep -rl '^## Identity' $D/*/SKILL.md | wc -l          # expect 52
grep -rl '^## When to Use' $D/*/SKILL.md               # expect none (no old-ontology stragglers)
grep -rl 'skill_type: combo' $D/*/SKILL.md             # expect none
grep -rlE '</content>|</invoke>|<parameter name=' $D/*/SKILL.md   # expect none (tool-wrapper garbage)
```

---

## 4. How to check FIDELITY (the most important review, do this by hand)

The test suite only asserts content for `project_creation` and `ui_ux_quality_review`. Every other skill's fidelity
rests on an automated adversarial verifier that **has false negatives**. Please sample-diff several skills:

```bash
# For a given skill, see the original vs migrated:
id=<skill_id>
f=apps/web/src/lib/services/agentic-chat/tools/skills/definitions/$id/SKILL.md
git show HEAD:$f > /tmp/old.md
diff <(git show HEAD:$f) $f            # or open both

# Fast loss heuristic — content chars (ex-frontmatter/headers/comments/blank), HEAD vs working tree:
# a big negative delta = suspected content loss (migration should mostly ADD structure)
```

What counts as a **defect** (report it): a claim, number, source citation, worked example, rule, or table cell that
existed in `HEAD` but is gone or altered in meaning in the migrated file. What is **fine**: a renamed header, added
frontmatter/comments, a new Routing table, content moved between blocks.

Priority skills to fidelity-check (see §6).

---

## 5. Validator / loader changes to scrutinize

Read these and decide if the rules are correct — not too loose, not too strict:

1. **`skill-authoring-validation.ts` → orchestration reconciliation (`orphan_dependency` / `dangling_route`).**
   I _relaxed_ orphan_dependency: a declared dependency is "reconciled" if referenced by a Procedure `→ \`id\``
marker **OR** a backticked id anywhere in the Routing block. Rationale: dynamic-dispatch orchestrators
(`build_quality_ui_ux`) list children in a Routing table, not one Procedure step each.
   **Question for you:** does scanning the whole Routing block for backticked ids let a genuinely-orphan dependency
   slip through (e.g. an id mentioned in prose but never actually routed)? Is that acceptable?

2. **New invariant `migrated_requires_preserve_markdown`.** Migrated skills must set `preserve_markdown: true`,
   because the new blocks (Identity/Judgment/Routing/Knowledge) have no structured-field equivalent and would be
   dropped by `renderSkillMarkdown`. **Verify** this is actually true by reading `skill-load.ts` around line 205–217
   and `renderPreservedSkillMarkdown` vs `renderSkillMarkdown`. Confirm the 11 tool-skills that flipped to
   preserve_markdown still render a sensible payload (their runtime output changed from a rebuilt structured playbook
   to the raw body + appended Related Tools/child/reference sections).

3. **`markdown-skill.ts` alias map.** Legacy↔canonical header aliases (Activation↔when to use, Procedure↔workflow,
   Policy↔guardrails, Contract↔output, Provenance↔notes). **Question:** any collision or double-count risk if a file
   somehow had both an old and new header? (Should not happen post-migration, but check the `pickSection` precedence.)

4. **`skill-reference-load.ts` `stripReferenceFrontmatter`.** Regex strips a leading `---`-fenced block. Confirm it
   can't eat a mid-file thematic break or a legit `---` inside content. No reference module currently has frontmatter,
   so it's a no-op today — but the regex ships live.

5. **Provenance check.** Only runs when a reference module's frontmatter sets `provenance_required: true`. No module
   sets it yet. Note the known spelling discrepancy: spec §11 fixes `internal-default` (hyphen) but some content uses
   `(internal default)` (space) — will bite if a module opts in. Worth flagging.

---

## 6. Known weak spots — inspect these FIRST

### 6.1 Fidelity verification is imperfect (proven)

`project_creation` **passed** the automated adversarial verifier but had actually dropped rendered content
(`tech_stack`/`target_word_count`) — caught only because a loader test happened to assert on it. Treat the 40
"verified-pass" skills as _probably_ fine, not _proven_ fine. Sample-diff generously.

### 6.2 Five skills were NEVER adversarially verified

Their verify-stage agents died on a session limit. I hand-spot-checked them and they pass the validator + content
audit, but they had **no** adversarial fidelity pass. Give these extra scrutiny:
`sensory_double_tap`, `ui_ux_quality_review`, `usability_quick_research`, `viral_video_script_structure`,
`youtube_channel_craft_for_founders`.

### 6.3 Mis-slotting (content preserved but in the wrong block)

`ui_ux_quality_review` had its Severity rubric mis-slotted into Judgment (I moved it to Contract). This class of
error — content present but in a block that changes its meaning or its loader payload field — is **not** caught by
the content-preservation audit and only sometimes by tests. Spot-check that Contract/Procedure/Judgment/Policy
assignments are semantically right on a sample of skills, not just present.

### 6.4 Two spots where content was touched beyond pure re-slotting

- **`google_calendar` Contract** — the source had no Output section, but `procedure` requires Contract (§3.3). I
  **synthesized** a Contract from the skill's own Examples/behavior. This is the one place content was _made
  explicit_ rather than moved. Read it and judge whether it's faithful or overreach.
- **`algorithm_aware_publishing` `Reject (1)→Reject (4)`** — this is a **legitimate earlier edit** (expanding the
  reject catalog with the comment-driver stack), NOT a migration error. The automated verifier flagged it as an
  "undisclosed change" — that's a **false positive**; ignore it. Confirm the 4 reject tactics are all real content.

### 6.5 Orchestration skills and `preserve_markdown`

Some migration agents added `preserve_markdown: true` to orchestration roots (`build_quality_ui_ux`,
`cold_email_engagement_first_outreach`) as a 5th frontmatter key beyond the 4 named ones. This is correct (prevents
block dropping) but worth confirming it matches intent and didn't clobber other frontmatter.

---

## 7. What is explicitly OUT of scope for this refactor (do not fault it for these)

Per spec §7, the refactor did **not** merge/split skills, resolve DRY duplication, or extract new reference modules.
Those are DJ-gated semantic decisions, flagged (not acted) in `SKILL_REFACTOR_INVENTORY.md` §2–§3 and tasker §13.3:
DRY clusters (`calendar_management`↔`google_calendar`, UI-review/cold-email/content overlaps, ontology entity-chain
dupes), the `project_audit`↔`project_forecast` merge candidate, and reference-extraction candidates
(`viral_video_script_structure` at 342 lines, `cold_email_learning_review` benchmark bands). If you think one is a
real bug, flag it — but it wasn't in scope to fix.

---

## 8. Suggested review deliverable

Please return:

1. **Fidelity findings** — any skill where content was lost/altered in meaning, with `git show HEAD:<file>` evidence
   and the specific missing item. Rank by severity.
2. **Validator/loader soundness** — any rule that is too loose (lets a real defect pass) or too strict (would block a
   legitimate skill), with a concrete failing case.
3. **Mis-slot findings** — content in the wrong canonical block.
4. **A go / no-go** on committing the `definitions/**/SKILL.md` diff, and a short list of must-fix-before-commit
   items vs. nice-to-haves.

Start with §6. The suite being green is the floor, not the ceiling.
