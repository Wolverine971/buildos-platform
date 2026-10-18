// apps/web/src/lib/tests/agentic-e2e/scenarios/semantic-contract-cancellation.scenario.ts
// Live worker regression: a carried pending commission must not outlive the
// user's cancellation as a write.
//
// Turn 1 establishes a real worker-owned session, then the fixture injects the
// exact durable `fastchat_pending_turn_contract` metadata an unfinished
// commission leaves behind. Turn 2 is entirely real: worker preparation renders
// that commission as a `<pending_turn_contract>` system message, which tells the
// model to propose calls for still-commissioned outcomes and to respect any
// cancellation. The model must understand the cancellation semantically and
// propose nothing: no write executes and no batch even reaches independent
// review. Project documents must be byte-identical afterwards.
//
// The model clears it with `cancel_turn_contract`, which the worker mounts only
// on a turn carrying the pending note (tool-surface.ts productionToolsFor). The
// terminal trigger (apply_agentic_chat_terminal_pending_contract_v1) clears the
// session's commission on that successful execution, so the cleared metadata
// is asserted too.
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult, TurnResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNoMutations,
	assertRowsUnchanged,
	assertToolCalled,
	assertToolExecutionSucceeded,
	assertToolNotCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	rowFingerprint
} from '../harness/assertions';
import { getToolExecutions, listDocuments, waitForTurnRun } from '../harness/telemetry';

/**
 * Decisions only the independent batch reviewer can make on the worker
 * (turn-phase.ts reviewer surface). Any of them on the stream means the acting
 * model proposed a write batch that was held for review.
 */
const BATCH_REVIEW_DECISION_TOOL_NAMES = [
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME
] as const;

function assertNoBatchReviewed(turn: TurnResult): void {
	for (const name of BATCH_REVIEW_DECISION_TOOL_NAMES) assertToolNotCalled(turn, name);
}

const BRIEF_TITLE = 'Launch Brief';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Contract Cancellation'),
			type_key: 'project.business.product_launch',
			description: 'A small launch project used to verify cancelling a carried commission.'
		},
		entities: [
			{
				temp_id: 'launch-brief',
				kind: 'document',
				title: BRIEF_TITLE,
				body_markdown: '# Launch Brief\n\nKeep the launch focused on the beta cohort.'
			}
		],
		relationships: []
	};
}

export const semanticContractCancellationScenario: Scenario = {
	id: 'semantic-contract-cancellation',
	title: 'Respect cancellation of a carried pending commission without proposing writes',
	category: 'document',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const documents = await listDocuments(ctx.db.admin, projectId);
		const brief = documents.find((document) => document.title === BRIEF_TITLE);
		if (!brief) throw new Error(`[seed] failed to seed "${BRIEF_TITLE}"`);
		return {
			projectId,
			entityIds: { brief: brief.id },
			notes: { documentFingerprint: rowFingerprint(documents) }
		};
	},
	turns: [
		{
			label: 'establish worker session and pending contract fixture',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'What documents are in this project right now? This is only a status check, so do not change anything.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNoMutations(turn, 'the user explicitly requested a read-only status check');
				const briefId = seed.entityIds.brief;
				if (!briefId) {
					throw new Error('[assert] launch brief seed identity is missing');
				}
				const run = await waitForTurnRun(ctx.db.admin, turn.streamRunId!);
				assertTurnRunCompleted(run);
				if (!run?.id || !turn.sessionId) {
					throw new Error(
						'[assert] first worker turn did not expose durable turn/session identity'
					);
				}

				const { data: session, error: sessionError } = await ctx.db.admin
					.from('chat_sessions')
					.select('agent_metadata')
					.eq('id', turn.sessionId)
					.eq('user_id', ctx.db.userId)
					.single();
				if (sessionError || !session) {
					throw new Error(
						`[assert] failed to read the harness session: ${sessionError?.message ?? 'missing row'}`
					);
				}
				const metadata =
					session.agent_metadata &&
					typeof session.agent_metadata === 'object' &&
					!Array.isArray(session.agent_metadata)
						? session.agent_metadata
						: {};
				const pendingContract = {
					version: 1,
					contract: {
						version: 1,
						source: 'declared',
						outcomes: [
							{
								id: 'update-launch-brief',
								action: 'update',
								entityKind: 'document',
								targetIds: [briefId],
								requiredFields: ['content'],
								minimumSuccessfulEffects: 1,
								description:
									'Update the launch brief with a revised rollout section.'
							}
						]
					},
					contextType: 'project',
					projectId: seed.projectId,
					originatingTurnRunId: run.id,
					createdAt: new Date().toISOString(),
					finishedReason: 'tool_budget_exhausted'
				};
				const { error: updateError } = await ctx.db.admin
					.from('chat_sessions')
					.update({
						agent_metadata: {
							...metadata,
							fastchat_pending_turn_contract: pendingContract,
							fastchat_pending_turn_intent: null
						}
					})
					.eq('id', turn.sessionId)
					.eq('user_id', ctx.db.userId);
				if (updateError) {
					throw new Error(
						`[assert] failed to stage pending contract: ${updateError.message}`
					);
				}
			}
		},
		{
			label: 'explicitly cancel pending commission',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Actually, cancel that pending launch-brief update. Do not make that change or any other project changes; just acknowledge the cancellation.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, CANCEL_TURN_CONTRACT_TOOL_NAME);
				assertNoMutations(turn, 'the user explicitly cancelled the carried commission');
				// Stricter than "no write executed": the reviewer would likely stop a
				// cancelled update, but the acting model should never propose it.
				assertNoBatchReviewed(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				assertToolExecutionSucceeded(
					await getToolExecutions(ctx.db.admin, turn.streamRunId!),
					CANCEL_TURN_CONTRACT_TOOL_NAME
				);

				const documents = await listDocuments(ctx.db.admin, seed.projectId!);
				assertRowsUnchanged(
					String(seed.notes.documentFingerprint),
					rowFingerprint(documents),
					'project documents'
				);

				if (!turn.sessionId)
					throw new Error('[assert] cancellation turn lost its session id');
				const { data: session, error } = await ctx.db.admin
					.from('chat_sessions')
					.select('agent_metadata')
					.eq('id', turn.sessionId)
					.eq('user_id', ctx.db.userId)
					.single();
				if (error || !session) {
					throw new Error(
						`[assert] failed to read cancelled session metadata: ${error?.message ?? 'missing row'}`
					);
				}
				const metadata = session.agent_metadata as Record<string, unknown> | null;
				if (metadata?.fastchat_pending_turn_contract != null) {
					throw new Error(
						'[assert] terminal cancellation did not clear fastchat_pending_turn_contract'
					);
				}
			}
		}
	]
};
