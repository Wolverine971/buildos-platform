import { describe, expect, it, vi } from 'vitest';
import {
	createBookSynthesisProvider,
	createBookSynthesisProcessor,
	validateBookAnalysis,
	type SynthesisResult,
	type SynthesisExecution
} from '../src/workers/libri/bookSynthesis';
import type { ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import type { LibriCostLedgerPort } from '../src/workers/libri/costLedger';

import { book, chapter, input, analysis } from './helpers/libriSynthesisFixture';
const model = 'openai/gpt-5-nano';
const result: SynthesisResult = {
	analysis: validateBookAnalysis(analysis, input),
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
		taskType: 'synthesize_book',
		bookId: book,
		mode: 'fill_missing'
	}
};
const signal = new AbortController().signal;
function harness() {
	const execution: SynthesisExecution = {
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
		processor: createBookSynthesisProcessor(
			{ execution, provider, ledger },
			{ model, reservedMicrousd: 100n }
		)
	};
}
describe('grounded structured book synthesis', () => {
	it('pins chapter labels to actual input and calculates coverage', () => {
		expect(validateBookAnalysis(analysis, input)).toMatchObject({
			status: 'generated',
			chapterInsights: [{ chapterId: chapter, chapterTitle: 'First', chapterNumber: '1' }],
			coverage: { chapterSummaryCoverage: 1, chapterInsightCoverage: 1 }
		});
	});
	it('rejects unknown chapter and idea references', () => {
		expect(() =>
			validateBookAnalysis(
				{
					...analysis,
					chapterInsights: [{ ...analysis.chapterInsights[0], chapterId: book }]
				},
				input
			)
		).toThrow('Unknown synthesis chapter');
		expect(() =>
			validateBookAnalysis(
				{
					...analysis,
					chapterInsights: [{ ...analysis.chapterInsights[0], keyIdeaIds: ['invented'] }]
				},
				input
			)
		).toThrow('Unknown synthesis idea');
	});
	it('keeps thin evidence honest', () => {
		expect(
			validateBookAnalysis(analysis, {
				...input,
				dataset: {
					...input.dataset,
					chapters: [{ ...input.dataset.chapters[0], summary: '' }]
				}
			}).status
		).toBe('insufficient_evidence');
	});
	it('rejects non-finite confidence and oversized structured content', () => {
		expect(() =>
			validateBookAnalysis(
				{ ...analysis, keyIdeas: [{ ...analysis.keyIdeas[0], confidence: NaN }] },
				input
			)
		).toThrow();
		expect(() =>
			validateBookAnalysis({ ...analysis, practicalTakeaways: ['x'.repeat(341)] }, input)
		).toThrow();
	});
	it('calls once and saves through atomic execution', async () => {
		const h = harness();
		await h.processor.execute(claim, signal);
		expect(h.provider.execute).toHaveBeenCalledOnce();
		expect(h.execution.complete).toHaveBeenCalledWith(claim, book, input, result);
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
	it('reuses a fresh matching analysis with durable completion and no paid reservation', async () => {
		const h = harness();
		vi.mocked(h.execution.load).mockResolvedValue({
			...input,
			currentAnalysis: {
				id: book,
				status: 'generated',
				version: 3,
				fingerprint: input.fingerprint,
				generatedAt: new Date().toISOString()
			}
		});
		await h.processor.execute(claim, signal);
		expect(h.execution.useCurrent).toHaveBeenCalledWith(claim, book);
		expect(h.ledger.reserveProviderCost).not.toHaveBeenCalled();
	});
	it('force mode regenerates even when current', async () => {
		const h = harness();
		vi.mocked(h.execution.load).mockResolvedValue({
			...input,
			currentAnalysis: {
				id: book,
				status: 'reviewed',
				version: 3,
				fingerprint: input.fingerprint,
				generatedAt: new Date().toISOString()
			}
		});
		await h.processor.execute(
			{ ...claim, payload: { ...claim.payload, mode: 'force' } },
			signal
		);
		expect(h.provider.execute).toHaveBeenCalledOnce();
	});
});
describe('single OpenRouter synthesis request', () => {
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
		const provider = createBookSynthesisProvider({
			apiKey: 'offline-key',
			allowedModels: [model],
			fetchImpl
		});
		expect(await provider.execute(input, model, signal)).toEqual(result);
		const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
		expect(body).toMatchObject({
			max_tokens: 4500,
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
				createBookSynthesisProvider({
					apiKey: 'offline-key',
					allowedModels: [model],
					fetchImpl
				}).execute(input, model, signal)
			).rejects.toThrow();
			expect(fetchImpl).toHaveBeenCalledOnce();
		}
	);
});
