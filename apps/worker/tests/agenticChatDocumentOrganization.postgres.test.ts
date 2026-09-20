// apps/worker/tests/agenticChatDocumentOrganization.postgres.test.ts
// Disposable local PostgreSQL + scripted provider only. No paid or hosted calls.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildDocumentOrganizationSnapshotV2,
	DOCUMENT_ORGANIZATION_POLICY_REF,
	hashSpecialistSnapshotV2
} from '@buildos/agentic-chat-runtime/specialists';
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatWorkflowRequestV1
} from '@buildos/shared-types';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
import {
	buildE2EWorker,
	e2eId,
	E2E_USER_ID,
	E2E_PROJECT_ID,
	e2eProjectContext,
	seedE2EOwner,
	leaseAndClaimE2E,
	e2eFacts,
	e2eDomainRowCounts
} from './helpers/workflowEndToEnd';
import {
	createPgSupabaseShim,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import {
	scriptedWorkflowProvider,
	type ScriptedCall,
	type ScriptedReply
} from './helpers/workflowProviderScript';

const MIGRATION = 'supabase/migrations/20260920010743_agentic_chat_specialist_snapshots_v2.sql';
function documentScript(call: ScriptedCall): ScriptedReply {
	if (call.role === 'planner')
		return {
			kind: 'text',
			text: JSON.stringify({
				analyst: 'Organize documents using supplied evidence.',
				reviewer: 'Check evidence gaps and alternatives.'
			})
		};
	if (call.role === 'editor')
		return {
			kind: 'text',
			text: 'Proposed structure: Workshop planning → Venue brief (doc-1). Inspect Catering notes (doc-2) for overlap; titles alone cannot establish duplication. No changes applied.'
		};
	return {
		kind: 'text',
		completionTokens: 1_500,
		text: JSON.stringify({
			summary: 'Group venue and catering evidence under workshop planning.',
			findings: [
				{
					claim: 'Venue brief covers venue planning.',
					basis: 'recorded',
					evidence: ['doc-1']
				}
			],
			risks: [{ risk: 'Only titles and summaries are available.', evidence: ['doc-2'] }],
			unknowns: ['Whether full document contents overlap'],
			recommendation: 'Propose Workshop planning; inspect contents before merging.'
		})
	};
}
function context() {
	const c = e2eProjectContext(E2E_PROJECT_ID) as any;
	c.data.documents = [
		{
			id: 'doc-1',
			title: 'Venue brief',
			description: 'Venue options.',
			updated_at: '2026-09-19T00:00:00Z'
		},
		{
			id: 'doc-2',
			title: 'Catering notes',
			description: 'Catering options.',
			updated_at: '2026-09-19T00:00:00Z'
		}
	];
	c.data.doc_structure = { root: [{ id: 'doc-1', title: 'Venue brief' }] };
	return c;
}

(postgresAvailable ? describe : describe.skip)('document organization durable profile', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	beforeAll(async () => {
		const root = resolve(process.cwd(), '../..');
		pg = await startDisposableWorkflowPostgres(root, 'buildos-document-profile-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		await admin.query(readFileSync(resolve(root, MIGRATION), 'utf8'));
		// The latest migration must preserve the existing tool-free profile and recovery.
		await admin.query(
			readFileSync(
				resolve(
					root,
					'supabase/migrations/20260920032259_agentic_chat_document_read_tools_v1.sql'
				),
				'utf8'
			)
		);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
		await seedE2EOwner(admin);
	}, 120_000);
	afterAll(async () => {
		await service?.end();
		await admin?.end();
		pg?.stop();
	});
	async function args(n: number) {
		const message = `Propose an organization for my project documents (${n}).`;
		const request = {
			clientTurnId: `docs-client-${n}`,
			streamRunId: `docs-stream-${n}`,
			context: {
				type: 'project' as const,
				entityId: E2E_PROJECT_ID,
				projectId: E2E_PROJECT_ID
			},
			message,
			reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
			policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			policyRef: DOCUMENT_ORGANIZATION_POLICY_REF
		};
		const snapshot = buildDocumentOrganizationSnapshotV2();
		return {
			p_user_id: E2E_USER_ID,
			p_session_id: null,
			p_turn_run_id: e2eId('f5', n),
			p_user_message_id: e2eId('f6', n),
			p_request_artifact_id: e2eId('f7', n),
			p_stream_run_id: request.streamRunId,
			p_client_turn_id: request.clientTurnId,
			p_transport_decision_id: e2eId('f8', n),
			p_correlation_id: e2eId('f9', n),
			p_project_id: E2E_PROJECT_ID,
			p_message: message,
			p_review_intent: request.reviewIntent,
			p_policy: request.policy,
			p_policy_ref: request.policyRef,
			p_request_hash: await hashAgenticChatWorkflowRequestV1(request),
			p_cache_ref: null,
			p_specialist_snapshot: snapshot,
			p_specialist_snapshot_hash: await hashSpecialistSnapshotV2(snapshot)
		};
	}
	async function admit(n: number) {
		const a = await args(n);
		const result = await shim.rpc('create_agentic_chat_document_review_turn_v2', a);
		expect(result.error).toBeNull();
		expect(result.data).toMatchObject({ outcome: 'newly_admitted' });
		return a;
	}
	it('atomically admits a private immutable selection, preserves duplicates, runs with document evidence and labels', async () => {
		const before = await e2eDomainRowCounts(admin);
		const a = await admit(1);
		const changed = structuredClone(a);
		changed.p_specialist_snapshot.editorTask =
			'Newer instructions must not replace the admitted snapshot.';
		changed.p_specialist_snapshot_hash = await hashSpecialistSnapshotV2(
			changed.p_specialist_snapshot
		);
		expect(
			(await shim.rpc('create_agentic_chat_document_review_turn_v2', changed)).data
		).toMatchObject({ outcome: 'matching_duplicate' });
		const saved = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(
			a.p_turn_run_id
		);
		expect(saved?.specialistSnapshot).toEqual(a.p_specialist_snapshot);
		await expect(
			admin.query(
				'UPDATE public.chat_turn_specialist_snapshots SET snapshot = snapshot WHERE turn_run_id = $1',
				[a.p_turn_run_id]
			)
		).rejects.toThrow('immutable');
		await admin.query('SET ROLE authenticated');
		try {
			await expect(
				admin.query('SELECT * FROM public.chat_turn_specialist_snapshots')
			).rejects.toThrow('permission denied');
		} finally {
			await admin.query('RESET ROLE');
		}
		const provider = scriptedWorkflowProvider(documentScript);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			context: context()
		});
		try {
			expect(
				await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
			).toMatchObject({ outcome: 'completed', terminalStatus: 'completed' });
		} finally {
			await worker.stop();
		}
		expect(provider.calls).toHaveLength(4);
		const organizer = provider.callsFor('project_analyst')[0]!;
		expect(organizer.body.messages[0].content).toContain('ROLE: Document organizer');
		expect(organizer.body.messages[1].content).toContain('doc_structure');
		expect(organizer.body.messages[1].content).toContain('Venue brief');
		expect(provider.callsFor('editor')[0]!.body.messages[0].content).toContain(
			a.p_specialist_snapshot.editorTask
		);
		const facts = await e2eFacts(admin, a.p_turn_run_id);
		expect(facts.run).toMatchObject({ terminal_outcome: 'complete' });
		expect(facts.messages).toHaveLength(1);
		expect(facts.effects).toBe(0);
		expect(await e2eDomainRowCounts(admin)).toEqual(before);
		const progress = await admin.query(
			"SELECT payload FROM public.chat_turn_events WHERE turn_run_id = $1 AND event_type = 'workflow_progress'",
			[a.p_turn_run_id]
		);
		expect(progress.rows.length).toBeGreaterThan(0);
		for (const row of progress.rows) {
			expect(
				row.payload.workflow.steps.find((s: any) => s.key === 'project_analyst').label
			).toBe('Document organizer');
			expect(JSON.stringify(row.payload)).not.toContain('specialist_definition_v1');
		}
	}, 60_000);
	it('rejects invalid admission without leaving a turn, queue item, or snapshot', async () => {
		const a = await args(2);
		a.p_specialist_snapshot_hash = '0'.repeat(64);
		expect(
			(await shim.rpc('create_agentic_chat_document_review_turn_v2', a)).error?.message
		).toContain('snapshot_invalid');
		expect(
			(
				await admin.query('SELECT id FROM public.chat_turn_runs WHERE id = $1', [
					a.p_turn_run_id
				])
			).rowCount
		).toBe(0);
	});
	it('uses document assignments when the planner fails', async () => {
		const a = await admit(6);
		const provider = scriptedWorkflowProvider((call) =>
			call.role === 'planner'
				? { kind: 'text', text: 'not valid JSON' }
				: documentScript(call)
		);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			context: context()
		});
		try {
			expect(
				await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
			).toMatchObject({ terminalStatus: 'completed' });
		} finally {
			await worker.stop();
		}
		const state = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(
			a.p_turn_run_id
		);
		expect(state?.steps.project_analyst?.assignment.objective).toBe(
			a.p_specialist_snapshot.slots.project_analyst.assignment
		);
		expect(provider.callsFor('project_analyst')[0]!.body.messages[0].content).toContain(
			a.p_specialist_snapshot.slots.project_analyst.assignment
		);
	});
	it.each(['disabled', 'missing'])(
		'fails closed before provider work when the profile is %s',
		async (mode) => {
			const a = await admit(mode === 'disabled' ? 3 : 4);
			if (mode === 'missing')
				await admin.query(
					'DELETE FROM public.chat_turn_specialist_snapshots WHERE turn_run_id = $1',
					[a.p_turn_run_id]
				);
			const provider = scriptedWorkflowProvider(documentScript);
			const worker = buildE2EWorker({
				shim,
				client: provider.client,
				specialistWorkflowsEnabled: mode !== 'disabled',
				context: context()
			});
			try {
				expect(
					await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
				).toMatchObject({ terminalStatus: 'failed' });
			} finally {
				await worker.stop();
			}
			expect(provider.calls).toHaveLength(0);
		}
	);
	it('resumes accepted specialist work with the original saved instructions in a new worker', async () => {
		const a = await args(5);
		a.p_specialist_snapshot.slots.risk_reviewer.definition = {
			...a.p_specialist_snapshot.slots.risk_reviewer.definition,
			instructions: {
				...a.p_specialist_snapshot.slots.risk_reviewer.definition.instructions,
				system: 'Saved reviewer instructions from admission. Read-only, no tools. Cite supplied IDs.'
			}
		};
		a.p_specialist_snapshot_hash = await hashSpecialistSnapshotV2(a.p_specialist_snapshot);
		expect((await shim.rpc('create_agentic_chat_document_review_turn_v2', a)).error).toBeNull();
		const abort = new AbortController();
		const provider = scriptedWorkflowProvider((call) =>
			call.role === 'risk_reviewer' ? { kind: 'no_response' } : documentScript(call)
		);
		const first = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			context: context()
		});
		const lease = await leaseAndClaimE2E(admin, shim, a.p_turn_run_id);
		shim.intercept(async (name, input, run) => {
			const result = await run();
			if (
				name === 'accept_agentic_chat_workflow_step_result_v1' &&
				input.p_step_key === 'project_analyst'
			)
				abort.abort(new Error('test worker interrupted'));
			return result;
		});
		try {
			await first.execute(lease, abort.signal);
		} finally {
			shim.intercept(null);
			await first.stop();
		}
		const store = new SupabaseAgenticChatWorkflowStore(shim as never);
		const persisted = await store.loadRun(a.p_turn_run_id);
		expect(persisted?.steps.project_analyst?.status).toBe('accepted');
		await store.recoverTurn(
			{
				turnRunId: a.p_turn_run_id,
				queueJobId: lease.job,
				processingToken: lease.token,
				executionGeneration: lease.claim.executionGeneration
			},
			{ failureClass: 'timeout_post_start', errorMessage: 'Test restart' }
		);
		const secondProvider = scriptedWorkflowProvider(documentScript);
		const second = buildE2EWorker({
			shim,
			client: secondProvider.client,
			specialistWorkflowsEnabled: true,
			context: context()
		});
		try {
			expect(
				await second.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
			).toMatchObject({ terminalStatus: 'completed' });
		} finally {
			await second.stop();
		}
		expect(secondProvider.callsFor('project_analyst')).toHaveLength(0);
		expect(secondProvider.callsFor('planner')).toHaveLength(0);
		expect(secondProvider.callsFor('risk_reviewer')[0]!.body.messages[0].content).toContain(
			'Saved reviewer instructions from admission'
		);
		expect((await e2eFacts(admin, a.p_turn_run_id)).messages).toHaveLength(1);
	}, 60_000);
});
