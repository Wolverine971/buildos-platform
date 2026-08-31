import { describe, expect, it, vi } from 'vitest';
import type { ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { LibriMaintenanceProcessorError } from '../src/workers/libri/maintenanceConsumer';
import {
	createLibriOcrProcessor,
	type LibriOcrProcessorDependencies
} from '../src/workers/libri/ocrProcessor';

const IMAGE_ID = 'd1000000-0000-4000-8000-000000000001';
const RESERVATION_ID = 'd2000000-0000-4000-8000-000000000001';
const GRANT_ID = 'd3000000-0000-4000-8000-000000000001';
const SOURCE_CHUNK_ID = 'd4000000-0000-4000-8000-000000000001';
const MODEL = 'openai/gpt-4.1-mini';

describe('Libri OCR processor', () => {
	it('orders cost, capability, paid authority, provider, and atomic completion exactly once', async () => {
		const harness = dependencies();
		const processor = createLibriOcrProcessor(harness.ports, options());

		await expect(
			processor.execute(claim(), new AbortController().signal)
		).resolves.toBeUndefined();

		expect(harness.calls).toEqual([
			'reserve',
			'grant',
			'broker',
			'authorize',
			'provider',
			'complete'
		]);
		expect(harness.reserve).toHaveBeenCalledWith(
			expect.objectContaining({
				reservationKey: `ocr:image:${IMAGE_ID}:version:1`,
				provider: 'openrouter',
				model: MODEL,
				reservedMicrousd: 50_000n
			})
		);
		expect(harness.provider).toHaveBeenCalledWith(
			expect.objectContaining({
				imageUrl: 'https://storage.example.test/signed-image',
				model: MODEL,
				maxOutputTokens: 2_048,
				maxOutputChars: 100_000
			})
		);
		expect(harness.complete).toHaveBeenCalledWith(
			expect.objectContaining({
				reservationId: RESERVATION_ID,
				imageId: IMAGE_ID,
				actualCostMicrousd: 1_234n,
				promptTokens: 25n,
				completionTokens: 9n
			})
		);
		expect(harness.release).not.toHaveBeenCalled();
	});

	it('releases reserved budget when capability redemption fails before provider authority', async () => {
		const harness = dependencies();
		harness.broker.mockRejectedValueOnce(new Error('broker unavailable'));
		const processor = createLibriOcrProcessor(harness.ports, options());

		const error = await processor
			.execute(claim(), new AbortController().signal)
			.catch((caught) => caught);
		expect(error).toBeInstanceOf(LibriMaintenanceProcessorError);
		expect(error).toMatchObject({ code: 'ocr_pre_authorization_failed', retryable: true });
		expect(harness.release).toHaveBeenCalledWith(
			expect.objectContaining({ reservationId: RESERVATION_ID })
		);
		expect(harness.authorize).not.toHaveBeenCalled();
		expect(harness.provider).not.toHaveBeenCalled();
	});

	it('does not renew an already-started authorization or release its exposure', async () => {
		const harness = dependencies();
		harness.authorize.mockResolvedValueOnce({
			authorized: false,
			outcome: 'started',
			maxOutputChars: 100_000,
			provider: 'openrouter',
			model: MODEL
		});
		const processor = createLibriOcrProcessor(harness.ports, options());

		const error = await processor
			.execute(claim(), new AbortController().signal)
			.catch((caught) => caught);
		expect(error).toMatchObject({
			code: 'ocr_reconciliation_required',
			retryable: false
		});
		expect(harness.release).not.toHaveBeenCalled();
		expect(harness.provider).not.toHaveBeenCalled();
	});

	it('routes every post-authorization provider failure to reconciliation without retry', async () => {
		const harness = dependencies();
		harness.provider.mockRejectedValueOnce(new Error('ambiguous provider timeout'));
		const processor = createLibriOcrProcessor(harness.ports, options());

		const error = await processor
			.execute(claim(), new AbortController().signal)
			.catch((caught) => caught);
		expect(error).toMatchObject({
			code: 'ocr_reconciliation_required',
			retryable: false
		});
		expect(harness.release).not.toHaveBeenCalled();
		expect(harness.complete).not.toHaveBeenCalled();
	});

	it('requires reported provider cost before it can persist or complete', async () => {
		const harness = dependencies();
		harness.provider.mockResolvedValueOnce({
			providerRequestId: 'openrouter-request-1',
			extractedText: 'OCR text',
			summary: 'Summary.',
			provider: 'openrouter',
			model: MODEL,
			promptTokens: 25,
			completionTokens: 9,
			estimatedCostMicrousd: null
		});
		const processor = createLibriOcrProcessor(harness.ports, options());

		const error = await processor
			.execute(claim(), new AbortController().signal)
			.catch((caught) => caught);
		expect(error).toMatchObject({ code: 'ocr_reconciliation_required', retryable: false });
		expect(harness.complete).not.toHaveBeenCalled();
	});

	it('treats an atomic completion denial as reconciliation after the paid response', async () => {
		const harness = dependencies();
		harness.complete.mockResolvedValueOnce({
			accepted: false,
			outcome: 'stale',
			sourceChunkId: null,
			ocrVersion: null,
			provider: null,
			model: null,
			contentSha256: null,
			overBudget: false,
			totalSpentMicrousd: 0n,
			remainingMicrousd: 0n
		});
		const processor = createLibriOcrProcessor(harness.ports, options());

		const error = await processor
			.execute(claim(), new AbortController().signal)
			.catch((caught) => caught);
		expect(error).toMatchObject({ code: 'ocr_reconciliation_required', retryable: false });
		expect(harness.release).not.toHaveBeenCalled();
	});

	it('rejects malformed payloads and unsupported queues before reserving cost', async () => {
		const harness = dependencies();
		const processor = createLibriOcrProcessor(harness.ports, options());

		await expect(
			processor.execute(
				{ ...claim(), payload: { ...claim().payload, unexpected: true } },
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'invalid_payload', retryable: false });
		await expect(
			processor.execute(
				{ ...claim(), queueType: 'libri_research' },
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'unsupported_queue_type', retryable: false });
		expect(harness.reserve).not.toHaveBeenCalled();
	});
});

function options() {
	return { model: MODEL, maxOutputTokens: 2_048, reservedMicrousd: 50_000n };
}

function claim(): ClaimedLibriStep {
	return {
		kind: 'claimed',
		queueJobId: 'libri_ingest_test',
		queueRowId: 'd5000000-0000-4000-8000-000000000001',
		processingToken: 'd6000000-0000-4000-8000-000000000001',
		stepId: 'd7000000-0000-4000-8000-000000000001',
		runId: 'd8000000-0000-4000-8000-000000000001',
		libraryId: 'd9000000-0000-4000-8000-000000000001',
		queueType: 'libri_ingest',
		executionGeneration: 1,
		leaseToken: 'da000000-0000-4000-8000-000000000001',
		leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		payload: {
			version: 1,
			kind: 'ocr_image',
			imageId: IMAGE_ID,
			expectedOcrVersion: 1,
			maxOutputChars: 100_000
		}
	};
}

function dependencies() {
	const calls: string[] = [];
	const reserve = vi.fn(async () => {
		calls.push('reserve');
		return {
			reservationId: RESERVATION_ID,
			outcome: 'reserved' as const,
			created: true,
			reservationAmountMicrousd: 50_000n,
			remainingMicrousd: 950_000n
		};
	});
	const release = vi.fn(async () => {
		calls.push('release');
		return { accepted: true, outcome: 'released' as const, remainingMicrousd: 1_000_000n };
	});
	const grant = vi.fn(async () => {
		calls.push('grant');
		return { grantId: GRANT_ID, expiresAt: new Date(Date.now() + 60_000).toISOString() };
	});
	const broker = vi.fn(async () => {
		calls.push('broker');
		return {
			signedUrl: 'https://storage.example.test/signed-image',
			mimeType: 'image/jpeg' as const
		};
	});
	const authorize = vi.fn(async () => {
		calls.push('authorize');
		return {
			authorized: true,
			outcome: 'started' as const,
			maxOutputChars: 100_000,
			provider: 'openrouter',
			model: MODEL
		};
	});
	const provider = vi.fn(async () => {
		calls.push('provider');
		return {
			providerRequestId: 'openrouter-request-1',
			extractedText: 'OCR text',
			summary: 'Summary.',
			confidence: 0.95,
			language: 'en',
			provider: 'openrouter' as const,
			model: MODEL,
			promptTokens: 25,
			completionTokens: 9,
			estimatedCostMicrousd: 1_234
		};
	});
	const complete = vi.fn(async () => {
		calls.push('complete');
		return {
			accepted: true,
			outcome: 'settled' as const,
			sourceChunkId: SOURCE_CHUNK_ID,
			ocrVersion: 1,
			provider: 'openrouter',
			model: MODEL,
			contentSha256: 'a'.repeat(64),
			overBudget: false,
			totalSpentMicrousd: 1_234n,
			remainingMicrousd: 998_766n
		};
	});
	const ports: LibriOcrProcessorDependencies = {
		costLedger: { reserveProviderCost: reserve, releaseProviderCost: release },
		assetGrants: { issueOcrAssetGrant: grant },
		assetBroker: { redeemOcrAssetGrant: broker },
		execution: { authorizeOcrProviderCall: authorize, completeOcrStep: complete },
		provider: { execute: provider }
	};
	return { ports, calls, reserve, release, grant, broker, authorize, provider, complete };
}
