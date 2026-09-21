// apps/worker/tests/publishedSpecialistExecution.postgres.test.ts
// Real admission, ownership, worker execution and durable recovery; scripted provider, no paid calls.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	createSpecialistWorkbenchDraftV1,
	buildDocumentReadSnapshotV2,
	hashExecutableSpecialistSnapshot
} from '@buildos/agentic-chat-runtime/specialists';
import {
	saveSpecialistWorkbenchDraft,
	publishSpecialistWorkbenchVersion,
	type SpecialistWorkbenchClient
} from '../../web/src/lib/services/agentic-chat-v2/specialist-workbench.server';
import {
	buildAgenticChatWorkflowV4AdmissionArgs,
	admitAgenticChatWorkflowV4Turn
} from '../../web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import {
	createPgSupabaseShim,
	serviceClient,
	startDisposableWorkflowPostgres,
	postgresAvailable,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import {
	seedE2EOwner,
	E2E_USER_ID,
	E2E_PROJECT_ID,
	buildE2EWorker,
	leaseAndClaimE2E,
	e2eProjectContext,
	e2eFacts
} from './helpers/workflowEndToEnd';
import {
	scriptedWorkflowProvider,
	type ScriptedCall,
	type ScriptedReply
} from './helpers/workflowProviderScript';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
const DOC = 'fd000000-0000-4000-8000-000000000001';
const VERSION = '2026-09-19T00:00:00Z';
const NOTE = 'CUSTOM REFERENCE: group decisions separately from working notes.';
function script(call: ScriptedCall): ScriptedReply {
	if (call.role === 'planner')
		return {
			kind: 'text',
			text: JSON.stringify({ analyst: 'Assess documents.', reviewer: 'Challenge evidence.' })
		};
	if (call.role === 'editor')
		return { kind: 'text', text: 'Keep a separate decisions document. No changes were made.' };
	if (call.role === 'project_analyst' && call.body.tool_choice === 'auto')
		return {
			kind: 'text',
			text: '',
			toolCalls: [
				{
					id: 'doc-read',
					name: 'read_project_documents',
					arguments: { documentIds: [DOC] }
				}
			]
		};
	return {
		kind: 'text',
		text: JSON.stringify({
			summary: 'Preserve useful distinctions.',
			findings: [{ claim: 'Inspect the saved brief.', basis: 'recorded', evidence: [DOC] }],
			risks: [],
			unknowns: [],
			recommendation: 'Separate decisions and working notes.'
		})
	};
}
(postgresAvailable ? describe : describe.skip)(
	'published specialist execution against PostgreSQL',
	() => {
		let pg: DisposablePostgres,
			admin: Client,
			service: Client,
			shim: ReturnType<typeof createPgSupabaseShim>,
			catalog: SpecialistWorkbenchClient;
		beforeAll(async () => {
			const root = resolve(process.cwd(), '../..');
			pg = await startDisposableWorkflowPostgres(root, 'buildos-published-specialist-pg-');
			admin = new Client(pg.connection);
			await admin.connect();
			await admin.query(
				'CREATE TABLE public.onto_documents (id uuid PRIMARY KEY, project_id uuid, title text, content text, updated_at timestamptz, deleted_at timestamptz); GRANT SELECT ON public.onto_documents TO service_role;'
			);
			for (const migration of [
				'20260920010743_agentic_chat_specialist_snapshots_v2.sql',
				'20260920032259_agentic_chat_document_read_tools_v1.sql',
				'20260920041644_agentic_chat_specialist_selection_shadow_v1.sql',
				'20260920154843_agentic_chat_document_evidence_handoff_v1.sql',
				'20260920162616_agentic_chat_specialist_workbench_v1.sql',
				'20260921002731_agentic_chat_published_specialist_execution_v1.sql'
			]) {
				try {
					await admin.query(
						readFileSync(resolve(root, 'supabase/migrations', migration), 'utf8')
					);
				} catch (e) {
					throw new Error(migration + ': ' + JSON.stringify(e));
				}
			}
			await seedE2EOwner(admin);
			await admin.query('INSERT INTO public.onto_documents VALUES ($1,$2,$3,$4,$5,NULL)', [
				DOC,
				E2E_PROJECT_ID,
				'Workshop brief',
				'Venue capacity is 40.',
				VERSION
			]);
			service = await serviceClient(pg.connection);
			shim = createPgSupabaseShim(service);
			catalog = shim as unknown as SpecialistWorkbenchClient;
		}, 120000);
		afterAll(async () => {
			await service?.end();
			await admin?.end();
			pg?.stop();
		});
		async function version(read = true) {
			const id = randomUUID(),
				draft = createSpecialistWorkbenchDraftV1();
			draft.instructions = 'Use domain expertise to compare working notes and decisions.';
			draft.knowledge[0]!.text = NOTE;
			draft.documentReadEnabled = read;
			if (!read) draft.examples = draft.examples.filter((e) => !e.requiresDocumentRead);
			await saveSpecialistWorkbenchDraft(catalog, E2E_USER_ID, id, 0, draft);
			return {
				...(await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, id, 1)),
				draft,
				id
			};
		}
		async function args(published: Awaited<ReturnType<typeof version>>, handoff = false) {
			return buildAgenticChatWorkflowV4AdmissionArgs({
				userId: E2E_USER_ID,
				command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
				eligibility: {
					eligible: true,
					projectId: E2E_PROJECT_ID,
					message: 'Review the saved documents and propose structure.',
					profile: 'document_organization',
					documentReadTools: true,
					documentEvidenceHandoff: handoff
				},
				published: {
					snapshot: published.snapshot,
					snapshotHash: published.version.snapshotHash
				},
				transportDecisionId: randomUUID()
			});
		}
		function context() {
			const c = e2eProjectContext(E2E_PROJECT_ID) as any;
			c.data.documents = [{ id: DOC, title: 'Workshop brief', updated_at: VERSION }];
			return c;
		}
		it.each([false, true])(
			'executes the exact frozen knowledge and bounded tool with shared evidence=%s',
			async (handoff) => {
				const v = await version(),
					a = await args(v, handoff);
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a }))
						.outcome
				).toBe('newly_admitted');
				v.draft.knowledge[0]!.text = 'LATER DRAFT KNOWLEDGE';
				await saveSpecialistWorkbenchDraft(catalog, E2E_USER_ID, v.id, 1, v.draft);
				const next = await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, v.id, 2);
				const retry = await args(v, handoff);
				Object.assign(retry, {
					p_client_turn_id: a.p_client_turn_id,
					p_stream_run_id: a.p_stream_run_id,
					p_request_hash: a.p_request_hash
				});
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: retry }))
						.outcome
				).toBe('matching_duplicate');
				const changed = await buildAgenticChatWorkflowV4AdmissionArgs({
					userId: E2E_USER_ID,
					command: {
						clientTurnId: a.p_client_turn_id,
						streamRunId: a.p_stream_run_id,
						sessionId: null
					},
					eligibility: {
						eligible: true,
						projectId: E2E_PROJECT_ID,
						message: a.p_message,
						profile: 'document_organization',
						documentReadTools: true,
						documentEvidenceHandoff: handoff
					},
					published: { snapshot: next.snapshot, snapshotHash: next.version.snapshotHash },
					transportDecisionId: randomUUID()
				});
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: changed }))
						.outcome
				).toBe('idempotency_conflict');
				const provider = scriptedWorkflowProvider(script),
					shadow = vi.fn();
				const worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					documentEvidenceHandoffEnabled: handoff,
					publishedSpecialistsEnabled: true,
					observeSelection: shadow,
					context: context()
				});
				try {
					expect(
						await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
					).toMatchObject({ terminalStatus: 'completed' });
				} finally {
					await worker.stop();
				}
				expect(shadow).not.toHaveBeenCalled();
				const organizer = provider.callsFor('project_analyst');
				expect(organizer).toHaveLength(2);
				for (const call of organizer) {
					expect(call.body.messages[0].content).toContain('Use domain expertise');
					expect(call.body.messages[1].content).toContain(NOTE);
					expect(call.body.messages[1].content).not.toContain('LATER DRAFT KNOWLEDGE');
				}
				for (const call of provider.calls.filter((c) => c.role !== 'project_analyst')) {
					expect(call.body.tool_choice).toBe('none');
					expect(call.body.messages[1].content).not.toContain(NOTE);
				}
				const resumed = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(
					a.p_turn_run_id
				);
				expect(resumed!.specialistSnapshot).toEqual(a.p_specialist_snapshot);
				expect(resumed!.documentReadResult?.documents).toEqual([
					expect.objectContaining({
						id: DOC,
						content: 'Venue capacity is 40.'
					})
				]);
				expect((await e2eFacts(admin, a.p_turn_run_id)).effects).toBe(0);
			},
			60000
		);
		it('enforces no-tool capability at both worker and SQL boundaries', async () => {
			const v = await version(false),
				a = await args(v);
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const lease = await leaseAndClaimE2E(admin, shim, a.p_turn_run_id);
			const denied = await service.query(
				'SELECT public.read_agentic_chat_documents_v1($1,$2,$3,$4,$5,$6::jsonb) AS result',
				[
					a.p_turn_run_id,
					lease.job,
					lease.token,
					lease.claim.executionGeneration,
					randomUUID(),
					JSON.stringify([DOC])
				]
			);
			expect(denied.rows[0].result.outcome).toBe('tool_not_allowed');
			const provider = scriptedWorkflowProvider(script),
				worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					publishedSpecialistsEnabled: true,
					context: context()
				});
			try {
				expect(await worker.execute(lease)).toMatchObject({ terminalStatus: 'completed' });
			} finally {
				await worker.stop();
			}
			expect(provider.calls.every((c) => c.body.tool_choice === 'none')).toBe(true);
			expect(provider.callsFor('project_analyst')[0]!.body.messages[1].content).toContain(
				NOTE
			);
		});
		it('fails before provider dispatch with the new worker flag disabled', async () => {
			const a = await args(await version());
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const provider = scriptedWorkflowProvider(script),
				worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
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
		});
		it('rejects foreign or substituted catalog contents and built-in/custom retry changes', async () => {
			const a = await args(await version());
			const foreign = structuredClone(a);
			foreign.p_user_id = randomUUID();
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: foreign }))
					.outcome
			).toBe('access_denied');
			const tampered = structuredClone(a);
			tampered.p_specialist_snapshot!.slots.project_analyst.definition = {
				...tampered.p_specialist_snapshot!.slots.project_analyst.definition,
				label: 'Forged'
			};
			tampered.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				tampered.p_specialist_snapshot
			);
			await expect(
				admitAgenticChatWorkflowV4Turn({ client: shim as never, args: tampered })
			).rejects.toThrow('binding_invalid');
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const builtin = {
				...a,
				p_specialist_snapshot: buildDocumentReadSnapshotV2(),
				p_turn_run_id: randomUUID(),
				p_user_message_id: randomUUID(),
				p_request_artifact_id: randomUUID()
			};
			builtin.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				builtin.p_specialist_snapshot
			);
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: builtin }))
					.outcome
			).toBe('idempotency_conflict');
			// Clean this queued test request without inference.
			await admin.query(
				"UPDATE public.queue_jobs SET status='failed' WHERE id=(SELECT queue_job_id FROM public.chat_turn_runs WHERE id=$1)",
				[a.p_turn_run_id]
			);
		});
		it('still admits built-in reviews and rejects retrying them with a custom version', async () => {
			const a = await args(await version());
			const builtin = { ...a, p_specialist_snapshot: buildDocumentReadSnapshotV2() };
			builtin.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				builtin.p_specialist_snapshot
			);
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: builtin }))
					.outcome
			).toBe('newly_admitted');
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a })).outcome
			).toBe('idempotency_conflict');
			const provider = scriptedWorkflowProvider(script);
			const worker = buildE2EWorker({
				shim,
				client: provider.client,
				specialistWorkflowsEnabled: true,
				documentReadToolsEnabled: true,
				context: context()
			});
			try {
				expect(
					await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
				).toMatchObject({ terminalStatus: 'completed' });
			} finally {
				await worker.stop();
			}
		});
	}
);
