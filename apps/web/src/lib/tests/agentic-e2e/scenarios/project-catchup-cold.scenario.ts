// apps/web/src/lib/tests/agentic-e2e/scenarios/project-catchup-cold.scenario.ts
//
// The cheap measurement that decides whether the mechanical START HERE running-log flow is
// worth building (DJ, 2026-07-26). Projects are mutated through many channels — chat, manual
// edits, third-party agents, loops — so START HERE goes stale. The user-visible question is
// whether a COLD session can still deliver an accurate "what's been happening lately" by
// reading the live surfaces past a stale START HERE.
//
//   PASSES → the read side already synthesizes catch-ups; the async refresh is an efficiency
//            play, not a correctness fix, and can wait.
//   FAILS  → the agent parrots the stale summary (or answers thin), and the mechanical
//            channel-agnostic refresh (tasker/40) earns its build with this scenario as its
//            measuring stick.
//
// The seed makes staleness detectable: START HERE describes an OLD state ("still drafting the
// proposal", "leaning annual pricing") while the live entities carry three fresh developments
// (proposal task done, a waiting-on-reply task, a decision doc that settled on monthly).
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	normalizeComparableText
} from '../harness/assertions';
import { waitForTurnRun } from '../harness/telemetry';

const START_HERE_TITLE = 'START HERE - Meridian Launch';

// Deliberately stale: contradicted by the live entity state on every load-bearing fact.
const STALE_START_HERE = `# START HERE - Meridian Launch

## Where this project is right now
Still drafting the launch proposal for Meridian Retail. Nothing has gone out yet.

## Open questions
- Pricing model undecided — currently leaning toward annual-only billing.`;

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Catchup Cold'),
			type_key: 'project.business.product_launch',
			// Neutral on purpose — the first version said "with a stale START HERE", which
			// leaked the test's premise into the model's context.
			description: 'Product launch for Meridian Retail.'
		},
		entities: [
			{
				temp_id: 'proposal',
				kind: 'task',
				title: 'Send launch proposal to Meridian Retail',
				description: 'Full proposal with pricing and rollout plan.',
				type_key: 'task.default',
				state_key: 'done'
			},
			{
				temp_id: 'waiting',
				kind: 'task',
				title: 'Waiting to hear back from Meridian Retail on the proposal',
				description: 'Proposal sent; their buying committee reviews on Thursdays.',
				type_key: 'task.default',
				state_key: 'todo'
			},
			{
				temp_id: 'pricing-decision',
				kind: 'document',
				title: 'Decision: monthly pricing',
				body_markdown:
					'# Decision: monthly pricing\n\nWe are going with monthly billing, not annual-only. ' +
					'Annual discount stays on the table for later. Decided after the Meridian pre-read.'
			},
			{
				temp_id: 'start-here',
				kind: 'document',
				title: START_HERE_TITLE,
				body_markdown: STALE_START_HERE
			}
		],
		relationships: []
	};
}

export const projectCatchupColdScenario: Scenario = {
	id: 'project-catchup-cold',
	title: 'Cold session catch-up reflects live state, not the stale START HERE',
	category: 'document',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		return { projectId, entityIds: {}, notes: {} };
	},
	turns: [
		{
			contextType: 'project',
			coldSession: true,
			entityIdFromSeed: (seed) => seed.projectId,
			message: "catch me up — what's been going on in this project lately?",
			assert: async (turn, ctx) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'a catch-up question is read-only');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const text = normalizeComparableText(turn.assistantText);

				// Grounding: the reply must carry the FRESH facts. Each signal is phrased so a
				// weak model's wording still matches; two of three proves it read past the
				// stale summary.
				const freshSignals: Array<{ label: string; hit: boolean }> = [
					{
						label: 'proposal sent/done',
						hit: /(sent|delivered|completed|done)/.test(text)
					},
					{
						label: 'waiting on reply',
						hit: /(waiting|hear back|awaiting|response)/.test(text)
					},
					{ label: 'monthly pricing decision', hit: /monthly/.test(text) }
				];
				const hits = freshSignals.filter((signal) => signal.hit);
				if (hits.length < 2) {
					throw new Error(
						'[assert] the catch-up is not grounded in the live project state. ' +
							`Fresh signals found: [${hits.map((h) => h.label).join(', ') || 'none'}] ` +
							`(need >=2 of 3). Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}

				// Anti-parrot: the stale START HERE's claims must not survive as current fact.
				// A reply carrying ALL THREE fresh facts that also mentions a stale phrase has
				// almost certainly surfaced the contradiction (good behavior) — only fail when a
				// stale claim appears WITHOUT full fresh grounding, i.e. it is being repeated as
				// the truth rather than corrected.
				const staleMatch = text.match(/(still drafting|nothing has gone out|undecided)/);
				if (staleMatch && hits.length < freshSignals.length) {
					throw new Error(
						`[assert] the catch-up repeats the stale START HERE claim "${staleMatch[1]}" ` +
							'as current fact without full fresh grounding ' +
							`(fresh signals: [${hits.map((h) => h.label).join(', ')}]). ` +
							`Assistant text: "${turn.assistantText.slice(0, 1200)}"`
					);
				}
			},
			judge: async (turn) => ({
				rubric:
					'In a brand-new chat with no history, the user asked to be caught up on the project. ' +
					"The project's START HERE summary is stale: it says the proposal is still being drafted " +
					'and pricing is undecided. The live state says the proposal was SENT (task done), the team ' +
					'is WAITING to hear back, and pricing was DECIDED as monthly. A good catch-up reports the ' +
					'live state accurately and briefly, ideally noting what is next (waiting on Meridian). ' +
					'Penalize heavily: repeating the stale summary as if current, inventing activity that did ' +
					'not happen, or a vague answer that names no concrete developments.',
				threshold: 3,
				transcript: buildTranscript(turn)
			})
		}
	]
};
