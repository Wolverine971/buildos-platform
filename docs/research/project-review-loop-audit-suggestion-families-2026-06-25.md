---
date: 2026-06-25
topic: project-reviews
status: research-spec
path: docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md
related:
    - docs/product/PROJECT_REVIEW_TAXONOMY.md
    - docs/specs/PROJECT_REVIEW_LOOPS_SCOPE_2026-06-13.md
    - docs/brainstorms/2026-06-12-project-loops-brainstorm.md
---

# Project Reviews: Suggestion Families And Complete Project Audit

## Purpose

Project Reviews currently use a light review pass to organize docs,
flag outdated docs, identify drift, and flag task conflicts. This document
sketches the next product layer: a broader, consultant-style project audit that
reviews the whole project and tells the user whether the project is healthy,
aligned, and executable.

This is not a code spec. It defines the conceptual suggestion families, trigger
guardrails, audit dimensions, and product rules that should guide a later
technical design.

## Implementation Alignment As Of 2026-06-26

The AI Inbox / Project Review substrate now supports clarified project-suggestion
decisions before this broader audit work begins:

- `project_loop_runs` remains the parent review event.
- `project_suggestions` remains the actionable finding row indexed into
  `inbox_items`.
- A project-suggestion approve/dismiss with clarification delegates to a
  source-linked child `agent_run`, then reconciles the source suggestion when the
  run finishes.
- Recent reviewed decisions with user feedback are loaded into loop prompts as
  prior-decision memory, reducing repeated suggestions.

This reinforces the product boundary in this document: Complete Project Audit is
still a future durable report packet, not just another clarified decision mode
and not merely another `project_suggestions.kind`.

## Research Takeaways

External project-health patterns point in the same direction:

- Atlassian's Team Health Monitor treats health review as a structured check
  against known attributes, then turns the review into improvement actions. It
  recommends recurring health checks and asks teams to pick a small number of
  focus areas after the assessment:
  [Atlassian Team Health Monitor](https://www.atlassian.com/team-playbook/health-monitor).
- The Kanban Guide frames workflow health around explicit workflow definition,
  WIP, throughput, work item age, and cycle time. For BuildOS, those map well to
  task volume, stale active work, forecast horizon, and change burst signals:
  [The Kanban Guide](https://kanbanguides.org/the-kanban-guide/2025.5/).
- Google's DORA/Four Keys material is useful less because BuildOS projects are
  all software projects, and more because it separates velocity from stability
  and emphasizes baselining before judging change:
  [Google Cloud Four Keys](https://cloud.google.com/blog/products/devops-sre/using-the-four-keys-to-measure-your-devops-performance).
- The UK Government and National Audit Office frame major-project assurance as
  transparent progress reporting and delivery confidence, especially for large,
  risky, or strategically important work:
  [GOV.UK major projects data](https://www.gov.uk/government/collections/major-projects-data),
  [NAO assurance for major projects](https://www.nao.org.uk/reports/assurance-for-major-projects/),
  and
  [NAO governance and decision-making on mega-projects](https://www.nao.org.uk/insights/governance-and-decision-making-on-mega-projects/).
- Microsoft's HAX guidelines reinforce that AI review systems should expose
  evidence, handle uncertainty, support correction, and improve over time:
  [Microsoft HAX Guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/).

The BuildOS translation: an audit should not be "AI generated advice" in the
abstract. It should be a structured assurance report grounded in project
evidence, explicit thresholds, and user-correctable conclusions.

## Proposed Suggestion Family Taxonomy

Instead of treating every generator as a separate product family, group them
into four user-facing families.

### 1. Knowledge Hygiene

Purpose: keep the project memory understandable and trustworthy.

Current examples:

- Document organization.
- Outdated document flags.

Potential expansions:

- Duplicate document detection.
- Missing source/evidence warnings.
- Inconsistent naming or type usage.
- "Important doc has no linked tasks/goals" warning.
- "Decision appears in a doc but is not captured as a decision/task" warning.

Output style: low-risk cleanup suggestions, usually reversible.

### 2. Work Integrity

Purpose: keep tasks, commitments, and execution state coherent.

Current examples:

- Task conflict flags.

Potential expansions:

- Duplicate tasks.
- Contradictory task states.
- Tasks with due dates but no owner/next step.
- Blocked work with no unblocker.
- Too much WIP relative to recent throughput.
- Forecasted work with no supporting docs or goals.

Output style: mostly review items, not destructive changes. A future version may
propose merges or status changes, but those should remain high-risk and
one-by-one.

### 3. Direction And Drift

Purpose: check whether current work still matches the stated project intent.

Current examples:

- Drift/on-track check.

Potential expansions:

- Goal/task mismatch.
- New work that implies a changed project strategy.
- Stale assumptions.
- Missing decision gates.
- Scope growth without updated goals.
- Calendar commitments that do not match task priorities.

Output style: evidence-backed observations and suggested decisions. Many items
should be acknowledgements or prompts for user judgment, not writes.

### 4. Complete Project Audit

Purpose: provide a holistic consultant-style review of the whole project.

This is not just a bigger version of the daily loop. It should answer:

- What is this project trying to accomplish?
- Is the current documentation sufficient to understand and execute it?
- Are goals, tasks, docs, and dates aligned?
- What changed since the last audit?
- What risks or contradictions would an outside reviewer flag?
- What should the owner decide next?
- Is the project on track, at risk, or incoherent?

Output style: an audit packet, not a pile of small suggestions. The packet can
contain:

- Executive summary.
- Delivery confidence rating.
- Evidence table.
- Health dimensions with scores.
- What changed since last audit.
- Risks and open questions.
- Recommended next actions.
- Optional follow-up review items that the user can approve separately.

## Complete Project Audit Trigger Model

The audit should run only when the project has enough substance and enough new
signal. The guardrail is: do not audit a project that is too small, too inactive,
or insufficiently changed.

Use a four-gate decision model.

### Gate 1: Eligibility Baseline

The project must clear a minimum maturity threshold before a full audit is even
eligible.

Minimum rule:

- Project is active or planning.
- Project is at least 7 days old, unless manually requested.
- Project has at least 2 distinct activity days.
- Project has at least 1 goal or a substantial description.
- Project has enough content to audit.

Suggested content threshold:

Run a complete audit only if the project meets at least 3 of these 5 conditions:

- At least 5 active documents, or at least 1 substantial document over roughly
  1,500 words.
- At least 5 non-deleted tasks.
- At least 2 goals, milestones, or explicit success criteria.
- At least 1 dated commitment: due date, milestone, calendar event, or future
  scheduled task.
- At least 10 total project entities across docs, tasks, goals, milestones,
  risks, plans, and events.

If the project fails this gate, run only the light families:

- Knowledge Hygiene.
- Work Integrity.
- Direction And Drift.

Do not produce a consultant-style audit on a project that has no meaningful
project body yet.

### Gate 2: Project Size Class

Classify project size before choosing cadence and burst thresholds.

Small but eligible:

- 5-14 total entities, or thin documentation but some real task structure.
- Audit only on manual request or major burst.

Medium:

- 15-39 total entities, or multiple goals/docs/tasks with active work.
- Audit every 14 days if there was meaningful activity.
- Audit on burst if enough of the project changed.

Large:

- 40+ total entities, or 15+ tasks, or 15+ docs, or meaningful forecasted work
  across more than 14 days.
- Audit every 14 days if active.
- Audit on burst with lower relative percentage thresholds because even a
  10-15% change can be material.

Strategic / high-risk:

- Project has major deadlines, high task volume, explicit risks, or cross-project
  dependencies.
- Allow audit sooner than 14 days after a critical change, but require stronger
  evidence and user-visible reason.

### Gate 3: Scheduled Audit Trigger

Run a scheduled complete audit when:

- Project is eligible.
- Project is medium, large, or strategic.
- Last complete audit finished at least 14 days ago.
- There has been meaningful activity since the last audit.

Meaningful activity threshold:

- At least 3 changed entities since last audit for medium projects.
- At least 6 changed entities since last audit for large projects.
- Or at least 1 major change event.

Skip scheduled audit when:

- No meaningful activity since the last audit.
- The latest audit still has unresolved high-priority recommendations and no new
  evidence.
- The project is paused, archived, deleted, or inactive.
- The audit would repeat substantially the same findings.

Product behavior when skipped:

- Record a lightweight "audit skipped" reason internally.
- Do not create an inbox item unless the skip itself reveals a user-actionable
  issue.

### Gate 4: Burst Audit Trigger

A burst audit should run when the project changed enough that the old mental
model may be stale.

Use two concepts:

- Change volume: how many project objects changed.
- Change significance: whether the changed objects are structurally important.

Suggested event weights:

- Project name, description, or state changed: 5 points.
- Goal created, deleted, or materially changed: 5 points.
- Milestone/date moved by more than 7 days: 5 points.
- Document created: 2 points.
- Substantial document edit: 3 points.
- Document archived/deleted/restored: 4 points.
- Document tree reorganization: 3 points.
- Task created: 1 point.
- Task state changed: 1 point.
- Task due date/start date changed: 2 points.
- Task deleted/restored: 3 points.
- Risk created/escalated: 4 points.
- Calendar event added/changed for project-critical work: 2 points.

Suggested burst thresholds:

Small but eligible:

- 10+ points within 72 hours, and at least 25% of known entities touched.

Medium:

- 16+ points within 72 hours, or 12+ changed entities within 7 days.

Large:

- 24+ points within 7 days, or at least 15% of active project entities touched,
  or at least 5 documents and 8 tasks changed within 7 days.

Critical-change override:

- Run an audit even before normal burst threshold if 2 or more major changes
  happen within 72 hours.
- Major changes include goal rewrite, project scope rewrite, milestone/date
  shift, deletion/archive of central docs, or a large status transition across
  active tasks.

Quiet-period rule:

- Do not run the audit during the burst.
- Wait until the project has had a quiet period, such as 2-6 hours without
  further major mutations, so the audit reviews a settled state.

Cooldown rule:

- Do not run another complete audit within 7 days unless the critical-change
  override fires.
- Prefer a light review if the last complete audit is recent.

## Audit Dimensions

The complete audit should score and explain the project across dimensions.

Recommended first version:

1. Intent clarity
    - Is the project goal clear?
    - Are success criteria explicit?
    - Is there a stated owner or next decision?

2. Documentation quality
    - Are core docs present and current?
    - Are docs organized enough for a new collaborator to understand?
    - Are important claims supported by source evidence?

3. Plan integrity
    - Do goals, plans, milestones, and tasks line up?
    - Is work forecasted in a way that can plausibly be executed?
    - Are due dates and task states coherent?

4. Execution health
    - How much WIP exists?
    - Are active tasks aging?
    - Are blocked tasks getting attention?
    - Is recent activity moving toward completion or just creating more work?

5. Drift and scope control
    - Did recent activity imply a direction change?
    - Are there contradictions between docs, goals, and tasks?
    - Are there new threads that should become separate projects?

6. Risk and decision quality
    - Are risks explicit?
    - Are open questions blocking progress?
    - Are important decisions captured or scattered in docs?

7. Dependency and stakeholder readiness
    - Are dependencies visible?
    - Are handoffs and external commitments clear?
    - Are calendar commitments aligned with project priority?

8. Evidence freshness
    - Which docs/tasks are stale?
    - Which audit conclusions rely on old or weak evidence?
    - What should the user verify?

## Audit Output Shape

A complete audit should feel like a consultant memo.

Suggested structure:

1. One-page summary
    - Delivery confidence: Green / Yellow / Red / Unknown.
    - Current project thesis.
    - Top 3 findings.
    - Top 3 recommended actions.

2. What changed since last audit
    - Major additions.
    - Major removals.
    - Date/goal/scope changes.
    - New risks or contradictions.

3. Health matrix
    - Dimension.
    - Rating.
    - Evidence.
    - Why it matters.
    - Suggested action.

4. Evidence appendix
    - Referenced docs, tasks, goals, milestones, risks, and events.
    - Excerpts where useful.
    - Last-updated timestamps.

5. Proposed review items
    - Small items can become normal Project Inbox suggestions.
    - High-risk recommendations remain recommendations until the user asks for
      a concrete change.

## Guardrails

Do:

- Require evidence for every finding.
- Show uncertainty explicitly.
- Prefer fewer, higher-signal findings.
- Separate diagnosis from mutation.
- Preserve user agency: no audit action should silently rewrite project data.
- Let users dismiss or correct audit findings.
- Avoid running full audits on immature projects.
- Respect cooldowns and quiet periods.
- Make the reason for each audit visible: scheduled, burst, critical change, or
  manual.

Do not:

- Generate a full audit just because one document was edited.
- Re-audit every day because the project is large.
- Treat task count alone as evidence of progress.
- Treat document count alone as evidence of project maturity.
- Create long lists of speculative recommendations.
- Hide source evidence behind generic summaries.
- Turn every audit finding into an approval item.
- Use audit scores as absolute truth; they should be confidence-weighted
  reviewer judgments.

## Suggested Trigger Algorithm

Use this product algorithm:

1. Calculate project maturity.
    - If below baseline, suppress complete audit and run light review only.

2. Classify project size.
    - Small, medium, large, strategic/high-risk.

3. Check scheduled cadence.
    - If eligible, active, and last audit is older than 14 days, schedule audit.
    - Skip if there is no meaningful activity since last audit.

4. Check burst score.
    - Sum weighted changes across rolling windows.
    - Compare to project-size threshold.
    - Apply critical-change override if needed.

5. Apply safety controls.
    - Enforce 7-day full-audit cooldown unless critical.
    - Wait for quiet period after burst.
    - Do not queue if another complete audit is running.

6. Pick audit depth.
    - Light review: current loop families only.
    - Standard audit: all dimensions, concise report.
    - Deep audit: large/strategic projects only, larger evidence appendix and
      stronger cost budget.

7. Create an audit packet.
    - Persist summary, dimension ratings, evidence refs, and proposed follow-up
      review items.

## Open Questions

- Should complete audit be a new `project_suggestions.kind`, a new
  `project_audits` table, or a richer `project_loop_runs.brief` subtype?
- Should audit findings become inbox items one by one, or should the audit
  packet be reviewed as a single artifact?
- Should large strategic projects allow weekly audits, or should 14 days remain
  the default with burst overrides?
- What is the right word in product UI: Audit, Health Check, Consultant Review,
  or Project Assurance?
- Should users be able to configure audit appetite per project?
- How should audit output interact with Start Here and project briefs?

## Recommendation

Treat Complete Project Audit as the fourth product family, distinct from the
current light review families. The light review pass keeps projects tidy day to day.
The full audit should run only when the project has enough substance and either
enough time or enough change has accumulated.

The product promise should be:

"BuildOS periodically reviews your project like an outside consultant, but only
when there is enough project substance or enough change to make that review
worth your attention."
