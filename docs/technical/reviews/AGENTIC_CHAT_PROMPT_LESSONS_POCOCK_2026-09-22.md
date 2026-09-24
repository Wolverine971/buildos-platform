<!-- docs/technical/reviews/AGENTIC_CHAT_PROMPT_LESSONS_POCOCK_2026-09-22.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-22; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat prompt lessons from the Matt Pocock interview (2026-09-22)

Source: The Pragmatic Engineer podcast with Matt Pocock (https://www.youtube.com/watch?v=4DhcSPkEbwI), transcript at `docs/research/youtube-library/transcripts/2026-09-17_the-pragmatic-engineer_ai-skills-with-matt-pocock.md`.
Compared against the worker prompt as shipped in the static-frame rewrite (`artifacts/agentic-chat-worker-system-prompt-REWRITE-2026-09-21.md`), the six root skills, the situational rule lines, the actor/reviewer commission guidance, and the ontology write tool definitions.

## Verdict

The prompt already applies the video's context lessons (lean context, ground in evidence, act on what the tool returned, preloaded playbooks). Where it differs is in how it steers. The prompt steers by enumerating failure shapes and prohibitions. The video steers by naming a concept the model already knows (a "leading word") and by building a shared vocabulary with the user so both sides say more with fewer words. Three lessons transfer. Two of them are prompt-only and cheap to test. One (the vocabulary loop) is the product-visible one and needs all three layers.

## What the video actually claims

1. Leading words (Leitwort). Repeat a phrase from the model's prior ("tracer bullet", "vertical slice", "deep module") two or three times in a skill or prompt; the model echoes it in its own reasoning and its behavior shifts. Cheaper than explaining the behavior.
2. Ubiquitous language (DDD). Build a domain vocabulary with the agent during ideation ("materialization cascade"), then use it in prompts and in the artifact itself. Result: fewer words per request, easier navigation, less verbosity.
3. Grill me. Have the agent interview the user before large, hard-to-reverse work. Not for small changes: "shift right" and align after the fact when the change is cheap to undo.
4. Smart zone. Roughly the first 150K tokens of any model; every token competes for attention. Portion work across sessions (Ralph loops, one ticket per session).
5. Feedback loops and proof. Tracer bullets, vertical slices, "provide proof your change does what it purports to do". A bad test suite gives the agent bad signal.
6. Two document types. A destination doc (spec) and tickets, plus a map with fog of war (Wayfinder) whose nodes are grill, prototype, research, or task tickets.
7. Entropy and the gardener. Agents raise software entropy; "your code is the environment the agent operates in"; optimize for a worker with no memory.
8. Observability. Instrument every agent's success rate; someone's job is to read that data; converge on a shared skill set and A/B it.
9. Skills should be small and auditable. Grill Me is tiny and gets emergent behavior.

## Scorecard: where the BuildOS chat stands

| Video lesson              | BuildOS today                                                                                                                                                                                                                                                                                      | Gap                                                                                                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smart zone / lean context | Read turn is ~10.7K chars (~2.7K tokens), prefix-cached, "loaded context first" heuristic. Per-pass write routing (~1.4–2.2K) + actor commission guidance (~1K) ride every pass.                                                                                                                   | Not binding. The turn is far inside any smart zone. The relevant cost is per-rule attention on a mid-tier acting model, not position.                                                                                                                                                                       |
| Feedback loops / proof    | Receipts; "a write counts once its tool succeeded"; independent contract reviewer; gate + judge with provenance.                                                                                                                                                                                   | None at harness level.                                                                                                                                                                                                                                                                                      |
| Leading words             | Some already present and working: "receipts", "bounded search", "untrusted source data", "preparation is not completion", "a stated gap beats a plausible guess". The Final Response Contract's two status bullets (~1.5K chars) are the opposite: an enumeration of banned sentences.             | The enumeration is kept verbatim because a _shorter generic_ variant regressed case 14 on Pareto (09-21). A _leitwort-anchored_ variant has not been tried.                                                                                                                                                 |
| Ubiquitous language       | BuildOS's own ontology (goal, milestone, plan, task, document, risk) is defined in Identity. The user's project vocabulary has a home: Start Here → "Vocabulary and mental model" (`packages/shared-agent-ops/src/ontology/start-here.ts`), and the prompt says to read Start Here for vocabulary. | The prompt never tells the model to _use_ those terms in replies, titles, and descriptions, or to _grow_ the section when the user introduces a term. project_creation never seeds it.                                                                                                                      |
| Grill me                  | Worker lane drops the clarification bullet; clarification exists only as a reviewer tool. project_creation says "Do not wait for perfect detail before creating the project."                                                                                                                      | Correct for activation. The BuildOS-native, non-blocking form is Start Here → "Open questions", which the prompt reads but the agent never writes.                                                                                                                                                          |
| Two documents + map       | Goal = destination, plan = route, task = ticket, Start Here = map, Open questions = fog of war, daily brief/loops = morning standup.                                                                                                                                                               | None. This is a story worth telling (see below).                                                                                                                                                                                                                                                            |
| Small auditable skills    | Root skills 6–10K bytes with an 11-block ontology; the worker renders Activation, Procedure, Policy, Contract, and one Example.                                                                                                                                                                    | "Resolve the exact id, else read, else ask one clarification" is taught in task_management (Procedure + Example), document_workspace (Procedure + Example), the worker write rule line, actor commission guidance line 2, and the reviewer prompt. On a preloaded write turn the model reads it four times. |
| Observability             | Gate scorecards, judge, provenance, tasker trackers.                                                                                                                                                                                                                                               | The full Cedar House gate has never passed (45/52, 41/52). The video's point stands: someone has to read the data, and that is DJ.                                                                                                                                                                          |

## Proposals, ranked

### 1. Leitwort rewrite of the Final Response Contract status bullets (prompt only, testable for under $1)

Hypothesis: the two status bullets fail on Pareto when shortened because the _examples_ carry the behavior, not the prose. A leading word can carry the principle while the three canonical example sentences stay. The 09-21 "concise" variant dropped the examples and used a generic yes/no sentence; that is a different experiment.

Proposed replacement for the two bullets (about 700 chars against ~1,500):

```
- The record is not the event. A plan, a todo task, a planning state, or an empty search describes what BuildOS holds, never what has physically happened. Report actual start, completion, approval, and payment as confirmed yes, confirmed no, or unknown; both yes and no need explicit event evidence, and everything else is unknown from the records checked, with the bounded search scope named. Never open an unknown with "No", "None", or "Not yet". Canonical shapes: "Planned start: September 14. Actual start: unknown from the records checked." "Permits approved: Unknown — no approval record found in the scope checked." "Project state: planning. Actual progress: unknown from the records checked."
```

Repeat the leitwort once in Operating Strategy, where the video says repetition does the work:

```
- A complete empty result is an answer. Do not rerun it with synonyms or other record types; an absent record never proves an event did not happen. The record is not the event.
```

Test: the synthesis-probe method from `output/case14-grounding-2026-09-14/synthesis-probe.ts` (6 evidence scenarios × 2 emission paths × 3 reps, judge-scored) on the production acting route. Budget was $0.95 last time. Needs approval before running. Do not use the full gate for this.

### 2. Speak the project's language (the vocabulary loop; all three layers)

This is the product-visible lesson. The user should feel, within the first session, that the assistant uses their words, and the project's titles and descriptions should converge on those words so search and the Knowledge Map get sharper.

Prompt (Operating Strategy, one heuristic, ~230 chars, static and cacheable):

```
- Speak the project's language. Prefer the terms in Start Here's Vocabulary section over BuildOS's generic ones in replies, titles, and descriptions. When the user names a recurring concept that Vocabulary lacks, use their term and record it when this turn can write.
```

Situational rule (write turns with a living-workspace agreement, `situational-rules.ts` LIVING_WORKSPACE_RULE_LINES, one line):

```
- A term the user coins for a recurring concept is a durable addition: add it to Start Here under "Vocabulary and mental model" with a one-line meaning.
```

Skill (`project_creation` Contract): after the create succeeds, the summary names the two or three project-specific terms the user used, so the next turn can record them. The create payload has no vocabulary field, so seeding happens on the following write, not at create.

Tool: today the only path is `update_onto_document` with `update_strategy: "merge_llm"` and a merge instruction naming the section (a model call per write). A section-scoped tool would make the write deterministic, cheap, and reviewable as a single ordinary mutation. It should **rewrite, not append**. Tasker/93 (same day) showed that append-only Start Here writes pile up restated terms, decisions, and invented dates. Session-end capture now sends full section bodies through `reconcileStartHereAuthoredSections` in `start-here.ts`. That function never wipes a section, collapses same-title bullets (so "one definition per term" is enforced in code), and owns date stamps. So the tool shape is `update_start_here_section({ project_id, section, content })`, where `content` is the complete new section body and the tool calls that reconciler. Do not expose `appendStartHereAuthoredSectionUpdates` as a tool.

### 3. Non-blocking grill: Open questions as the interview surface (prompt + skill, needs one harness decision)

Full grill-me before creating a project would break the "turn messy thinking into structured work" promise. The BuildOS form: act first, then leave the two decisions that would most change the shape in Start Here → Open questions, and mention one in the reply. The user answers when they want.

Prompt (Operating Strategy, one line):

```
- After a structural write (new project, plan, or milestone set), name at most two decisions that would most change its shape. Leave them as Open questions in Start Here rather than asking before acting.
```

Two conflicts to resolve before this ships:

- LIVING_WORKSPACE_RULE_LINES says assistant-generated questions are proposals and must not be written. Open questions in Start Here needs an explicit carve-out as the one durable home for agent-raised questions.
- The contract reviewer rejects outcomes the user did not commission. An Open-questions append after a commissioned create is an extra outcome. Cleanest fix: the model emits the questions in a structured field on the create's summary and the worker appends them deterministically (no model write, nothing to review).

### 4. Hygiene: teach "resolve the target" once per lane

Drop the repeated "reuse the exact id, else read, else ask one clarification" sentence from the Examples blocks of task_management and document_workspace (keep it in Procedure). On the worker lane the write rule line and actor guidance already carry it. Small, low risk, saves ~400 chars per preloaded write turn.

## What not to take from the video

- Full grill-me before creating. Activation killer; project_creation's "do not stall" policy is right.
- The 150K-token smart zone. BuildOS turns run around 7K prompt tokens; context position is not the constraint.
- Ralph loops and context clearing. Turns are already short and stateless.
- Its evidence base. The claims are anecdotal and made on frontier models (Opus 4.5 and later). The BuildOS acting route is Pareto/DeepSeek class, whose priors on these terms may be weaker. Every leitwort change gets probe-tested before it ships.

## The story (for the FDE narrative)

A BuildOS project is already the structure the video reinvents for coding agents: the goal is the destination doc, the plan is the route, tasks are one-session tickets, Start Here is the map, Open questions is the fog of war, and the daily brief is the morning standup with the agent. The video's audience is building this by hand out of markdown files. BuildOS ships it as a product with an agent that reads and writes it. That is a concrete "we built the harness the industry is converging on" line.

## Pickup

- Prompt source: `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` (Operating Strategy ~line 1370, Final Response Contract section), `situational-rules.ts` for the rule lines.
- Skills: `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/{project_creation,task_management,document_workspace}/SKILL.md`.
- Reviewer sanction: `apps/worker/src/workers/agentic-chat/provider/review/controls.ts` (SEMANTIC_COMMISSION_GUIDANCE) and `turn-contract.ts`.
- Start Here service: `packages/shared-agent-ops/src/ontology/start-here.ts` (`reconcileStartHereAuthoredSections`, `replaceStartHereAuthoredSections`; see tasker/93 for why not the append helper).
- Before any prompt edit: regenerate the worker-scaffold dump and re-run `prompt-size-budget.test.ts` (cap is measured+5%, 11,250 chars read turn).
