---
name: Project Forecast
description: Project-scoped forecasting playbook for projecting trajectory, goal attainment, emerging work, schedule risk, assumptions, and next strategic moves while staying in project context.
legacy_paths:
    - project.forecast.skill
    - project.forecast
    - workflow.forecast.skill
    - workflow.forecast
    - forecast.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_forecast/SKILL.md
---

# Project Forecast

Project-scoped forecasting playbook for projecting trajectory, goal attainment, emerging work, schedule risk, assumptions, and next strategic moves while staying in project context.

## When to Use

- The context type is `project` and the user asks to forecast, predict, scenario-plan, estimate timing, or assess whether the project is on track
- You need to determine where the project is headed, whether current trajectory reaches the goals, and what future milestones, goals, plans, or tasks are likely to emerge
- The user asks what it will take to reach a specific goal, what could slip, what hidden work is likely, or what strategy should come next
- The forecast may benefit from light research about the domain, market, creative constraints, technical path, or comparable work
- The answer depends on assumptions and uncertainty rather than a static status summary

## Workflow

1. Keep the chat in `project` context. Do not switch to a `project_forecast` context type.
2. Start from a concrete project scope and reuse the in-context project_id when available.
3. Gather the current trajectory: active and completed tasks, blocked work, plan states, milestone due dates, goal progress, unresolved risks, documentation context, and upcoming calendar commitments.
4. Identify the goal horizon. If the user names a goal, forecast what it will take to reach that goal. If no goal is named, forecast against the project's stated goals, nearest milestones, and apparent next_step_short or equivalent status.
5. Distinguish hard facts from assumptions before forecasting. Name what is observed, what is inferred, and what is unknown.
6. Evaluate whether the project is on track: compare remaining work against timeline, velocity, blocked work, scope, dependencies, and calendar capacity.
7. Project likely emerging work: name tasks, decisions, documents, milestones, or related goals that are likely to appear if the project continues on its current path.
8. Project strategic gaps: identify missing plans, missing research, missing documentation, missing owners, unclear milestones, or future risks that will matter soon even if they are not blocking today.
9. Use creative but grounded scenario thinking. Offer likely path, upside path, and risk path when useful, but keep each scenario tied to evidence and assumptions.
10. Use light research when the forecast depends on external reality, industry norms, technical feasibility, audience expectations, market timing, or domain knowledge that is not in the project context. Prefer research to guessing when external constraints could materially change the forecast.
11. Use targeted reads when key schedule, goal, task, document, or risk fields are absent from the snapshot or when the user asks for a wider date range.
12. State the forecast as a trajectory with assumptions and confidence, not as certainty.
13. If dates are sparse, forecast directionally instead of inventing precise deadlines.
14. Separate what is likely to happen, what might happen if conditions change, and what should be done next.
15. End with the smallest set of actions that would improve the forecast materially.

## Related Tools

- `util.project.overview`
- `onto.project.graph.get`
- `onto.task.list`
- `onto.plan.list`
- `onto.milestone.list`
- `onto.goal.list`
- `onto.risk.list`
- `cal.event.list`
- `onto.document.tree.get`
- `util.web.search`
- `util.web.visit`

## Guardrails

- Do not invent dates, durations, dependencies, or capacity that were not observed or clearly inferred.
- Do not present a forecast as certainty when the schedule data is thin.
- Keep confidence proportional to evidence.
- Forecasting is analysis by default; do not make write changes unless the user explicitly asks for them.
- Make uncertainty useful: say what evidence would raise confidence.
- Do not frame the forecast as only a deadline estimate. Forecast trajectory, emerging work, future decisions, and goal pathing.
- Do not invent future tasks as if they already exist. Label them as likely next tasks, candidate tasks, or possible missing work.
- Do not research everything by default. Research only when external context would change the forecast.
- Do not ignore project ambition. A forecast should help the user see where the project is going, not merely summarize current status.

## Examples

### Forecast whether a milestone is likely to land on time

- Load `project_forecast` from project context.
- Inspect the supporting tasks, plan state, unresolved risks, and upcoming calendar commitments.
- Identify what work is on the critical path versus merely related.
- State the likely outcome, the assumptions behind it, and the biggest drivers of uncertainty.

### Forecast what it will take to reach a goal

- Identify the goal, its supporting milestones, plans, tasks, docs, and risks.
- Name the remaining work and likely missing work.
- Recommend the next tasks, documents, milestones, or decisions that would make goal attainment more likely.

### Estimate near-term project slippage risk

- Read active tasks, blocked work, near-term milestones, and open risks.
- Use calendar reads if work sessions or deadlines outside the context window matter.
- Present the forecast with explicit confidence and the top corrective actions.

### Forecast emerging work and adjacent goals

- Inspect current goals, plans, and documents for implied next phases.
- Suggest likely future milestones, candidate tasks, and adjacent goals that logically follow from the current project direction.
- Label each suggestion as likely, possible, or speculative based on evidence.

### Forecast with light research

- Use research when project context alone cannot answer feasibility, market timing, technical approach, or audience expectations.
- Connect research back to concrete project choices.
- Keep the forecast grounded in the user's project, not a generic industry report.

## Notes

- A project forecast is a forward-looking project skill, not a separate chat context.
- When evidence is thin, a narrow, honest forecast is better than a precise but fabricated one.
- Good forecast output usually has: current trajectory, on-track assessment, likely outcome, emerging work, hidden risks, assumptions, confidence, and next moves.
- A useful forecast can create new strategic clarity: what goals should be added, what milestones should be planned, what tasks will likely be needed, and what documentation would change the odds.
