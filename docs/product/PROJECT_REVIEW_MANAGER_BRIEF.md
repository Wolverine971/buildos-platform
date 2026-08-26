<!-- docs/product/PROJECT_REVIEW_MANAGER_BRIEF.md -->

# Project Review Manager Brief

**Status:** WP-3 product contract; schema hosted, worker/web runtime local
**Adopted:** 2026-08-14
**Parent:** `tasker/52-ai-inbox-review-loop-remediation.md`

The hosted schema receipt is `20260814020000_project_review_manager_brief_inbox.sql` (SHA-256
`771cd0157d2bcc6c3b4140f3d249a74ee8c49e6d37b818a00f7907fbdab80638`). The linked ledger and an
isolated post-apply dry run are clean; production runtime deployment is a separate step.

## Product kernel

The Project Review system may detect many project, document, and task issues. The user should
not receive those detectors' raw output. One project-manager synthesis owns the interruption,
explains the bottom line in plain language, recommends what to do, and asks for judgment only
when judgment is actually required.

The AI Inbox operates **by exception**:

| Level      | Meaning                                                                    | User surface                                                                                                              |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Nothing useful requires action.                                            | No inbox item. Preserve the review result in project history.                                                             |
| `minor`    | Low-consequence cleanup or a weak signal.                                  | Show in the project brief/history, not the AI Inbox. Never claim it was handled unless a verified operation actually ran. |
| `decision` | A bounded choice, verified change, or concrete next action needs the user. | One project-manager brief in the AI Inbox.                                                                                |
| `urgent`   | Work is blocked or delay creates a material consequence.                   | One clearly urgent project-manager brief in the AI Inbox.                                                                 |

This follows three useful operating ideas:

- Lead with the main point and required action so the message can be understood in one rapid
  reading (the U.S. Army's plain-writing/BLUF guidance).
- Escalate exceptions, not routine detail (management-by-exception project governance).
- Keep reversible, low-consequence decisions lightweight (Amazon's one-way/two-way-door model).

## One manager, one brief, one primary ask

Each project has one synthesized manager brief at a time. Review families remain independent
detectors, but their results are subordinate evidence:

- project drift;
- document drift or document quality;
- task drift or task conflict;
- risk/blocker;
- other project-health observations.

The manager brief must have this hierarchy:

1. **Status:** `Decision needed`, `Urgent`, or a non-inbox project-health status.
2. **Bottom line:** one sentence stating what is happening in ordinary language.
3. **Recommendation:** the manager's proposed course, not a request for the user to invent one.
4. **Your decision:** one direct question, only when the user must choose or authorize something.
5. **Why this needs you:** the judgment or tradeoff that prevents the system from safely deciding.
6. **Work involved:** readable links to the actual documents, tasks, or goals.
7. **Other things I noticed:** collapsed secondary findings, labeled by category and severity.

When there are many changes, they become one overall brief. The user can discuss the primary
decision, then drill into a secondary issue without first decoding the detector output.

## Copy contract

User-facing copy must:

- say what is actually messy, blocked, duplicated, stale, or changing;
- name the affected work;
- state a recommendation using "I recommend..." or an equally direct construction;
- ask a question that can be answered without opening evidence first;
- explain why the user, specifically, must decide;
- use detector names only as small secondary category labels.

User-facing copy must not include:

- internal enum or dimension names such as `drift_scope_control` or `documentation_quality`;
- instructions such as "choose the canonical documents" without naming the documents and
  proposing which one should be kept;
- generic prompts such as "What will you do next?" that make the user write the plan;
- opaque evidence chips or truncated entity names with no working link;
- one inbox row per detector finding.

## Decision and execution policy

- A brief may recommend one existing verified executable suggestion. In that case the primary
  action can apply that exact suggestion after the normal integrity revalidation.
- A judgment-only brief leads to discussion or a bounded choice. It must not pretend a direct
  mutation is available.
- Safe cleanup may eventually run automatically only through an explicit deterministic allowlist,
  with verified targets, reversibility, and an honest "handled" receipt. Classification alone is
  not permission to claim execution.
- Dismissing or resolving a manager brief records an explicit disposition for its member
  candidates. Grouping never deletes source history.

## Admission invariants

- At most one unresolved manager brief per project.
- A light review with `none` or `minor` attention succeeds without creating an inbox row.
- Complete Project Audit is rendered as the same manager-brief packet; its child audit findings do
  not become separate inbox rows.
- Underlying `project_suggestions` remain the source candidates and execution objects.
- Every substantive brief claim cites candidate IDs and/or entity evidence IDs.
- Inbox titles and summaries come from the sanitized synthesis or verified operations, never raw
  operation labels.

## Research references

- U.S. Army Regulation 25-50, _Preparing and Managing Correspondence_:
  https://home.army.mil/wood/application/files/3015/5751/8343/AR_25_50_Army_Correspondence.pdf
- Amazon 2016 Letter to Shareholders (one-way and two-way doors):
  https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders
- UK Government Functional Standard GovS 002, _Project delivery_:
  https://projectdelivery.gov.uk/govs-002-project-delivery-functional-standard/
- PMI, _The Anatomy of a Highly Effective Status Report_:
  https://www.pmi.org/learning/library/anatomy-highly-effective-status-report-2198
