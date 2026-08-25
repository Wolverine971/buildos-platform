// apps/worker/tests/agenticChatCompositionRoot.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	assertAgenticChatMutationAdapterCoverageV1,
	createAgenticChatCompositionRoot,
	reportAgenticChatStalledRecovery
} from '../src/workers/agentic-chat/composition-root';
import { normalizeAgenticChatMutationCapabilitiesV1 } from '../src/workers/agentic-chat/mutationToolCatalog';

function supabaseClient() {
	return {
		rpc: vi.fn(),
		from: vi.fn(),
		channel: vi.fn(),
		removeChannel: vi.fn()
	};
}

describe('createAgenticChatCompositionRoot', () => {
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

	it('fails closed when the provider mutation surface is enabled without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { updateOntoTask: true }
			})
		).toThrow('update_onto_task provider capability requires its mutation adapter');
	});

	it('fails closed when an enabled adapter capability has no installed router entry', () => {
		expect(() =>
			assertAgenticChatMutationAdapterCoverageV1(
				normalizeAgenticChatMutationCapabilitiesV1({ updateOntoTask: true }),
				[]
			)
		).toThrow('missing=update_onto_task');
	});

	it('fails closed when create_onto_task is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { createOntoTask: true }
			})
		).toThrow('create_onto_task provider capability requires its mutation adapter');
	});

	it('fails closed when create_onto_document is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { createOntoDocument: true }
			})
		).toThrow('create_onto_document provider capability requires its mutation adapter');
	});

	it('fails closed when move_onto_task is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { moveOntoTask: true }
			})
		).toThrow('move_onto_task provider capability requires its mutation adapter');
	});

	it('fails closed when tag_onto_entity is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { tagOntoEntity: true }
			})
		).toThrow('tag_onto_entity provider capability requires its mutation adapter');
	});

	it('fails closed when a straightforward entity mutation is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { createOntoMilestone: true }
			})
		).toThrow('create_onto_milestone provider capability requires its mutation adapter');
	});

	it('can compose the adapter while keeping provider advertisement separately disabled', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationAdapterCapabilities: { updateOntoTask: true }
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('requires both explicit gates before composing the advertised mutation path', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationProviderCapabilities: { updateOntoTask: true },
			mutationAdapterCapabilities: { updateOntoTask: true }
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('composes independently gated task and document adapters behind the router', () => {
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationProviderCapabilities: {
				createOntoDocument: true,
				createOntoTask: true,
				updateOntoTask: true
			},
			mutationAdapterCapabilities: {
				createOntoDocument: true,
				createOntoTask: true,
				updateOntoTask: true
			}
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('composes every reviewed mutation when both independent gates match', () => {
		const capabilities = {
			createOntoDocument: true,
			updateOntoDocument: true,
			moveDocumentInTree: true,
			createTaskDocument: true,
			linkOntoEntities: true,
			unlinkOntoEdge: true,
			createOntoTask: true,
			updateOntoTask: true,
			moveOntoTask: true,
			tagOntoEntity: true,
			createOntoGoal: true,
			updateOntoGoal: true,
			createOntoPlan: true,
			updateOntoPlan: true,
			createOntoMilestone: true,
			updateOntoMilestone: true,
			createOntoRisk: true,
			updateOntoRisk: true,
			createOntoProject: true,
			updateOntoProject: true
		} as const;
		const assembly = createAgenticChatCompositionRoot({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			semanticReviewerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			mutationProviderCapabilities: capabilities,
			mutationAdapterCapabilities: capabilities
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('fails closed when a mutation surface has no independent semantic reviewer', () => {
		expect(() =>
			createAgenticChatCompositionRoot({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				mutationProviderCapabilities: { updateOntoTask: true },
				mutationAdapterCapabilities: { updateOntoTask: true }
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
});
