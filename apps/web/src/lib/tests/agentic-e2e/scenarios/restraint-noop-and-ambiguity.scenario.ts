// apps/web/src/lib/tests/agentic-e2e/scenarios/restraint-noop-and-ambiguity.scenario.ts
//
// Two restraint cases in one session, because both need the same fixture and the
// harness spends real money per turn.
//
//   Turn 1 — the no-op. The user mentions a task in passing and asks only for a
//   read. Any write is spurious. Nothing in the suite could catch this before:
//   there was no way to assert that a turn wrote NOTHING.
//
//   Turn 2 — the ambiguous referent. Three tasks match "the email one". The
//   correct behavior is to ask, and to hold off writing while asking. Asserting
//   the question WITHOUT asserting zero writes would pass an agent that guessed
//   and then asked about it afterwards.
//
// Calibration note from DJ's interview (2026-07-25): he reports spurious writes
// are rare — "very rarely has this happened where it actually did something I
// didn't want it to." So turn 1 is a regression guard, not a bug hunt, and it is
// expected to pass. Turn 2 is the live question: he has confirmed the agent
// disambiguates well ACROSS projects in global context, but intra-project
// ambiguity — several similar tasks inside one project — is untested.
//
// Turn 1 deliberately name-drops a NON-email task, so the conversation history it
// leaves behind cannot accidentally disambiguate turn 2.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertAnyToolCalled,
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertQuestionAsked,
	assertRowsUnchanged,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	rowFingerprint
} from '../harness/assertions';
import { listTasks, waitForTurnRun } from '../harness/telemetry';

/** Three tasks that all match "the email one" — the distinguishing token each carries. */
const EMAIL_TASKS: Array<{ title: string; token: string }> = [
	{ title: 'Send the launch email to the beta list', token: 'beta' },
	{ title: 'Draft the investor update email', token: 'investor' },
	{ title: 'Fix the email verification bug on signup', token: 'verification' }
];

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Restraint'),
			type_key: 'project.business.product_launch',
			description: 'A launch project with several overlapping email tasks in flight.'
		},
		entities: [
			...EMAIL_TASKS.map((task, index) => ({
				temp_id: `email-${index}`,
				kind: 'task' as const,
				title: task.title,
				type_key: 'task.default',
				state_key: 'todo'
			})),
			{
				temp_id: 'pricing',
				kind: 'task' as const,
				title: 'Finish the usage-based pricing migration',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 1
			}
		],
		relationships: []
	};
}

export const restraintNoopAndAmbiguityScenario: Scenario = {
	id: 'restraint-noop-and-ambiguity',
	title: 'Write nothing on a passing mention, and ask instead of guessing when ambiguous',
	category: 'task',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const tasks = await listTasks(ctx.db.admin, projectId);
		if (tasks.length !== 4) {
			throw new Error(`[seed] expected 4 seeded tasks, got ${tasks.length}`);
		}
		return { projectId, entityIds: {}, notes: { fingerprint: rowFingerprint(tasks) } };
	},
	turns: [
		// Turn 1 — passing mention, read-only request. Zero writes.
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'heading into a call in a sec — the pricing migration has been eating my whole week. ' +
				"anyway what's actually on my plate for this project right now",
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(
					turn,
					'the user mentioned a task in passing and asked only for a read'
				);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const after = rowFingerprint(await listTasks(ctx.db.admin, seed.projectId!));
				assertRowsUnchanged(String(seed.notes.fingerprint), after, 'the project task list');
				seed.notes.fingerprint = after;
			}
		},
		// Turn 2 — genuinely ambiguous referent. Ask, and hold off writing.
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message: "cool. oh and the email one's done",
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertAnyToolCalled(turn, ['request_turn_clarification']);

				// Order matters: assert restraint BEFORE the question. An agent that
				// guessed and then asked about its guess must fail on the write, and
				// the failure message should say so rather than say "no question".
				assertNoMutations(
					turn,
					'three tasks match "the email one", so the referent is unresolvable'
				);
				const after = rowFingerprint(await listTasks(ctx.db.admin, seed.projectId!));
				assertRowsUnchanged(String(seed.notes.fingerprint), after, 'the project task list');

				assertQuestionAsked(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				if (!turn.sessionId) {
					throw new Error('[assert] clarification turn lost its session id');
				}
				const { data: session, error: sessionError } = await ctx.db.admin
					.from('chat_sessions')
					.select('agent_metadata')
					.eq('id', turn.sessionId)
					.eq('user_id', ctx.db.userId)
					.single();
				if (sessionError || !session) {
					throw new Error(
						`[assert] failed to read clarified session metadata: ${sessionError?.message ?? 'missing row'}`
					);
				}
				const metadata = session.agent_metadata as Record<string, unknown> | null;
				if (metadata?.fastchat_pending_turn_contract != null) {
					throw new Error(
						'[assert] terminal clarification retained a contract declared before the reviewer rejected it'
					);
				}

				// A real disambiguation names the candidates. "Which one?" with no
				// options means it never looked — the user has to do the work.
				const said = turn.assistantText.toLowerCase();
				const named = EMAIL_TASKS.filter((task) => said.includes(task.token));
				if (named.length < 2) {
					throw new Error(
						`[assert] the agent asked a question but surfaced only ${named.length} of the ` +
							`3 matching tasks. It should list the candidates, not make the user restate. ` +
							`Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}
			}
		}
	]
};
