// apps/worker/tests/agenticChatDocumentReadTools.postgres.test.ts
// Full web admission -> durable tool pass -> saved read -> synthesis, all local and scripted.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildAgenticChatWorkflowV4AdmissionArgs,
	evaluateAgenticChatWorkflowV4Admission,
	admitAgenticChatWorkflowV4Turn
} from '../../web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import {
	buildE2EWorker,
	e2eProjectContext,
	seedE2EOwner,
	E2E_USER_ID,
	E2E_PROJECT_ID,
	leaseAndClaimE2E,
	e2eFacts,
	e2eDomainRowCounts
} from './helpers/workflowEndToEnd';
import {
	createPgSupabaseShim,
	serviceClient,
	startDisposableWorkflowPostgres,
	postgresAvailable,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import {
	scriptedWorkflowProvider,
	type ScriptedCall,
	type ScriptedReply
} from './helpers/workflowProviderScript';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
const DOC1 = 'fd000000-0000-4000-8000-000000000001';
const DOC2 = 'fd000000-0000-4000-8000-000000000002';
const FOREIGN = 'fd000000-0000-4000-8000-000000000003';
const VERSION = '2026-09-19T00:00:00Z';
function context() {
	const c = e2eProjectContext(E2E_PROJECT_ID) as any;
	c.data.documents = [DOC1, DOC2].map((id) => ({
		id,
		title: id === DOC1 ? 'Venue brief' : 'Catering notes',
		updated_at: VERSION
	}));
	return c;
}
function script(call: ScriptedCall): ScriptedReply {
	if (call.role === 'planner')
		return {
			kind: 'text',
			text: JSON.stringify({
				analyst: 'Read relevant documents and propose structure.',
				reviewer: 'Check evidence and alternatives.'
			})
		};
	if (call.role === 'editor')
		return {
			kind: 'text',
			text: 'Group the venue and catering documents under Workshop planning. The venue has capacity for 40; inspect the unread material before merging.'
		};
	if (call.role === 'project_analyst' && call.body.tool_choice === 'auto')
		return {
			kind: 'text',
			text: '',
			completionTokens: 100,
			toolCalls: [
				{
					id: 'read-1',
					name: 'read_project_documents',
					arguments: { documentIds: [DOC1, DOC2] }
				}
			]
		};
	return {
		kind: 'text',
		completionTokens: 1200,
		text: JSON.stringify({
			summary: 'Keep venue and catering as separate planning documents.',
			findings: [
				{ claim: 'The venue fits the workshop.', basis: 'recorded', evidence: [DOC1] }
			],
			risks: [],
			unknowns: ['Final caterer availability'],
			recommendation: 'Propose Workshop planning and preserve separate briefs.'
		})
	};
}

(postgresAvailable ? describe : describe.skip)('bounded specialist document tools', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	beforeAll(async () => {
		const root = resolve(process.cwd(), '../..');
		pg = await startDisposableWorkflowPostgres(root, 'buildos-document-tools-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		await admin.query(
			`CREATE TABLE public.onto_documents (id uuid PRIMARY KEY, project_id uuid, title text, content text, updated_at timestamptz, deleted_at timestamptz); GRANT SELECT ON public.onto_documents TO service_role;`
		);
		for (const name of [
			'20260920010743_agentic_chat_specialist_snapshots_v2.sql',
			'20260920032259_agentic_chat_document_read_tools_v1.sql'
		])
			await admin.query(readFileSync(resolve(root, 'supabase/migrations', name), 'utf8'));
		await seedE2EOwner(admin);
		await admin.query(
			'INSERT INTO public.onto_documents(id, project_id, title, content, updated_at) VALUES ($1,$2,$3,$4,$5), ($6,$2,$7,$8,$5), ($9,$10,$11,$12,$5)',
			[
				DOC1,
				E2E_PROJECT_ID,
				'Venue brief',
				'Venue capacity is 40. Keep the catering brief separate.',
				VERSION,
				DOC2,
				'Catering notes',
				'x'.repeat(8000),
				FOREIGN,
				'f3000000-0000-4000-8000-000000000099',
				'Secret',
				'FOREIGN PRIVATE CONTENT'
			]
		);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
	}, 120_000);
	afterAll(async () => {
		await service?.end();
		await admin?.end();
		pg?.stop();
	});
	async function admit(n: number) {
		const command = {
			clientTurnId: `tool-client-${n}`,
			streamRunId: `tool-stream-${n}`,
			sessionId: null,
			context: { type: 'project', entityId: E2E_PROJECT_ID, projectId: E2E_PROJECT_ID },
			message: 'Read the documents and suggest organization.',
			attachments: [],
			projectFocus: null,
			voiceNoteGroupId: null,
			reviewIntent: 'document_organization' as const
		};
		const eligibility = evaluateAgenticChatWorkflowV4Admission({
			policy: {
				enabled: true,
				specialistWorkflowsEnabled: true,
				documentReadToolsEnabled: true,
				cohortUserIds: [E2E_USER_ID]
			},
			userId: E2E_USER_ID,
			command
		});
		if (!eligibility.eligible) throw new Error(eligibility.reason);
		const args = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: E2E_USER_ID,
			command,
			eligibility,
			transportDecisionId: randomUUID()
		});
		expect(args.p_policy.modelTools).toBe('bounded_document_read_v1');
		const result = await admitAgenticChatWorkflowV4Turn({ client: shim as never, args });
		expect(result.outcome).toBe('newly_admitted');
		return args.p_turn_run_id;
	}
	it('reads only through the organizer, persists bounded text, and meters the continuation', async () => {
		const before = await e2eDomainRowCounts(admin);
		const id = await admit(1);
		const provider = scriptedWorkflowProvider(script);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await worker.stop();
		}
		const state = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(id);
		expect(state?.documentReadResult?.documents).toEqual([
			expect.objectContaining({
				id: DOC1,
				status: 'read',
				truncated: false,
				content: 'Venue capacity is 40. Keep the catering brief separate.'
			}),
			expect.objectContaining({
				id: DOC2,
				status: 'read',
				truncated: true,
				fullCharacters: 8000,
				content: 'x'.repeat(6000)
			})
		]);
		expect(provider.callsFor('project_analyst')).toHaveLength(2);
		expect(provider.callsFor('project_analyst')[1]!.body.messages.at(-1)).toMatchObject({
			role: 'tool',
			tool_call_id: 'read-1'
		});
		expect(provider.callsFor('editor')[0]!.body.messages[1].content).toContain(
			'Venue capacity is 40'
		);
		for (const call of provider.calls.filter((c) => c.role !== 'project_analyst'))
			expect(call.body.tool_choice).toBe('none');
		const facts = await e2eFacts(admin, id);
		expect(facts.dispatches).toHaveLength(5);
		expect(
			facts.dispatches
				.filter((d) => d.step_key === 'project_analyst')
				.map((d) => d.dispatch_kind)
		).toEqual(['specialist', 'specialist']);
		const usage = provider.usage as Array<{ usageLogId: string; logicalProviderRound: number }>;
		expect(new Set(usage.map((u) => u.usageLogId)).size).toBe(5);
		expect(usage.map((u) => u.logicalProviderRound)).toContain(7);
		expect(
			facts.dispatches
				.filter((d) => d.step_key === 'project_analyst')
				.map((d) => Number(d.physical_attempt))
		).toEqual([1, 2]);
		expect(facts.effects).toBe(0);
		expect(await e2eDomainRowCounts(admin)).toEqual(before);
		await expect(
			admin.query(
				'UPDATE public.chat_turn_document_read_batches SET result = result WHERE turn_run_id = $1',
				[id]
			)
		).rejects.toThrow('immutable');
		await admin.query('SET ROLE authenticated');
		try {
			await expect(
				admin.query('SELECT * FROM public.chat_turn_document_read_batches')
			).rejects.toThrow('permission denied');
		} finally {
			await admin.query('RESET ROLE');
		}
	}, 60_000);
	it('refuses changed documents and never looks up a foreign document', async () => {
		const id = await admit(2);
		await admin.query(
			"UPDATE public.onto_documents SET updated_at = '2026-09-20T00:00:00Z', content = 'CHANGED CONTENT' WHERE id = $1",
			[DOC1]
		);
		const provider = scriptedWorkflowProvider((call) =>
			call.role === 'project_analyst' && call.body.tool_choice === 'auto'
				? {
						kind: 'text',
						text: '',
						toolCalls: [
							{
								id: 'read-2',
								name: 'read_project_documents',
								arguments: { documentIds: [DOC1, FOREIGN] }
							}
						]
					}
				: script(call)
		);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			await worker.stop();
		}
		const row = (
			await admin.query(
				'SELECT result FROM public.chat_turn_document_read_batches WHERE turn_run_id=$1',
				[id]
			)
		).rows[0];
		expect(row.result.documents).toEqual([
			{ id: DOC1, status: 'changed_since_context' },
			{ id: FOREIGN, status: 'not_in_inventory' }
		]);
		expect(JSON.stringify(provider.calls)).not.toContain('FOREIGN PRIVATE CONTENT');
		expect(JSON.stringify(provider.calls)).not.toContain('CHANGED CONTENT');
		await admin.query(
			'UPDATE public.onto_documents SET updated_at=$2, content=$3 WHERE id=$1',
			[DOC1, VERSION, 'Venue capacity is 40. Keep the catering brief separate.']
		);
	});
	it('recovers from a lost read receipt with the same saved content and no repeated read', async () => {
		const id = await admit(3);
		const lease = await leaseAndClaimE2E(admin, shim, id);
		const firstProvider = scriptedWorkflowProvider(script);
		const first = buildE2EWorker({
			shim,
			client: firstProvider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		let lost = false;
		shim.intercept(async (name, _args, run) => {
			const receipt = await run();
			if (name === 'read_agentic_chat_documents_v1' && !lost) {
				lost = true;
				return {
					data: null,
					error: { code: '08006', message: 'Lost response after commit' }
				};
			}
			return receipt;
		});
		try {
			await first.execute(lease);
		} finally {
			shim.intercept(null);
			await first.stop();
		}
		expect(lost).toBe(true);
		const store = new SupabaseAgenticChatWorkflowStore(shim as never);
		expect((await store.loadRun(id))?.documentReadResult).toBeDefined();
		await store.recoverTurn(
			{
				turnRunId: id,
				queueJobId: lease.job,
				processingToken: lease.token,
				executionGeneration: lease.claim.executionGeneration
			},
			{ failureClass: 'timeout_post_start', errorMessage: 'Test restart' }
		);
		await admin.query(
			"UPDATE public.onto_documents SET content='NEW TEXT AFTER READ',updated_at=now() WHERE id=$1",
			[DOC1]
		);
		const before = shim.rpcCalls.filter((n) => n === 'read_agentic_chat_documents_v1').length;
		const secondProvider = scriptedWorkflowProvider(script);
		const second = buildE2EWorker({
			shim,
			client: secondProvider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			expect(await second.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await second.stop();
		}
		expect(shim.rpcCalls.filter((n) => n === 'read_agentic_chat_documents_v1')).toHaveLength(
			before
		);
		const organizer = secondProvider.callsFor('project_analyst')[0]!;
		expect(organizer.body.tool_choice).toBe('none');
		expect(organizer.body.messages[1].content).toContain('Venue capacity is 40');
		expect(JSON.stringify(secondProvider.calls)).not.toContain('NEW TEXT AFTER READ');
		expect((await e2eFacts(admin, id)).messages).toHaveLength(1);
	}, 60_000);

	it.each(['duplicate_ids', 'extra_arguments', 'multiple_calls'])(
		'does not execute %s from a model',
		async (kind) => {
			const id = await admit(
				10 + ['duplicate_ids', 'extra_arguments', 'multiple_calls'].indexOf(kind)
			);
			const calls = shim.rpcCalls.filter(
				(n) => n === 'read_agentic_chat_documents_v1'
			).length;
			const provider = scriptedWorkflowProvider((call) => {
				if (call.role !== 'project_analyst' || call.body.tool_choice !== 'auto')
					return script(call);
				const tool = {
					id: 'bad',
					name: 'read_project_documents',
					arguments:
						kind === 'extra_arguments'
							? { documentIds: [DOC1], projectId: E2E_PROJECT_ID }
							: { documentIds: kind === 'duplicate_ids' ? [DOC1, DOC1] : [DOC1] }
				};
				return {
					kind: 'text',
					text: '',
					toolCalls: kind === 'multiple_calls' ? [tool, { ...tool, id: 'bad-2' }] : [tool]
				};
			});
			const worker = buildE2EWorker({
				shim,
				client: provider.client,
				specialistWorkflowsEnabled: true,
				documentReadToolsEnabled: true,
				context: context()
			});
			try {
				await worker.execute(await leaseAndClaimE2E(admin, shim, id));
			} finally {
				await worker.stop();
			}
			expect(
				shim.rpcCalls.filter((n) => n === 'read_agentic_chat_documents_v1')
			).toHaveLength(calls);
			expect(
				(await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(id))
					?.documentReadResult
			).toBeUndefined();
		}
	);
	it('enforces database fences, current access, argument bounds and a single replayable batch', async () => {
		const id = await admit(20);
		const direct = createPgSupabaseShim(service);
		let checked = false;
		shim.intercept(async (name, args, run) => {
			if (name !== 'read_agentic_chat_documents_v1') return run();
			const probe = async (patch: Record<string, unknown>, outcome: string) => {
				const r = await direct.rpc(name, { ...args, ...patch });
				expect(r.error).toBeNull();
				expect(r.data).toMatchObject({ outcome });
			};
			await probe(
				{ p_execution_generation: Number(args.p_execution_generation) + 1 },
				'stale_generation'
			);
			await probe({ p_step_attempt_id: randomUUID() }, 'stale_claim');
			await probe({ p_document_ids: [DOC1, DOC1] }, 'invalid_arguments');
			await probe(
				{ p_document_ids: Array.from({ length: 5 }, () => randomUUID()) },
				'invalid_arguments'
			);
			await admin.query('UPDATE public.onto_projects SET deleted_at = now() WHERE id=$1', [
				E2E_PROJECT_ID
			]);
			try {
				await probe({}, 'access_denied');
			} finally {
				await admin.query('UPDATE public.onto_projects SET deleted_at = NULL WHERE id=$1', [
					E2E_PROJECT_ID
				]);
			}
			const receipt = await run();
			expect(receipt.data).toMatchObject({ outcome: 'read' });
			await probe({}, 'replayed');
			await probe({ p_document_ids: [DOC2] }, 'read_limit_reached');
			checked = true;
			return receipt;
		});
		const provider = scriptedWorkflowProvider(script);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			shim.intercept(null);
			await worker.stop();
		}
		expect(checked).toBe(true);
	});
	it('bounds Unicode and escaped content without losing the truncation disclosure', async () => {
		const id = await admit(21);
		await admin.query(
			'UPDATE public.onto_documents SET content=$1, updated_at=$2 WHERE id=$3',
			['🚀'.repeat(6000), VERSION, DOC1]
		);
		await admin.query('UPDATE public.onto_documents SET content=$1 WHERE id=$2', [
			'\u0001'.repeat(6000),
			DOC2
		]);
		const provider = scriptedWorkflowProvider(script);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await worker.stop();
		}
		const state = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(id);
		for (const doc of state?.documentReadResult?.documents as Array<Record<string, any>>) {
			expect(doc).toMatchObject({ status: 'read', truncated: true, fullCharacters: 6000 });
			expect(Buffer.byteLength(JSON.stringify(doc.content), 'utf8')).toBeLessThanOrEqual(
				12000
			);
		}
		expect(provider.callsFor('project_analyst')).toHaveLength(2);
	});

	it('honors cancellation before releasing any document content', async () => {
		const id = await admit(22);
		const direct = createPgSupabaseShim(service);
		let refused = false;
		shim.intercept(async (name, _args, run) => {
			if (name !== 'read_agentic_chat_documents_v1') return run();
			expect(
				(
					await direct.rpc('request_agentic_chat_turn_cancel', {
						p_turn_run_id: id,
						p_user_id: E2E_USER_ID,
						p_reason: 'user_cancelled',
						p_source: 'browser'
					})
				).error
			).toBeNull();
			const receipt = await run();
			expect(receipt.data).toEqual({ outcome: 'cancel_requested' });
			refused = true;
			return receipt;
		});
		const provider = scriptedWorkflowProvider(script);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			shim.intercept(null);
			await worker.stop();
		}
		expect(refused).toBe(true);
		expect(
			(await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(id))
				?.documentReadResult
		).toBeUndefined();
		expect(provider.callsFor('project_analyst')).toHaveLength(1);
	});
	it('can return an inventory-only report without making a tool call', async () => {
		const id = await admit(23);
		const provider = scriptedWorkflowProvider((call) =>
			script(
				call.role === 'project_analyst'
					? { ...call, body: { ...call.body, tool_choice: 'none' } }
					: call
			)
		);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true,
			context: context()
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await worker.stop();
		}
		expect(provider.calls).toHaveLength(4);
		expect(
			(await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(id))
				?.documentReadResult
		).toBeUndefined();
	});
	it('makes no model request when the read-tools worker gate is off', async () => {
		const id = await admit(4);
		const provider = scriptedWorkflowProvider(script);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			specialistWorkflowsEnabled: true,
			context: context()
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'failed'
			});
		} finally {
			await worker.stop();
		}
		expect(provider.calls).toHaveLength(0);
	});
});
