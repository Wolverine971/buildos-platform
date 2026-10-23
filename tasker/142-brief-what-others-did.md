<!-- tasker/142-brief-what-others-did.md -->

# 142 — Daily brief: what other people and their agents did on your projects

**Status:** BUILT, UNCOMMITTED (ambitious version, 2026-10-23) · **Priority:** P2 · **Opened:** 2026-10-23  
**Owner:** Claude · **Open:** worker deploy; two-account check on a shared project; optional paid brief run (~$0.01–0.02, needs DJ's OK)

## Built (2026-10-23)

DJ picked the ambitious version: one "While you were away" section that covers other people, their agents, **and your own agents** ("Your Codex updated 10 tasks and 3 docs"). It replaces the old top-level "Recent Activity" list.

- `apps/worker/src/workers/brief/othersActivityBriefSection.ts` (new): reads other people's rows plus every agent-signed row in a separate query (so your own edits can't crowd others out), from the last brief (clamped to 12 h–7 days; 24 h with no earlier brief). Groups by project, then person/agent. One line each with up to 3 linked items: ✅ finished, ~~removed~~. Same-named connections of one agent merge into one line. Owner marked on shared projects.
- "Finished" is read from `state_key` moving to done. The log has no `completed` action, so the old `action === 'completed'` checks never fired. The loader now normalizes that too.
- `ontologyBriefDataLoader.ts`: per-project activity entries name agents ("Your Codex") instead of crediting the owner. Adds `loadOthersActivityBriefSection`.
- `ontologyBriefGenerator.ts`: section above Project Details (the email cuts there). The old "Recent Activity" block is removed. "Recent Wins" no longer depends on the dead `completed` check.
- `ontologyPrompts.ts`: a short per-project block in the executive-summary prompt, mention-only-if-it-matters.
- Tests: `apps/worker/tests/othersActivityBriefSection.test.ts`, `apps/worker/tests/ontologyBriefGenerator.othersActivity.test.ts`. 93 brief tests green, worker typecheck + lint clean.
- Real data, read-only, no LLM: DJ's account renders the section from production logs (Codex on Wayne Strategies, Claude Code on Radar, Codex on Cadre). The email renderer keeps links, ✅ and strikethrough.

Prod facts at build time (30 days): 0 edits by non-owners, 422 agent-signed edits all by owners' own agents. "Other people" lines need the People layer live (tasker 145) and a second account.

## What users get

When other people (or their agents) work on your projects, your morning brief tells you, per person: "Sam: added 3 tasks and finished 'Draft launch email' in 9takes. Sam's agent: updated 2 docs." On projects someone else shared with you, it tells you what the owner and others did since your last brief.

## DJ direction (2026-10-23)

"Per person, getting notified what got changed is interesting. To be able to get an overview of other people's changes on my project, or other people's changes on a shared project ... we need to make sure we build that into the brief."

## What exists today

- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` loads `onto_project_logs` per project (`changed_by_actor_id`, `changed_by`, capped by `ACTIVITY_LOG_LIMIT`) and resolves `actorName`. It already loads owned and shared projects (`isShared`).
- `ontologyBriefGenerator.ts` renders "Recent Activity": at most 3 projects, 2 entries each, only when there are more than 3 updates. Shared projects get a sub-heading. It does not separate you from others, does not group by person, and does not mark agent changes.
- Agent changes are signed with `external_agent_caller_id` on the project log (people layer), so "Sam's agent" can be told apart from Sam.
- Members already get a batched project-activity notification (`project.activity.batched`, `apps/web/src/lib/server/activity-timeline.service.ts`); the brief should agree with it.

## Work

1. **Data:** for each project in the brief, group the window's log rows by actor, excluding the brief's own user. Mark rows with `external_agent_caller_id` as "<person>'s agent" (owner of the caller). Count by action (created, updated, completed, commented) and keep the top 2–3 titles per person. Window = since the last brief, else 24 h.
2. **Brief section:** "What others did", before Project Details. Your projects first, then shared projects. Skip when nobody else did anything. Per person, one line plus up to 3 linked items.
3. **LLM context:** pass the per-person summary into the brief prompt (`ontologyPrompts.ts`) so the written summary can mention it; keep it short.
4. **Email/brief rendering:** check the email version renders the section the same way.
5. **Tests:** loader grouping (self excluded, agent attribution, shared vs owned) and generator rendering with fixtures. Free only. One local fixture brief run, no LLM.

## Exit

A brief for a user with a shared project shows per-person changes from yesterday, with agents labeled, verified on a real account. If that needs a paid brief generation, ask DJ first.
