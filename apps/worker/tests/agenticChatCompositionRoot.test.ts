// apps/worker/tests/agenticChatCompositionRoot.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	assertAgenticChatMutationAdapterCoverageV1,
	createAgenticChatCompositionRoot,
	reportAgenticChatRuntimeTiming,
	reportAgenticChatStalledRecovery,
	reportAgenticChatTurnLeaseEvent
} from '../src/workers/agentic-chat/host/composition-root';
import {
	ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
	normalizeAgenticChatMutationCapabilitiesV1
} from '../src/workers/agentic-chat/mutations/tool-catalog';

function supabaseClient() {
	return {
		rpc: vi.fn(),
		from: vi.fn(),
		channel: vi.fn(),
		removeChannel: vi.fn()
	};
}

describe('createAgenticChatCompositionRoot', () => {
	it('emits bounded structured runtime timing telemetry', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const snapshot = {
			turnRunId: '30000000-0000-4000-8000-000000000003',
			executionGeneration: 1,
			preterminal: { spans: { publisherDrain: { durationMs: 12 } } }
		};

		reportAgenticChatRuntimeTiming(snapshot as never);

		expect(info).toHaveBeenCalledOnce();
		const [label, line] = info.mock.calls[0]!;
		expect(label).toBe('Agentic Chat runtime timing');
		expect(JSON.parse(String(line))).toEqual({
			event: 'agentic_chat_runtime_timing',
			...snapshot
		});
		info.mockRestore();
	});

	it('composes the hosted adapters but remains completely inert', async () => {
		const providerClient = { stream: vi.fn() };
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: providerClient as never,
			providerConfigured: true
		});

		expect(assembly.consumer.queue.getRegisteredJobTypes()).toEqual(['agentic_chat_turn']);
		expect(assembly.consumer.config.concurrency).toBe(1);
		expect(assembly.runtime.getHealth()).toMatchObject({
			healthy: false,
			state: 'idle'
		});
		await expect(assembly.capacity.collect()).resolves.toBeNull();
		expect(providerClient.stream).not.toHaveBeenCalled();
		expect(assembly.providerCapacity.getSnapshot()).toMatchObject({
			configured: true,
			available: true,
			activeRequests: 0
		});
		expect(assembly.consumptionBilling).toBeNull();
	});

	it('hands the provider the untouched acting client unless the live preview flag is on', () => {
		const providerClient = { stream: vi.fn() };
		const actingClient = (assembly: ReturnType<typeof createAgenticChatCompositionRoot>) =>
			(assembly.provider as unknown as { ports: { client: Record<string, unknown> } }).ports
				.client;

		const off = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: providerClient as never,
			providerConfigured: true
		});
		expect(actingClient(off)).toBe(providerClient);

		const on = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: providerClient as never,
			providerConfigured: true,
			liveTextPreviewEnabled: true
		});
		expect(actingClient(on)).not.toBe(providerClient);
		expect(actingClient(on).livePreview).toMatchObject({ publish: expect.any(Function) });
		expect(providerClient.stream).not.toHaveBeenCalled();
	});

	it('composes terminal consumption billing only behind its shared default-off gate', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			consumptionBillingEnabled: true
		});

		expect(assembly.consumptionBilling).not.toBeNull();
	});

	it('uses the same reviewed two-slot bound for consumer, provider, and cancellation', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			consumerConfig: { concurrency: 2 }
		});

		expect(assembly.consumer.config.concurrency).toBe(2);
		expect(assembly.providerCapacity.getSnapshot()).toMatchObject({ concurrency: 2 });
		assembly.cancellation.registerTurn({ turnRunId: 'turn-1', executionGeneration: 1 });
		assembly.cancellation.registerTurn({ turnRunId: 'turn-2', executionGeneration: 1 });
		expect(() =>
			assembly.cancellation.registerTurn({ turnRunId: 'turn-3', executionGeneration: 1 })
		).toThrow('capacity 2 exceeded');
	});

	it('keeps provider evidence closed when credentials are not configured', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: false
		});

		expect(assembly.providerCapacity.getSnapshot()).toMatchObject({
			configured: false,
			available: false
		});
	});

	it('rejects cancellation capacity that diverges from the one-slot consumer', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				cancellationConfig: { consumerConcurrency: 2 }
			})
		).toThrow('must match CHAT_CONCURRENCY');
	});

	it('fails closed when an enabled adapter capability has no installed router entry', () => {
		expect(() =>
			assertAgenticChatMutationAdapterCoverageV1(
				normalizeAgenticChatMutationCapabilitiesV1({ updateOntoTask: true }),
				[]
			)
		).toThrow('missing=update_onto_task');
	});

	it('uses one capability map for provider advertisement and adapter installation', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationCapabilities: { updateOntoTask: true }
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('composes selected task and document adapters behind the router', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationCapabilities: {
				createOntoDocument: true,
				createOntoTask: true,
				updateOntoTask: true
			}
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('composes every reviewed mutation from the code-owned catalog', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationCapabilities: ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('fails closed when a mutation surface has no independent semantic reviewer', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationCapabilities: { updateOntoTask: true }
			})
		).toThrow('require an independent semantic reviewer client');
	});
});

describe('reportAgenticChatStalledRecovery', () => {
	it('emits a structured alert for an aged or unresolved orphan', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

		reportAgenticChatStalledRecovery({
			startedAt: '2026-08-19T12:10:00.000Z',
			finishedAt: '2026-08-19T12:10:01.000Z',
			candidateCount: 1,
			parkedCount: 0,
			results: [
				{
					turnRunId: 'turn-1',
					queueJobId: 'job-1',
					startedAt: '2026-08-19T11:50:00.000Z',
					stalledAt: '2026-08-19T12:00:00.000Z',
					executionGeneration: 1,
					outcome: 'manual_recovery_required',
					error: null
				}
			]
		});

		expect(error).toHaveBeenCalledWith(
			'Agentic Chat stalled recovery requires attention',
			expect.objectContaining({
				event: 'agentic_chat_stalled_recovery_report',
				alert: true,
				oldestCandidateAgeMs: 1_201_000,
				attentionRequiredCount: 1,
				candidateCount: 1
			})
		);
		expect(info).not.toHaveBeenCalled();
		error.mockRestore();
		info.mockRestore();
	});

	it('alerts on parked turns even when the sweep had no candidates, and stays quiet otherwise', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const quiet = {
			startedAt: '2026-08-19T12:10:00.000Z',
			finishedAt: '2026-08-19T12:10:01.000Z',
			candidateCount: 0,
			parkedCount: 0,
			results: []
		};

		reportAgenticChatStalledRecovery(quiet);
		expect(error).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();

		reportAgenticChatStalledRecovery({ ...quiet, parkedCount: 2 });
		expect(error).toHaveBeenCalledWith(
			'Agentic Chat stalled recovery requires attention',
			expect.objectContaining({ alert: true, attentionRequiredCount: 2, parkedCount: 2 })
		);
		error.mockRestore();
		info.mockRestore();
	});
});

describe('reportAgenticChatTurnLeaseEvent', () => {
	it('warns on one failed renewal and alerts on repeats, loss, or self-fencing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const base = { turnRunId: 'turn-1', executionGeneration: 2 };

		reportAgenticChatTurnLeaseEvent({
			type: 'renew_failed',
			...base,
			consecutiveFailures: 1,
			error: new Error('blip')
		});
		reportAgenticChatTurnLeaseEvent({
			type: 'renew_failed',
			...base,
			consecutiveFailures: 2,
			error: new Error('blip again')
		});
		reportAgenticChatTurnLeaseEvent({ type: 'lease_lost', ...base, reason: 'lease_expired' });
		reportAgenticChatTurnLeaseEvent({
			type: 'self_fenced',
			...base,
			unacknowledgedForMs: 60_000
		});
		// A turn that finished in the database first is the normal race, not an alert.
		reportAgenticChatTurnLeaseEvent({ type: 'lease_lost', ...base, reason: 'turn_terminal' });
		reportAgenticChatTurnLeaseEvent({ type: 'renewal_stopped', ...base, reason: 'hard_cap' });

		expect(warn.mock.calls.map(([, payload]) => payload)).toEqual([
			{ event: 'agentic_chat_turn_lease_renew_failed', ...base, consecutiveFailures: 1 },
			{ event: 'agentic_chat_turn_lease_renewal_stopped', ...base, reason: 'hard_cap' }
		]);
		expect(error.mock.calls.map(([, payload]) => payload)).toEqual([
			{ event: 'agentic_chat_turn_lease_renew_failed', ...base, consecutiveFailures: 2 },
			{ event: 'agentic_chat_turn_lease_lease_lost', ...base, reason: 'lease_expired' },
			{ event: 'agentic_chat_turn_lease_self_fenced', ...base, unacknowledgedForMs: 60_000 }
		]);
		expect(info.mock.calls.map(([, payload]) => payload)).toEqual([
			{ event: 'agentic_chat_turn_lease_lease_lost', ...base, reason: 'turn_terminal' }
		]);
		warn.mockRestore();
		error.mockRestore();
		info.mockRestore();
	});
});
