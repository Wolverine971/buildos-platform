import { describe, expect, it, vi } from 'vitest';
import {
	createBookAgentProvider,
	createBookAgentProcessor,
	validateBookAgentResult,
	type BookAgentResult,
	type BookAgentExecution
} from '../src/workers/libri/bookAgentProfile';
import type { ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import type { LibriCostLedgerPort } from '../src/workers/libri/costLedger';

import { book } from './helpers/libriSynthesisFixture';
import { agentInput as input, agentOutput as analysis } from './helpers/libriAgentFixture';
import { buildBookAgentKnowledge } from '../src/workers/libri/bookAgentProfile';
const model = 'openai/gpt-5-nano';
const result: BookAgentResult = {
	output: validateBookAgentResult(analysis, input),
	model,
	providerRequestId: 'offline-id',
	costMicrousd: 10n,
	promptTokens: 10n,
	completionTokens: 5n
};
const claim: ClaimedLibriStep = {
	kind: 'claimed',
	queueJobId: 'libri_research_offline',
	queueRowId: book,
	processingToken: book,
	stepId: book,
	runId: book,
	libraryId: book,
	queueType: 'libri_research',
	executionGeneration: 1,
	leaseToken: book,
	leaseExpiresAt: '2099-01-01T00:00:00Z',
	payload: {
		version: 1,
		kind: 'task_execute',
		taskType: 'generate_agent_profile',
		bookId: book,
		mode: 'fill_missing'
	}
};
const signal = new AbortController().signal;
function harness() {
	const execution: BookAgentExecution = {
		load: vi.fn(async () => structuredClone(input)),
		authorize: vi.fn(async () => true),
		complete: vi.fn(async () => undefined),
		useCurrent: vi.fn(async () => undefined)
	};
	const provider = { execute: vi.fn(async () => result) };
	const ledger: LibriCostLedgerPort = {
		reserveProviderCost: vi.fn(async () => ({
			reservationId: book,
			outcome: 'reserved' as const,
			created: true,
			reservationAmountMicrousd: 100n,
			remainingMicrousd: 100n
		})),
		authorizeProviderCall: vi.fn(),
		settleProviderCost: vi.fn(),
		releaseProviderCost: vi.fn(async () => ({
			accepted: true,
			outcome: 'released' as const,
			remainingMicrousd: 200n
		}))
	};
	return {
		execution,
		provider,
		ledger,
		processor: createBookAgentProcessor(
			{ execution, provider, ledger },
			{ model, reservedMicrousd: 100n }
		)
	};
}
describe('book expert execution', () => {
	it('calls once and saves through atomic execution', async () => {
		const h = harness();
		await h.processor.execute(claim, signal);
		expect(h.provider.execute).toHaveBeenCalledOnce();
		expect(h.execution.complete).toHaveBeenCalledWith(
			claim,
			book,
			input,
			result,
			buildBookAgentKnowledge(input)
		);
		expect(h.ledger.settleProviderCost).not.toHaveBeenCalled();
	});
	it('requires reconciliation after a lost authorization reply without calling the provider', async () => {
		const h = harness();
		vi.mocked(h.execution.authorize).mockRejectedValue(new Error('reply lost'));
		await expect(h.processor.execute(claim, signal)).rejects.toMatchObject({
			code: 'provider_reconciliation_required',
			retryable: false
		});
		expect(h.provider.execute).not.toHaveBeenCalled();
		expect(h.ledger.releaseProviderCost).not.toHaveBeenCalled();
	});
	it('does not retry or release an unknown paid outcome', async () => {
		const h = harness();
		h.provider.execute.mockRejectedValue(new Error('timeout'));
		await expect(h.processor.execute(claim, signal)).rejects.toMatchObject({
			code: 'provider_reconciliation_required',
			retryable: false
		});
		expect(h.provider.execute).toHaveBeenCalledOnce();
		expect(h.ledger.releaseProviderCost).not.toHaveBeenCalled();
		expect(h.execution.complete).not.toHaveBeenCalled();
	});
	it('never calls when the durable ledger reports an earlier paid attempt', async () => {
		const h = harness();
		vi.mocked(h.ledger.reserveProviderCost).mockResolvedValue({
			reservationId: null,
			outcome: 'reconciliation_required',
			created: false,
			reservationAmountMicrousd: 100n,
			remainingMicrousd: 0n
		});
		await expect(h.processor.execute(claim, signal)).rejects.toMatchObject({
			retryable: false
		});
		expect(h.provider.execute).not.toHaveBeenCalled();
	});
	it('requires ordered evidence headings and bounded blueprint values', () => {
		expect(() =>
			validateBookAgentResult(
				{ ...analysis, agentPrompt: 'Invented unstructured prompt' },
				input
			)
		).toThrow('ordered evidence sections');
		expect(() =>
			validateBookAgentResult(
				{ ...analysis, blueprint: { ...analysis.blueprint, tone: 'x'.repeat(601) } },
				input
			)
		).toThrow();
		expect(() =>
			validateBookAgentResult(
				{
					...analysis,
					blueprint: { ...analysis.blueprint, constraints: Array(13).fill('Too many') }
				},
				input
			)
		).toThrow();
	});
	it('does not claim generated knowledge for a catalog-only input', () => {
		expect(
			validateBookAgentResult(analysis, {
				...input,
				dataset: { ...input.dataset, chapters: [], fragments: [] }
			}).status
		).toBe('insufficient_evidence');
	});
	it('quotes source Markdown inside bounded briefing evidence blocks', () => {
		const knowledge = buildBookAgentKnowledge({
			...input,
			dataset: { ...input.dataset, notes: [{ content: '```\n# Source instruction' }] }
		});
		expect(knowledge).toContain('\\u0060\\u0060\\u0060');
		expect(knowledge).not.toContain('\n# Source instruction');
		expect(knowledge).toContain('untrusted library evidence');
	});
	it('refreshes the manual prompt briefing without reserving any paid call', async () => {
		const h = harness();
		const saved = {
			...input,
			currentPrompt: {
				id: book,
				status: 'outdated',
				model: 'manual',
				version: 2,
				fingerprint: null
			}
		};
		vi.mocked(h.execution.load).mockResolvedValue(saved);
		await h.processor.execute(claim, signal);
		expect(h.execution.useCurrent).toHaveBeenCalledWith(
			claim,
			saved,
			buildBookAgentKnowledge(saved)
		);
		expect(h.ledger.reserveProviderCost).not.toHaveBeenCalled();
	});
});
describe('single OpenRouter book agent request', () => {
	const payload = () => ({
		id: 'offline-id',
		model,
		choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(analysis) } }],
		usage: { cost: 0.00001, prompt_tokens: 10, completion_tokens: 5 }
	});
	it('requests private routing, bounds output, and records reported cost', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(payload())));
		const provider = createBookAgentProvider({
			apiKey: 'offline-key',
			allowedModels: [model],
			fetchImpl
		});
		expect(await provider.execute(input, model, signal)).toEqual(result);
		const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
		expect(body).toMatchObject({
			max_tokens: 6000,
			provider: { data_collection: 'deny', zdr: true, allow_fallbacks: false }
		});
		expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('error');
	});
	it.each(['unknown-cost', 'wrong-model', 'truncated', 'http-failure'])(
		'does not fabricate a successful %s result or retry',
		async (fault) => {
			const data = payload();
			if (fault === 'unknown-cost') delete (data.usage as { cost?: number }).cost;
			if (fault === 'wrong-model') data.model = 'other/model';
			if (fault === 'truncated') data.choices[0].finish_reason = 'length';
			const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(JSON.stringify(data), {
					status: fault === 'http-failure' ? 503 : 200
				})
			);
			await expect(
				createBookAgentProvider({
					apiKey: 'offline-key',
					allowedModels: [model],
					fetchImpl
				}).execute(input, model, signal)
			).rejects.toThrow();
			expect(fetchImpl).toHaveBeenCalledOnce();
		}
	);
});
