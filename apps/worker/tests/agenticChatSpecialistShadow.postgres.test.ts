// apps/worker/tests/agenticChatSpecialistShadow.postgres.test.ts
// Real admission, durable claim/receipt, recovery and fixed execution. All providers are scripted.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { JevClient } from '@buildos/smart-llm';
import {
	buildE2EWorker,
	seedE2EOwner,
	admitE2ETurn,
	leaseAndClaimE2E,
	e2eFacts,
	e2eDomainRowCounts,
	E2E_PROJECT_ID,
	E2E_USER_ID
} from './helpers/workflowEndToEnd';
import {
	createPgSupabaseShim,
	serviceClient,
	postgresAvailable,
	startDisposableWorkflowPostgres,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import { scriptedWorkflowProvider, happyScript } from './helpers/workflowProviderScript';
import { JevSpecialistSelectionShadow } from '../src/workers/agentic-chat/workflow/specialist-selection-shadow';
import {
	selectionHash,
	SPECIALIST_SHADOW_POLICY
} from '../src/workers/agentic-chat/workflow/specialist-selection-policy';

(postgresAvailable ? describe : describe.skip)('durable Jev specialist shadow', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	beforeAll(async () => {
		const root = resolve(process.cwd(), '../..');
		pg = await startDisposableWorkflowPostgres(root, 'buildos-specialist-shadow-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		await admin.query(
			readFileSync(
				resolve(
					root,
					'supabase/migrations/20260920041644_agentic_chat_specialist_selection_shadow_v1.sql'
				),
				'utf8'
			)
		);
		await seedE2EOwner(admin);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
	}, 120000);
	afterAll(async () => {
		await service?.end();
		await admin?.end();
		pg?.stop();
	});
	function observer(status = 200) {
		const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.state).not.toHaveProperty('baseline');
			return new Response(
				JSON.stringify({
					model: SPECIALIST_SHADOW_POLICY.model,
					id: 'scripted-jev',
					answers: {
						bundle: {
							type: 'choice',
							choice: 'document_read',
							confidence: 0.99,
							probabilities: {
								generalist: 0.02,
								project_review: 0.03,
								document_inventory: 0.05,
								document_read: 0.9
							}
						}
					},
					usage: { input_tokens: 100, output_tokens: 10, cost: 0.0001 }
				}),
				{ status }
			);
		});
		const shadow = new JevSpecialistSelectionShadow({
			client: shim,
			decider: new JevClient({ apiKey: 'scripted', fetchImpl, retryOnce: false }),
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true
		});
		return { shadow, fetchImpl };
	}
	async function row(id: string) {
		return (
			await admin.query(
				'SELECT * FROM public.chat_turn_specialist_selection_shadows WHERE turn_run_id=$1',
				[id]
			)
		).rows[0];
	}
	it('records a disagreement without changing the fixed agents, tools, dispatches or answer', async () => {
		const before = await e2eDomainRowCounts(admin);
		const id = await admitE2ETurn(shim, 101);
		const { shadow, fetchImpl } = observer();
		const provider = scriptedWorkflowProvider(happyScript);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			observeSelection: shadow.observe
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await worker.stop();
		}
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const saved = await row(id);
		expect(saved.input.baseline).toBe('project_review');
		expect(saved.result).toMatchObject({
			status: 'observed',
			selectedBundle: 'document_read',
			recommendedBundle: 'document_read',
			agreesWithBaseline: false,
			usage: { attempts: 1, costUsd: 0.0001 }
		});
		expect(saved.input_hash).toBe(selectionHash(saved.input));
		expect(saved.result_hash).toBe(selectionHash(saved.result));
		expect(provider.calls).toHaveLength(4);
		for (const call of provider.calls) expect(call.body.tool_choice).toBe('none');
		expect(provider.callsFor('project_analyst')[0]!.body.messages[0].content).toContain(
			'ROLE: Project analyst'
		);
		const facts = await e2eFacts(admin, id);
		expect(facts.dispatches).toHaveLength(4);
		expect(facts.messages).toHaveLength(1);
		expect(facts.effects).toBe(0);
		expect(await e2eDomainRowCounts(admin)).toEqual(before);
		const args = {
			p_turn_run_id: id,
			p_attempt_token: saved.attempt_token,
			p_result: saved.result,
			p_result_hash: saved.result_hash
		};
		expect((await shim.rpc('finish_agentic_chat_specialist_shadow_v1', args)).data).toEqual({
			outcome: 'already_recorded'
		});
		expect(
			(
				await shim.rpc('finish_agentic_chat_specialist_shadow_v1', {
					...args,
					p_attempt_token: randomUUID()
				})
			).data
		).toEqual({ outcome: 'stale_attempt' });
		expect(
			(
				await shim.rpc('finish_agentic_chat_specialist_shadow_v1', {
					...args,
					p_result_hash: 'b'.repeat(64)
				})
			).data
		).toEqual({ outcome: 'result_conflict' });
		await expect(
			admin.query(
				'UPDATE public.chat_turn_specialist_selection_shadows SET input=input WHERE turn_run_id=$1',
				[id]
			)
		).rejects.toThrow('immutable');
		await admin.query('SET ROLE authenticated');
		try {
			await expect(
				admin.query('SELECT * FROM public.chat_turn_specialist_selection_shadows')
			).rejects.toThrow('permission denied');
		} finally {
			await admin.query('RESET ROLE');
		}
	});
	it('makes no shadow calls or storage reads while off', async () => {
		const id = await admitE2ETurn(shim, 102);
		const before = shim.rpcCalls.length;
		const worker = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			await worker.stop();
		}
		expect(await row(id)).toBeUndefined();
		expect(shim.rpcCalls.slice(before).filter((n) => n.includes('shadow'))).toEqual([]);
	});
	it('continues the review on a provider failure and preserves its unavailable receipt', async () => {
		const id = await admitE2ETurn(shim, 103);
		const { shadow, fetchImpl } = observer(429);
		const worker = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client,
			observeSelection: shadow.observe
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await worker.stop();
		}
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect((await row(id)).result).toMatchObject({
			status: 'unavailable',
			reason: 'jev_http_429',
			usage: { costUsd: null }
		});
	});
	it('reuses the receipt in a fresh worker after interruption before the planner', async () => {
		const id = await admitE2ETurn(shim, 104);
		const { shadow, fetchImpl } = observer();
		const controller = new AbortController();
		const provider = scriptedWorkflowProvider(happyScript);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			observeSelection: async (input) => {
				await shadow.observe(input);
				controller.abort(new Error('Test process restart'));
			}
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id), controller.signal);
		} finally {
			await worker.stop();
		}
		expect(provider.calls).toHaveLength(0);
		const saved = await row(id);
		expect(saved.result.status).toBe('observed');
		const replacement = observer();
		const resumed = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client,
			observeSelection: replacement.shadow.observe
		});
		try {
			expect(await resumed.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			await resumed.stop();
		}
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(replacement.fetchImpl).not.toHaveBeenCalled();
		expect((await row(id)).input_hash).toBe(saved.input_hash);
		expect((await row(id)).result_hash).toBe(saved.result_hash);
	});
	it('never dispatches after a lost begin receipt, and leaves the unknown attempt visible', async () => {
		const id = await admitE2ETurn(shim, 105);
		const { shadow, fetchImpl } = observer();
		let lost = false;
		shim.intercept(async (name, _args, run) => {
			const receipt = await run();
			if (name === 'begin_agentic_chat_specialist_shadow_v1' && !lost) {
				lost = true;
				return {
					data: null,
					error: { code: '08006', message: 'Response lost after commit' }
				};
			}
			return receipt;
		});
		const worker = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client,
			observeSelection: async (input) => {
				await shadow.observe(input);
				await shadow.observe(input);
			}
		});
		try {
			expect(await worker.execute(await leaseAndClaimE2E(admin, shim, id))).toMatchObject({
				terminalStatus: 'completed'
			});
		} finally {
			shim.intercept(null);
			await worker.stop();
		}
		expect(lost).toBe(true);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect((await row(id)).result).toBeNull();
	});
	it('requires the active fence, current access, a bound context and an authentic input hash', async () => {
		const id = await admitE2ETurn(shim, 106);
		const { shadow } = observer();
		const direct = createPgSupabaseShim(service);
		let checked = false;
		shim.intercept(async (name, args, run) => {
			if (name !== 'begin_agentic_chat_specialist_shadow_v1') return run();
			const probe = async (patch: Record<string, unknown>, outcome: string) =>
				expect((await direct.rpc(name, { ...args, ...patch })).data).toEqual({ outcome });
			await probe(
				{ p_execution_generation: Number(args.p_execution_generation) + 1 },
				'stale_generation'
			);
			await probe({ p_processing_token: randomUUID() }, 'ownership_lost');
			expect(
				(await direct.rpc(name, { ...args, p_input_hash: 'f'.repeat(64) })).error
			).not.toBeNull();
			await admin.query('UPDATE public.onto_projects SET deleted_at=now() WHERE id=$1', [
				E2E_PROJECT_ID
			]);
			try {
				await probe({}, 'access_denied');
			} finally {
				await admin.query('UPDATE public.onto_projects SET deleted_at=NULL WHERE id=$1', [
					E2E_PROJECT_ID
				]);
			}
			const input = {
				...(args.p_input as Record<string, unknown>),
				contextHash: 'b'.repeat(64)
			};
			expect(
				(
					await direct.rpc(name, {
						...args,
						p_input: input,
						p_input_hash: selectionHash(input)
					})
				).error
			).not.toBeNull();
			checked = true;
			return run();
		});
		const worker = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client,
			observeSelection: shadow.observe
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			shim.intercept(null);
			await worker.stop();
		}
		expect(checked).toBe(true);
		expect((await row(id)).result.status).toBe('observed');
	});
	it('does not dispatch a shadow decision after cancellation is recorded', async () => {
		const id = await admitE2ETurn(shim, 107);
		const { shadow, fetchImpl } = observer();
		const direct = createPgSupabaseShim(service);
		let checked = false;
		shim.intercept(async (name, _args, run) => {
			if (name !== 'begin_agentic_chat_specialist_shadow_v1') return run();
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
			checked = true;
			return receipt;
		});
		const provider = scriptedWorkflowProvider(happyScript);
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			observeSelection: shadow.observe
		});
		try {
			await worker.execute(await leaseAndClaimE2E(admin, shim, id));
		} finally {
			shim.intercept(null);
			await worker.stop();
		}
		expect(checked).toBe(true);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(provider.calls).toHaveLength(0);
		expect(await row(id)).toBeUndefined();
	});
});
