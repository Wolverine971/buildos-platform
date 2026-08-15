// apps/web/src/lib/tests/agentic-e2e/scenarios/semantic-contract-cancellation.scenario.ts
// Live worker regression for semantic turn-contract cancellation.
//
// Turn 1 establishes a real worker-owned session, then the fixture injects the
// exact durable metadata that an incomplete declared contract would leave
// behind. Turn 2 is entirely real: worker preparation must surface that pending
// commission, the model must understand the user's cancellation semantically,
// call the internal cancellation control, avoid user-data writes, and let the
// terminal database trigger clear the contract.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNoMutations,
	assertRowsUnchanged,
	assertToolCalled,
	assertToolExecutionSucceeded,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	rowFingerprint
} from '../harness/assertions';
import { getToolExecutions, listDocuments, waitForTurnRun } from '../harness/telemetry';

const BRIEF_TITLE = 'Launch Brief';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Contract Cancellation'),
			type_key: 'project.business.product_launch',
			description: 'A small launch project used to verify semantic contract cancellation.'
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
	title: 'Cancel a carried semantic contract without mutating project data',
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
				assertToolCalled(turn, 'cancel_turn_contract');
				assertNoMutations(turn, 'the user explicitly cancelled the carried commission');
				const run = await waitForTurnRun(ctx.db.admin, turn.streamRunId!);
				assertTurnRunCompleted(run);
				assertToolExecutionSucceeded(
					await getToolExecutions(ctx.db.admin, turn.streamRunId!),
					'cancel_turn_contract'
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
