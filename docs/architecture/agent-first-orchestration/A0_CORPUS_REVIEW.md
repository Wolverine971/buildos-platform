<!-- docs/architecture/agent-first-orchestration/A0_CORPUS_REVIEW.md -->

# Slice A0 corpus review — DJ gate 1

**Status:** Approved by DJ on 2026-07-24. The recommended eight and their proposed labels were
accepted without changes and are the frozen Phase A corpus.

## Provenance and handling

- The candidate pool contains 11 completed production-chat requests captured between 2026-04-15
  and 2026-07-22.
- Production reads were read-only. Source turn references are one-way 12-character hashes; raw
  session, user, project, and entity IDs are not retained.
- Third-party names, mailbox identifiers, and one source document title were anonymized or replaced
  where needed. The public URL in C06 is intentionally retained because it is part of the task.
- All project scenarios run against the same anonymized production-derived snapshot. Its alias is
  **Project Alpha — Response-Speed Training**, as of 2026-07-13T04:16:04.162Z. It contains 11
  tasks, five documents, one goal, three plans, and three relationship edges.
- Snapshot SHA-256:
  `be9feaeade4134285f891f857ca02aad0a74cd1c890ba774c2b9ea1fa398af6c`.
- The supplied C06 article was reachable and its content was verified on 2026-07-24.

## Recommended eight

This set matches the specified class mix exactly and keeps every comparison scenario read-only.

| ID  | Class                               | Proposed label                               | Production request (abridged)                          | Primary checks                                                        |
| --- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| C01 | simple read                         | `direct / simple_read`                       | Explain the “in sync” score.                           | Subjective 1–10 weekly measure; correlation; no clinical claims.      |
| C02 | simple read                         | `direct / simple_read`                       | What tasks need action next?                           | Gateway task and two overdue tasks; no mutation claims.               |
| C04 | status summary                      | `direct / status_summary`                    | Summarize the project in five bullets; name documents. | Exactly five bullets; required document and program-layer names.      |
| C06 | single-source lookup                | `workflow / single_source_research`          | Use the supplied article to explore future snipers.    | Cite supplied URL; skills, missions, team structure; cite claims.     |
| C07 | multi-source research               | `workflow / multi_source_research`           | Review a cold-email agent workflow and product UX.     | Outreach, workflow, accessibility, risks, tests, resolved citations.  |
| C08 | context → research → recommendation | `workflow / context_research_recommendation` | Research which iPhone app to use “for this.”           | Resolve PVT from context; compare current apps; cited recommendation. |
| C09 | ambiguous                           | `clarify / missing_required_context`         | Research today's or this week's content production.    | Ask which content scope/project; do not invent a backlog.             |
| C12 | unsupported capability              | `capability_gap / unsupported_capability`    | Search connected email for project-related messages.   | Report missing `email.search`; do not claim inbox access/results.     |

## Three alternatives

| ID  | Proposed label            | Why it is not in the recommended eight                                                                    |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| C03 | `direct / status_summary` | Excellent natural-language status probe, but C04 has a stronger machine-checkable shape.                  |
| C05 | `direct / simple_read`    | Clean document read, but the required mix only has two simple reads and C01/C02 are less explicit.        |
| C10 | `direct / status_summary` | Useful future boundary test; “plan this week” could reasonably require clarification or calendar context. |

One additional production candidate—“Yes, update the document.”—was rejected before this review
because Phase A explicitly excludes mutation scenarios. It is not retained in the fixture pool.

## Decision

DJ approved C01, C02, C04, C06, C07, C08, C09, and C12 with the labels shown above. The selected
records are copied into `src/testing/harness/corpus/`, marked frozen, and must remain unchanged for
A1 prompt and route-accuracy work. Any later correction requires a new corpus version and an
explicitly recorded rationale; it may not silently rewrite this baseline.
