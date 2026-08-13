// apps/worker/src/workers/agentic-chat/liveVision.ts

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type AgenticChatLiveVisionPolicyV1,
	type Database,
	type FrozenChatAttachmentV1,
	type JsonObject,
	assessAgenticChatLiveVisionEligibilityV1
} from '@buildos/shared-types';
import { WorkerAgenticChatToolAccessAdapter } from './workerAccessAdapter';
import {
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from './executionObservation';

const SOURCE_VALIDATION_SIGNED_URL_TTL_SECONDS = 60;

export type AgenticChatLiveVisionImageV1 = {
	attachmentKey: string;
	signedUrl: string;
	detail: 'auto';
};

export type AgenticChatLiveVisionResolutionReasonV1 =
	| 'missing_storage_pointer'
	| 'unsupported_content_type'
	| 'invalid_file_size'
	| 'file_too_large'
	| 'missing_checksum'
	| 'expired_temporary_attachment'
	| 'access_lost'
	| 'source_missing'
	| 'source_mismatch'
	| 'source_fetch_failed'
	| 'source_content_type_mismatch'
	| 'checksum_mismatch'
	| 'signed_url_failed';

export type AgenticChatLiveVisionResolveInputV1 = {
	turnRunId: string;
	queueJobId: string;
	processingToken: string;
	userId: string;
	executionGeneration: number;
	policy: AgenticChatLiveVisionPolicyV1;
	attachments: readonly FrozenChatAttachmentV1[];
	signal: AbortSignal;
};

export type AgenticChatLiveVisionResolveResultV1 = {
	images: readonly AgenticChatLiveVisionImageV1[];
	failed: readonly {
		attachmentKey: string;
		reason: AgenticChatLiveVisionResolutionReasonV1;
	}[];
	skippedByLimit: number;
};

export type AgenticChatLiveVisionResolverPortV1 = {
	resolve(
		input: AgenticChatLiveVisionResolveInputV1
	): Promise<AgenticChatLiveVisionResolveResultV1>;
};

type AssetIdentityRow = {
	id: string;
	project_id: string;
	kind: string;
	storage_bucket: string;
	storage_path: string;
	content_type: string;
	file_size_bytes: number;
	checksum_sha256: string | null;
	deleted_at: string | null;
};

export class SupabaseAgenticChatLiveVisionResolver implements AgenticChatLiveVisionResolverPortV1 {
	constructor(
		private readonly ports: {
			client: SupabaseClient<Database>;
			observations: AgenticChatExecutionObservationPortV1;
			fetchImpl?: typeof fetch;
			now?: () => number;
			assertProjectAccess?: (
				userId: string,
				projectId: string,
				signal: AbortSignal
			) => Promise<void>;
		}
	) {}

	async resolve(
		input: AgenticChatLiveVisionResolveInputV1
	): Promise<AgenticChatLiveVisionResolveResultV1> {
		throwIfAborted(input.signal);
		const failed: Array<{
			attachmentKey: string;
			reason: AgenticChatLiveVisionResolutionReasonV1;
		}> = [];
		const eligible: FrozenChatAttachmentV1[] = [];
		const projectAccess = new Map<string, boolean>();

		for (const attachment of input.attachments) {
			throwIfAborted(input.signal);
			const attachmentKey = attachmentIdentityKey(attachment);
			const eligibility = assessAgenticChatLiveVisionEligibilityV1(attachment, {
				maxBytes: input.policy.maxImageBytes,
				nowMs: this.ports.now?.() ?? Date.now()
			});
			if (!eligibility.eligible) {
				failed.push({ attachmentKey, reason: eligibility.reason });
				continue;
			}

			if (attachment.attachment_kind === 'onto_asset') {
				const sourceResult = await this.validateProjectAssetSource({
					input,
					attachment,
					projectAccess
				});
				if (sourceResult) {
					failed.push({ attachmentKey, reason: sourceResult });
					continue;
				}
			} else if (!isUserScopedTemporaryPath(attachment, input.userId)) {
				failed.push({ attachmentKey, reason: 'source_mismatch' });
				continue;
			}
			eligible.push(attachment);
		}

		const selected = eligible.slice(0, input.policy.maxImages);
		const skippedByLimit = Math.max(0, eligible.length - selected.length);
		const images: AgenticChatLiveVisionImageV1[] = [];
		for (const attachment of selected) {
			throwIfAborted(input.signal);
			const attachmentKey = attachmentIdentityKey(attachment);
			const resolution = await this.resolveSignedImage(input, attachment);
			if ('reason' in resolution) {
				failed.push({ attachmentKey, reason: resolution.reason });
				continue;
			}
			images.push({ attachmentKey, signedUrl: resolution.signedUrl, detail: 'auto' });
		}

		const result = { images, failed, skippedByLimit } as const;
		await this.persistReceipt(input, result);
		throwIfAborted(input.signal);
		return result;
	}

	private async validateProjectAssetSource(params: {
		input: AgenticChatLiveVisionResolveInputV1;
		attachment: FrozenChatAttachmentV1;
		projectAccess: Map<string, boolean>;
	}): Promise<AgenticChatLiveVisionResolutionReasonV1 | null> {
		const projectId = params.attachment.project_id;
		const assetId = params.attachment.asset_id;
		if (!projectId || !assetId) return 'source_mismatch';

		let allowed = params.projectAccess.get(projectId);
		if (allowed === undefined) {
			try {
				if (this.ports.assertProjectAccess) {
					await this.ports.assertProjectAccess(
						params.input.userId,
						projectId,
						params.input.signal
					);
				} else {
					await new WorkerAgenticChatToolAccessAdapter({
						client: this.ports.client,
						userId: params.input.userId
					}).assertProjectAccess(projectId, 'read');
				}
				throwIfAborted(params.input.signal);
				allowed = true;
			} catch {
				allowed = false;
			}
			params.projectAccess.set(projectId, allowed);
		}
		if (!allowed) return 'access_lost';

		const request = this.ports.client
			.from('onto_assets')
			.select(
				'id, project_id, kind, storage_bucket, storage_path, content_type, file_size_bytes, checksum_sha256, deleted_at'
			)
			.eq('id', assetId)
			.eq('project_id', projectId)
			.abortSignal(params.input.signal)
			.maybeSingle();
		const { data, error } = await request;
		throwIfAborted(params.input.signal);
		if (error) return 'source_fetch_failed';
		if (!data) return 'source_missing';
		return matchesFrozenSource(data as AssetIdentityRow, params.attachment)
			? null
			: 'source_mismatch';
	}

	private async resolveSignedImage(
		input: AgenticChatLiveVisionResolveInputV1,
		attachment: FrozenChatAttachmentV1
	): Promise<{ signedUrl: string } | { reason: AgenticChatLiveVisionResolutionReasonV1 }> {
		const bucket = attachment.storage_bucket!;
		const path = attachment.storage_path!;
		const rawUrl = await this.createSignedUrl({
			bucket,
			path,
			ttlSeconds: SOURCE_VALIDATION_SIGNED_URL_TTL_SECONDS,
			signal: input.signal
		});
		if (!rawUrl) return { reason: 'signed_url_failed' };

		const validation = await validateSignedSource({
			fetchImpl: this.ports.fetchImpl ?? fetch,
			url: rawUrl,
			expectedContentType: attachment.content_type!,
			expectedBytes: attachment.file_size_bytes!,
			maximumBytes: input.policy.maxImageBytes,
			expectedSha256: attachment.checksum_sha256!,
			signal: input.signal
		});
		if (validation) return { reason: validation };

		const providerUrl = await this.createSignedUrl({
			bucket,
			path,
			ttlSeconds: input.policy.signedUrlTtlSeconds,
			renderWidth: input.policy.renderWidth,
			signal: input.signal
		});
		return providerUrl ? { signedUrl: providerUrl } : { reason: 'signed_url_failed' };
	}

	private async createSignedUrl(params: {
		bucket: string;
		path: string;
		ttlSeconds: number;
		renderWidth?: number;
		signal: AbortSignal;
	}): Promise<string | null> {
		try {
			const { data, error } = await this.ports.client.storage
				.from(params.bucket)
				.createSignedUrl(
					params.path,
					params.ttlSeconds,
					params.renderWidth ? { transform: { width: params.renderWidth } } : undefined
				);
			throwIfAborted(params.signal);
			return error || !data?.signedUrl ? null : data.signedUrl;
		} catch {
			throwIfAborted(params.signal);
			return null;
		}
	}

	private persistReceipt(
		input: AgenticChatLiveVisionResolveInputV1,
		result: AgenticChatLiveVisionResolveResultV1
	): Promise<void> {
		const resolvedByKey = new Map(
			input.attachments.map((attachment) => [attachmentIdentityKey(attachment), attachment])
		);
		const payload: JsonObject = {
			requested: true,
			policy: {
				max_images: input.policy.maxImages,
				max_image_bytes: input.policy.maxImageBytes,
				render_width: input.policy.renderWidth,
				signed_url_ttl_seconds: input.policy.signedUrlTtlSeconds
			},
			resolved: result.images.map((image) => {
				const attachment = resolvedByKey.get(image.attachmentKey)!;
				return {
					attachment_key: image.attachmentKey,
					content_type: attachment.content_type,
					file_size_bytes: attachment.file_size_bytes,
					checksum_sha256: attachment.checksum_sha256
				};
			}),
			failed: result.failed.map((failure) => ({
				attachment_key: failure.attachmentKey,
				reason: failure.reason
			})),
			skipped_by_limit: result.skippedByLimit
		};
		return this.ports.observations.observe(
			{
				turnRunId: input.turnRunId,
				queueJobId: input.queueJobId,
				processingToken: input.processingToken,
				userId: input.userId,
				executionGeneration: input.executionGeneration,
				observationKey: createStableAgenticChatExecutionObservationKeyV1({
					turnRunId: input.turnRunId,
					scope: 'live-vision:current-turn',
					boundary: 'provider_media_resolved'
				}),
				phase: 'provider',
				eventType: 'provider_media_resolved',
				payload
			},
			input.signal
		);
	}
}

function matchesFrozenSource(row: AssetIdentityRow, attachment: FrozenChatAttachmentV1): boolean {
	return (
		row.id === attachment.asset_id &&
		row.project_id === attachment.project_id &&
		row.kind === 'image' &&
		row.deleted_at === null &&
		row.storage_bucket === attachment.storage_bucket &&
		row.storage_path === attachment.storage_path &&
		row.content_type.toLowerCase() === attachment.content_type?.toLowerCase() &&
		row.file_size_bytes === attachment.file_size_bytes &&
		row.checksum_sha256?.toLowerCase() === attachment.checksum_sha256?.toLowerCase()
	);
}

function isUserScopedTemporaryPath(attachment: FrozenChatAttachmentV1, userId: string): boolean {
	return (
		attachment.project_id === null &&
		Boolean(attachment.temporary_attachment_id) &&
		attachment.storage_bucket === 'onto-assets' &&
		attachment.storage_path?.startsWith(
			`users/${userId}/chat-temp/${attachment.temporary_attachment_id}/`
		) === true
	);
}

function attachmentIdentityKey(attachment: FrozenChatAttachmentV1): string {
	return attachment.attachment_kind === 'onto_asset'
		? `asset:${attachment.asset_id ?? ''}`
		: `temporary:${attachment.temporary_attachment_id ?? ''}`;
}

async function validateSignedSource(params: {
	fetchImpl: typeof fetch;
	url: string;
	expectedContentType: string;
	expectedBytes: number;
	maximumBytes: number;
	expectedSha256: string;
	signal: AbortSignal;
}): Promise<AgenticChatLiveVisionResolutionReasonV1 | null> {
	let response: Response;
	try {
		response = await params.fetchImpl(params.url, {
			method: 'GET',
			redirect: 'error',
			signal: params.signal
		});
	} catch {
		throwIfAborted(params.signal);
		return 'source_fetch_failed';
	}
	if (!response.ok || !response.body) return 'source_fetch_failed';
	const contentType = response.headers
		.get('content-type')
		?.split(';', 1)[0]
		?.trim()
		.toLowerCase();
	if (!contentType || contentType !== params.expectedContentType.toLowerCase()) {
		await response.body.cancel().catch(() => {});
		return 'source_content_type_mismatch';
	}
	const advertisedBytes = response.headers.get('content-length');
	if (advertisedBytes && /^\d+$/.test(advertisedBytes)) {
		const parsed = Number(advertisedBytes);
		if (parsed > params.maximumBytes || parsed !== params.expectedBytes) {
			await response.body.cancel().catch(() => {});
			return parsed > params.maximumBytes ? 'file_too_large' : 'source_mismatch';
		}
	}

	const hash = createHash('sha256');
	let bytes = 0;
	const reader = response.body.getReader();
	let completed = false;
	try {
		while (true) {
			throwIfAborted(params.signal);
			const chunk = await readStreamChunk(reader, params.signal);
			if (chunk.done) {
				completed = true;
				break;
			}
			bytes += chunk.value.byteLength;
			if (bytes > params.maximumBytes) {
				await reader.cancel();
				return 'file_too_large';
			}
			hash.update(chunk.value);
		}
	} catch {
		throwIfAborted(params.signal);
		return 'source_fetch_failed';
	} finally {
		if (!completed) await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (bytes !== params.expectedBytes) return 'source_mismatch';
	return hash.digest('hex') === params.expectedSha256 ? null : 'checksum_mismatch';
}

function readStreamChunk(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
	if (signal.aborted) {
		return Promise.reject(
			signal.reason instanceof Error
				? signal.reason
				: new DOMException('Operation aborted', 'AbortError')
		);
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(
				signal.reason instanceof Error
					? signal.reason
					: new DOMException('Operation aborted', 'AbortError')
			);
		};
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		signal.addEventListener('abort', onAbort, { once: true });
		reader.read().then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			}
		);
	});
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException('Operation aborted', 'AbortError');
	}
}
