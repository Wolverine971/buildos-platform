<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/build_quality_ui_ux/references/child-skill-source-plan.md -->

# Build Quality UI/UX Child Skill Source Plan

Use this checklist when expanding any child skill under `build_quality_ui_ux`.

## Pipeline

1. Define the child skill boundary in one sentence. If it overlaps an existing child, clarify the routing rule first.
2. Search for source candidates by area and thought leader. Prefer long-form YouTube talks, conference sessions, interviews, standards docs, or canonical essays with explicit author credibility.
3. Check `docs/research/youtube-library/INDEX.md` before downloading. Do not duplicate existing transcript work.
4. Fetch transcripts with `python3 scripts/youtube-transcript.py <video-id-or-url> -o docs/research/youtube-library/transcripts/<date>_<creator>_<topic>.md`.
5. Add the source to `docs/research/youtube-library/INDEX.md` and the relevant `skill-combo-indexes/*.md` file.
6. Create or update an analysis artifact under `docs/research/youtube-library/analyses/` when the source changes agent behavior.
7. Update the draft skill in `docs/research/youtube-library/skill-drafts/` and then promote a concise runtime child skill only after the boundary and output contract are stable.
8. Update this source map with readiness, gaps, and next source pulls.

## Source Quality Tiers

- Tier 1: canonical book/standard author, standards body, or widely cited practitioner with concrete methods.
- Tier 2: reputable conference talk, interview, or teardown with specific operational practices.
- Tier 3: useful heuristic source that needs corroboration before becoming a runtime rule.

## Child Skill Expansion Backlog

| Priority | Child skill                         | Next source task                                                                         | Done when                                                                                       |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Done     | `design_system_architecture_review` | 2026-05-15 Frost and Curtis analyses created and folded into runtime child.              | Runtime child contains product-outcome, migration, release, intake, and governance checks.      |
| Done     | `usability_quick_research`          | 2026-05-15 Erika Hall analysis created and folded into runtime child.                    | Child separates goals, decisions, bet size, discovery questions, evaluative tests, and cadence. |
| P1       | `usability_quick_research`          | Add a current Krug or NN/g practical usability-testing transcript.                       | Evaluative testing side is transcript-refreshed, not only canon-summary-backed.                 |
| P1       | `information_architecture_review`   | Find transcript-backed Abby Covert, Peter Morville, Jared Spool, or Don Norman material. | Child can cite source-backed rules for labels, wayfinding, conceptual models, and recovery.     |
| P1       | `ui_implementation_verification`    | Synthesize Ryo Lu/Jenny Wen/design-to-code sources with repo verification tools.         | New child skill has Playwright/browser/screenshot/focus/responsive verification contract.       |
| P2       | `ui_ux_quality_review`              | Add annotated before/after examples from local screenshots or source videos.             | Child has sharper examples for AI-generated UI repair.                                          |

## Output For Each Source Pass

- Source link and local transcript path.
- Three to seven behavior-changing principles.
- Skill routing decision: new child, update child, reference-only, or reject.
- Coverage impact: what gap closed and what remains.
