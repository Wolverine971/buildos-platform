// apps/worker/tests/agenticChatLiveVision.test.ts

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { FrozenChatAttachmentV1 } from '@buildos/shared-types';
import {
	SupabaseAgenticChatLiveVisionResolver,
	type AgenticChatLiveVisionResolveInputV1
} from '../src/workers/agentic-chat/liveVision';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';

const TURN_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const TOKEN = '30000000-0000-4000-8000-000000000001';
const USER_ID = '40000000-0000-4000-8000-000000000001';
const PROJECT_ID = '50000000-0000-4000-8000-000000000001';
const ASSET_ID = '60000000-0000-4000-8000-000000000001';
const BYTES = new TextEncoder().encode('verified image bytes');
const CHECKSUM = createHash('sha256').update(BYTES).digest('hex');

const attachment: FrozenChatAttachmentV1 = {
	attachment_kind: 'onto_asset',
	media_type: 'image',
	asset_id: ASSET_ID,
	temporary_attachment_id: null,
	project_id: PROJECT_ID,
	role: 'analysis_target',
	display_order: 0,
	file_name: 'diagram.png',
	content_type: 'image/png',
	file_size_bytes: BYTES.byteLength,
	width: 640,
	height: 480,
	checksum_sha256: CHECKSUM,
	ocr_status: 'complete',
	extraction_summary: null,
	extracted_text_preview: null,
	storage_bucket: 'onto-assets',
	storage_path: `projects/${PROJECT_ID}/${ASSET_ID}.png`,
	expires_at: null
};

function input(
	overrides: Partial<AgenticChatLiveVisionResolveInputV1> = {}
): AgenticChatLiveVisionResolveInputV1 {
	return {
		turnRunId: TURN_ID,
		queueJobId: JOB_ID,
		processingToken: TOKEN,
		userId: USER_ID,
		executionGeneration: 1,
		policy: {
			requested: true,
			maxImages: 2,
			maxImageBytes: 8 * 1024 * 1024,
			renderWidth: 1600,
			signedUrlTtlSeconds: 900
		},
		attachments: [attachment],
		signal: new AbortController().signal,
		...overrides
	};
}

function setup(
	options: {
		row?: Record<string, unknown> | null;
		fetchResponse?: () => Promise<Response>;
		accessError?: Error;
		observationError?: Error;
		now?: () => number;
	} = {}
) {
	const row =
		options.row === undefined
			? {
					id: ASSET_ID,
					project_id: PROJECT_ID,
					kind: 'image',
					storage_bucket: attachment.storage_bucket,
					storage_path: attachment.storage_path,
					content_type: attachment.content_type,
					file_size_bytes: attachment.file_size_bytes,
					checksum_sha256: attachment.checksum_sha256,
					deleted_at: null
				}
			: options.row;
	const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		abortSignal: vi.fn(() => query),
		maybeSingle
	};
	let signedUrlIndex = 0;
	const createSignedUrl = vi.fn(async () => ({
		data: {
			signedUrl:
				signedUrlIndex++ % 2 === 0
					? 'https://storage.example/raw'
					: 'https://storage.example/provider'
		},
		error: null
	}));
	const client = {
		from: vi.fn(() => query),
		storage: { from: vi.fn(() => ({ createSignedUrl })) }
	};
	const observations: AgenticChatExecutionObservationInputV1[] = [];
	const observe = vi.fn(async (observation: AgenticChatExecutionObservationInputV1) => {
		if (options.observationError) throw options.observationError;
		observations.push(observation);
	});
	const assertProjectAccess = vi.fn(async () => {
		if (options.accessError) throw options.accessError;
	});
	const fetchImpl = vi.fn(
		options.fetchResponse ??
			(async () =>
				new Response(BYTES, {
					status: 200,
					headers: {
						'content-type': 'image/png',
						'content-length': String(BYTES.byteLength)
					}
				}))
	);
	const resolver = new SupabaseAgenticChatLiveVisionResolver({
		client: client as never,
		observations: { observe } as never,
		fetchImpl: fetchImpl as typeof fetch,
		assertProjectAccess,
		now: options.now
	} as never);
	return {
		resolver,
		client,
		query,
		createSignedUrl,
		fetchImpl,
		assertProjectAccess,
		observe,
		observations
	};
}

describe('Agentic Chat worker live vision resolver', () => {
	it('revalidates immutable ownership and bytes, signs a transformed URL, and persists no URL or path', async () => {
		const harness = setup();
		const resolutionInput = input();
		const result = await harness.resolver.resolve(resolutionInput);

		expect(result).toEqual({
			images: [
				{
					attachmentKey: `asset:${ASSET_ID}`,
					signedUrl: 'https://storage.example/provider',
					detail: 'auto'
				}
			],
			failed: [],
			skippedByLimit: 0
		});
		expect(harness.assertProjectAccess).toHaveBeenCalledWith(
			USER_ID,
			PROJECT_ID,
			resolutionInput.signal
		);
		expect(harness.fetchImpl).toHaveBeenCalledWith(
			'https://storage.example/raw',
			expect.objectContaining({ method: 'GET', redirect: 'error' })
		);
		expect(harness.createSignedUrl).toHaveBeenNthCalledWith(2, attachment.storage_path, 900, {
			transform: { width: 1600 }
		});
		expect(harness.observations).toHaveLength(1);
		expect(harness.observations[0]).toMatchObject({
			eventType: 'provider_media_resolved',
			phase: 'provider',
			payload: {
				requested: true,
				resolved: [
					{
						attachment_key: `asset:${ASSET_ID}`,
						checksum_sha256: CHECKSUM,
						file_size_bytes: BYTES.byteLength
					}
				],
				failed: [],
				skipped_by_limit: 0
			}
		});
		const persisted = JSON.stringify(harness.observations[0]);
		expect(persisted).not.toContain('storage.example');
		expect(persisted).not.toContain('storage_path');
		expect(persisted).not.toContain('onto-assets');
		expect(persisted).not.toContain(attachment.storage_path);
	});

	it('fails closed to text-only on source drift and records the reason', async () => {
		const harness = setup({
			row: {
				id: ASSET_ID,
				project_id: PROJECT_ID,
				kind: 'image',
				storage_bucket: attachment.storage_bucket,
				storage_path: attachment.storage_path,
				content_type: attachment.content_type,
				file_size_bytes: attachment.file_size_bytes,
				checksum_sha256: 'f'.repeat(64),
				deleted_at: null
			}
		});
		await expect(harness.resolver.resolve(input())).resolves.toMatchObject({
			images: [],
			failed: [{ attachmentKey: `asset:${ASSET_ID}`, reason: 'source_mismatch' }]
		});
		expect(harness.createSignedUrl).not.toHaveBeenCalled();
		expect(harness.observations[0]?.payload).toMatchObject({
			failed: [{ attachment_key: `asset:${ASSET_ID}`, reason: 'source_mismatch' }]
		});
	});

	it('detects byte checksum replacement before producing a provider URL', async () => {
		const harness = setup({
			fetchResponse: async () =>
				new Response(new TextEncoder().encode('different image bytes'), {
					status: 200,
					headers: { 'content-type': 'image/png' }
				})
		});
		const changed = {
			...attachment,
			file_size_bytes: 'different image bytes'.length
		};
		const row = {
			id: ASSET_ID,
			project_id: PROJECT_ID,
			kind: 'image',
			storage_bucket: changed.storage_bucket,
			storage_path: changed.storage_path,
			content_type: changed.content_type,
			file_size_bytes: changed.file_size_bytes,
			checksum_sha256: changed.checksum_sha256,
			deleted_at: null
		};
		harness.query.maybeSingle.mockResolvedValueOnce({ data: row, error: null });

		await expect(
			harness.resolver.resolve(input({ attachments: [changed] }))
		).resolves.toMatchObject({ images: [], failed: [{ reason: 'checksum_mismatch' }] });
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(1);
	});

	it('rejects expired temporary references without storage or network access', async () => {
		const temporary: FrozenChatAttachmentV1 = {
			...attachment,
			attachment_kind: 'temporary_file',
			asset_id: null,
			temporary_attachment_id: 'temp-1',
			project_id: null,
			storage_path: `users/${USER_ID}/chat-temp/temp-1/original.png`,
			expires_at: '2026-08-12T00:00:00.000Z'
		};
		const expiredHarness = setup({
			now: () => Date.parse('2026-08-12T00:00:01.000Z')
		});
		await expect(
			expiredHarness.resolver.resolve(input({ attachments: [temporary] }))
		).resolves.toMatchObject({
			images: [],
			failed: [{ attachmentKey: 'temporary:temp-1', reason: 'expired_temporary_attachment' }]
		});
		expect(expiredHarness.client.from).not.toHaveBeenCalled();
		expect(expiredHarness.createSignedUrl).not.toHaveBeenCalled();
		expect(expiredHarness.fetchImpl).not.toHaveBeenCalled();
	});

	it('does not call storage after access loss and makes the redacted receipt mandatory', async () => {
		const denied = setup({ accessError: new Error('denied') });
		await expect(denied.resolver.resolve(input())).resolves.toMatchObject({
			images: [],
			failed: [{ reason: 'access_lost' }]
		});
		expect(denied.client.from).not.toHaveBeenCalled();
		expect(denied.createSignedUrl).not.toHaveBeenCalled();

		const receiptFailure = setup({ observationError: new Error('ledger unavailable') });
		await expect(receiptFailure.resolver.resolve(input())).rejects.toThrow(
			'ledger unavailable'
		);
	});

	it('honors cancellation before any source, storage, or receipt operation', async () => {
		const harness = setup();
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));
		await expect(
			harness.resolver.resolve(input({ signal: controller.signal }))
		).rejects.toThrow('cancelled');
		expect(harness.client.from).not.toHaveBeenCalled();
		expect(harness.createSignedUrl).not.toHaveBeenCalled();
		expect(harness.observe).not.toHaveBeenCalled();
	});

	it('cancels an in-flight raw-byte reader and never reaches the provider URL or receipt', async () => {
		const cancelled = vi.fn();
		const harness = setup({
			fetchResponse: async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						pull() {
							// Leave the raw source pending until cancellation.
						},
						cancel: cancelled
					}),
					{ status: 200, headers: { 'content-type': 'image/png' } }
				)
		});
		const controller = new AbortController();
		const resolving = harness.resolver.resolve(input({ signal: controller.signal }));
		await vi.waitFor(() => expect(harness.fetchImpl).toHaveBeenCalledOnce());
		controller.abort(new Error('cancelled during media read'));
		await expect(resolving).rejects.toThrow('cancelled during media read');
		expect(cancelled).toHaveBeenCalledOnce();
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(1);
		expect(harness.observe).not.toHaveBeenCalled();
	});

	it('uses stable retry receipts while keeping refreshed signed URLs ephemeral', async () => {
		const harness = setup();
		await harness.resolver.resolve(input());
		await harness.resolver.resolve(input());
		expect(harness.observations).toHaveLength(2);
		expect(harness.observations[1]?.observationKey).toBe(
			harness.observations[0]?.observationKey
		);
		expect(harness.observations[1]?.payload).toEqual(harness.observations[0]?.payload);
	});
});
