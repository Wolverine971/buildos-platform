import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	LibriAssetBrokerError,
	createLibriAssetBroker,
	type LibriAssetBrokerOptions
} from '../src/workers/libri/assetBroker';

const BROKER_URL = 'https://build-os.com/api/internal/libri/ocr-assets/redeem';
const TOKEN = 'a'.repeat(64);
const GRANT_ID = '10000000-0000-4000-8000-000000000001';
const NOW_MS = Date.parse('2026-08-31T18:00:00.000Z');
const SIGNED_URL =
	'https://supabase.example/storage/v1/object/sign/libri-assets/image.webp?token=opaque';

describe('Libri OCR asset broker client', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('redeems one grant with the dedicated credential and exact request contract', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse({ signedUrl: SIGNED_URL, mimeType: 'image/webp' }));
		const broker = createBroker({ fetchImpl });

		await expect(broker.redeemOcrAssetGrant(input())).resolves.toEqual({
			signedUrl: SIGNED_URL,
			mimeType: 'image/webp'
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe(BROKER_URL);
		expect(init).toMatchObject({
			method: 'POST',
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store'
			},
			body: JSON.stringify({ grantId: GRANT_ID })
		});
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it.each([
		['http endpoint', 'http://build-os.com/api/internal/libri/ocr-assets/redeem'],
		['wrong path', 'https://build-os.com/api/libri/redeem'],
		['query string', `${BROKER_URL}?grant=1`],
		['embedded credentials', `https://user:secret@build-os.com${new URL(BROKER_URL).pathname}`]
	])('rejects an unsafe %s before construction', (_label, endpointUrl) => {
		expect(() => createBroker({ endpointUrl })).toThrow('LIBRI_ASSET_BROKER_URL');
	});

	it('allows an exact loopback HTTP endpoint only for local development', () => {
		expect(() =>
			createBroker({
				endpointUrl: 'http://127.0.0.1:5173/api/internal/libri/ocr-assets/redeem'
			})
		).not.toThrow();
	});

	it('rejects weak credentials and invalid timeout bounds', () => {
		expect(() => createBroker({ bearerToken: 'short' })).toThrow(
			'PRIVATE_LIBRI_ASSET_BROKER_TOKEN'
		);
		expect(() => createBroker({ timeoutMs: 249 })).toThrow('timeoutMs');
		expect(() => createBroker({ timeoutMs: 10_001 })).toThrow('timeoutMs');
	});

	it('rejects invalid, expired, and pre-aborted grants before fetch', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const broker = createBroker({ fetchImpl });
		await expect(broker.redeemOcrAssetGrant(input({ grantId: 'not-a-uuid' }))).rejects.toThrow(
			'grantId'
		);
		await expect(
			broker.redeemOcrAssetGrant(input({ expiresAt: '2026-08-31T18:00:01.999Z' }))
		).rejects.toMatchObject({
			code: 'broker_grant_expired',
			retryable: true,
			requiresFreshGrant: true
		});
		const controller = new AbortController();
		controller.abort();
		await expect(
			broker.redeemOcrAssetGrant(input({ signal: controller.signal }))
		).rejects.toMatchObject({
			code: 'broker_aborted',
			retryable: true,
			requiresFreshGrant: false
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it.each([
		[401, false, false],
		[400, false, false],
		[404, true, true],
		[429, true, true],
		[503, true, true]
	] as const)(
		'classifies HTTP %s without reading or exposing the response body',
		async (status, retryable, requiresFreshGrant) => {
			const fetchImpl = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response('private broker details', { status }));
			const broker = createBroker({ fetchImpl });

			const error = await broker.redeemOcrAssetGrant(input()).catch((reason) => reason);

			expect(error).toBeInstanceOf(LibriAssetBrokerError);
			expect(error).toMatchObject({
				code: `broker_http_${status}`,
				retryable,
				requiresFreshGrant,
				httpStatus: status
			});
			expect(String(error.message)).not.toContain('private broker details');
			expect(fetchImpl).toHaveBeenCalledOnce();
		}
	);

	it('does not replay a grant after an ambiguous network failure', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('socket secret'));
		const broker = createBroker({ fetchImpl });

		const error = await broker.redeemOcrAssetGrant(input()).catch((reason) => reason);

		expect(error).toMatchObject({
			code: 'broker_network_error',
			retryable: true,
			requiresFreshGrant: true
		});
		expect(String(error.message)).not.toContain('socket secret');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('bounds the attempt by both configured timeout and grant expiry', async () => {
		vi.useFakeTimers();
		const seenSignals: AbortSignal[] = [];
		const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
			seenSignals.push(init!.signal as AbortSignal);
			return new Promise((_resolve, reject) => {
				init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
					once: true
				});
			});
		});
		const broker = createBroker({ fetchImpl, timeoutMs: 5_000 });

		const redemption = broker.redeemOcrAssetGrant(
			input({ expiresAt: '2026-08-31T18:00:05.000Z' })
		);
		const outcome = redemption.catch((error) => error);
		await vi.advanceTimersByTimeAsync(2_999);
		expect(seenSignals[0]?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(outcome).resolves.toMatchObject({
			code: 'broker_timeout',
			requiresFreshGrant: true
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it.each([
		['non-JSON', new Response('ok', { headers: { 'Content-Type': 'text/plain' } })],
		[
			'extra fields',
			jsonResponse({ signedUrl: SIGNED_URL, mimeType: 'image/webp', objectPath: 'private' })
		],
		[
			'unsafe URL',
			jsonResponse({ signedUrl: 'http://supabase.example/image', mimeType: 'image/png' })
		],
		[
			'credentials in URL',
			jsonResponse({ signedUrl: 'https://u:p@example.com/a', mimeType: 'image/png' })
		],
		['unsupported MIME', jsonResponse({ signedUrl: SIGNED_URL, mimeType: 'image/svg+xml' })],
		[
			'oversized body',
			new Response(JSON.stringify({ signedUrl: 'x'.repeat(9_000), mimeType: 'image/png' }), {
				headers: { 'Content-Type': 'application/json' }
			})
		]
	])('fails closed on a %s response', async (_label, response) => {
		const broker = createBroker({
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
		});

		await expect(broker.redeemOcrAssetGrant(input())).rejects.toMatchObject({
			code: 'broker_response_invalid',
			retryable: true,
			requiresFreshGrant: true
		});
	});
});

function createBroker(overrides: Partial<LibriAssetBrokerOptions> = {}) {
	return createLibriAssetBroker({
		endpointUrl: BROKER_URL,
		bearerToken: TOKEN,
		now: () => NOW_MS,
		...overrides
	});
}

function input(
	overrides: Partial<Parameters<ReturnType<typeof createBroker>['redeemOcrAssetGrant']>[0]> = {}
) {
	return {
		grantId: GRANT_ID,
		expiresAt: '2026-08-31T18:01:00.000Z',
		signal: new AbortController().signal,
		...overrides
	};
}

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}
