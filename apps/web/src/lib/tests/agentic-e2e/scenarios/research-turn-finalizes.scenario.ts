// apps/web/src/lib/tests/agentic-e2e/scenarios/research-turn-finalizes.scenario.ts
//
// DJ's #1 and #3 reported failures, both of which happen on the SAME turn shape:
// an open-ended request that sends the agent off doing several rounds of tool
// calls before it can answer.
//
//   #1 "I'll ask it to go update a task or go do something, and it'll do a bunch
//      of research. I'll see it making tool calls, but then it fails to deliver a
//      response. I think it went over budget with its tool calls and then failed
//      to deliver the result."
//
//   #3 "There'll be a long pause and then it just comes back with all the results
//      in one swoop. I'd rather it say 'okay, I'm gonna research this' and then go
//      look, so the user isn't waiting without understanding what's going on."
//
// Both are checkable and neither was covered. #1 is `assertNonEmptyAssistantText`:
// the stream can reach a terminal `done` with an empty body, so `assertTurnSucceeded`
// passes while the user sees nothing. #2 is `assertNarratedBeforeActing`: SSE events
// are ordered, so "said something before the first tool call" is a fact, not a vibe.
//
// This also covers the surface DJ flagged as untested — "when I'm talking about
// plans, goals, and documents, I haven't tested these out that much." The prompt is
// his: point at a document, ask what's next, let it act.
//
// NOTE ON A NARRATION FAILURE: it can mean the model emits no preamble, or that the
// server buffers text until after the tool round. Check the raw event order in the
// failure message before assuming which.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNarratedBeforeActing,
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	mutatingToolCalls
} from '../harness/assertions';
import { getDocumentByTitle, listTasks, waitForTurnRun } from '../harness/telemetry';

const ROADMAP_TITLE = 'Q3 Roadmap';

const ROADMAP_CONTENT = `# Q3 Roadmap

## Shipped
- Self-serve signup
- Billing portal

## In flight
- Usage-based pricing migration
- SOC 2 evidence collection

## Not started
- Onboarding rework — blocked on the pricing migration landing first
- Enterprise SSO — two deals are asking for it
- Churn instrumentation — we still cannot see where accounts drop off`;

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Roadmap Synthesis'),
			type_key: 'project.business.product_launch',
			description: 'A SaaS product mid-quarter with a roadmap document and live work.'
		},
		entities: [
			{
				temp_id: 'roadmap',
				kind: 'document',
				title: ROADMAP_TITLE,
				body_markdown: ROADMAP_CONTENT
			},
			{
				temp_id: 'pricing',
				kind: 'task',
				title: 'Finish the usage-based pricing migration',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 1
			},
			{
				temp_id: 'soc2',
				kind: 'task',
				title: 'Collect SOC 2 evidence for the access-control controls',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 2
			}
		],
		relationships: []
	};
}

export const researchTurnFinalizesScenario: Scenario = {
	id: 'research-turn-finalizes',
	title: 'A multi-tool synthesis turn narrates, then finishes with a real answer',
	category: 'document',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const roadmap = await getDocumentByTitle(ctx.db.admin, projectId, ROADMAP_TITLE);
		if (!roadmap) throw new Error('[seed] failed to seed the roadmap document');
		const seeded = await listTasks(ctx.db.admin, projectId);
		return {
			projectId,
			entityIds: { roadmap: roadmap.id },
			notes: { seededTaskIds: seeded.map((t) => t.id) }
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			// Dictated. Open-ended enough to force several tool rounds, with a write
			// at the end — the exact shape that drops the final response.
			message:
				`hey look at the ${ROADMAP_TITLE.toLowerCase()} doc and figure out what the next thing ` +
				'i should be doing is. check what tasks are already open so you know where things stand, ' +
				"and if something on there isn't tracked yet go ahead and add it",
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);

				// Precondition: this scenario only measures anything if the turn
				// actually took the multi-round path. A single-call turn is not a
				// bug — it means this run did not exercise the failure condition.
				if (turn.toolCalls.length < 2) {
					throw new Error(
						`[assert] precondition not met: only ${turn.toolCalls.length} tool call(s) ` +
							`([${turn.toolCalls.map((c) => c.function.name).join(', ') || 'none'}]). ` +
							'This scenario measures multi-round finalization; it measured nothing. ' +
							'Widen the prompt rather than treating this as a product failure.'
					);
				}

				// DJ failure #3 — the silent pause.
				assertNarratedBeforeActing(turn);

				// DJ failure #1 — the dropped final response. A synthesis answer that
				// is under ~120 chars after multiple tool rounds is a swallowed turn,
				// not a concise one.
				assertNonEmptyAssistantText(turn, 120);

				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				// Mutation honesty (L0 invariant): if it called a write tool, a row
				// must exist. Claiming a write that did not land is worse than not
				// writing — but not writing at all is legal here, since "if something
				// isn't tracked yet" leaves the judgment to the agent.
				const seededIds = new Set(seed.notes.seededTaskIds as string[]);
				const created = (await listTasks(ctx.db.admin, seed.projectId!)).filter(
					(t) => !seededIds.has(t.id)
				);
				seed.notes.createdTitles = created.map((t) => t.title);
				const writes = mutatingToolCalls(turn);
				if (writes.includes('create_onto_task') && created.length === 0) {
					throw new Error(
						'[assert] create_onto_task was called but no new task exists — a claimed ' +
							'write did not land (mutation-honesty violation)'
					);
				}
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					'The user pointed at a Q3 Roadmap document and asked what to work on next, told the ' +
					'assistant to check open tasks first, and authorized it to add anything untracked. ' +
					'A good result: the assistant read the roadmap AND the task list, gave a specific ' +
					'recommendation that reflects both (e.g. noticing the onboarding rework is blocked ' +
					'behind the in-flight pricing migration, or that churn instrumentation and enterprise ' +
					'SSO are untracked), and finished with a clear answer the user can act on. Penalize: ' +
					'a generic prioritization lecture that could apply to any roadmap, recommending work ' +
					'that is already in progress as if it were new, or trailing off without a recommendation.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					tasksCreatedThisTurn: seed.notes.createdTitles ?? []
				})
			})
		}
	]
};
