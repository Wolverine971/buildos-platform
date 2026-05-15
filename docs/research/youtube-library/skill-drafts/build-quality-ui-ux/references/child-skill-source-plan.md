<!-- docs/research/youtube-library/skill-drafts/build-quality-ui-ux/references/child-skill-source-plan.md -->

# Build Quality UI/UX Child Skill Source Plan

## Intake Checklist

1. Search the existing YouTube index for the thought leader and topic.
2. Find at least one long-form YouTube source with transcript availability when possible.
3. Fetch transcripts with `python3 scripts/youtube-transcript.py`.
4. Add entries to `docs/research/youtube-library/INDEX.md`.
5. Add the source to `docs/research/youtube-library/skill-combo-indexes/PRODUCT_AND_DESIGN.md`.
6. Create an analysis file if the source changes the agent workflow.
7. Update the child skill draft and runtime child only after the routing rule is clear.

## Priority Queue

| Priority | Work                                                   | Reason                                                                                                       |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Done     | Analyze Brad Frost and Nathan Curtis transcript pulls. | Design-system architecture child is now upgraded with product-outcome, migration, and operations checks.     |
| Done     | Analyze Erika Hall transcript pull.                    | Usability quick research child is now upgraded with decision-first, bet-size, stakeholder, and proxy checks. |
| P1       | Find stronger IA/IxD transcript sources.               | The IA child is important, but current YouTube coverage is thin.                                             |
| P1       | Synthesize design-to-code verification sources.        | `ui_implementation_verification` should become a child only after the verification contract is explicit.     |
