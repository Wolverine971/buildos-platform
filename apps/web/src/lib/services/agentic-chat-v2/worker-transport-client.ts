// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts
import type {
	AgentChatTransportLeaseRequestV1,
	AgentChatTransportLeaseV1,
	ChatAttachmentRef,
	LastTurnContext,
	ProjectFocus
} from '@buildos/shared-types';

const TRANSPORT_ENDPOINT = '/api/agent/v2/transport';
const WORKER_TURNS_ENDPOINT = '/api/agent/v2/turns';
// The server may spend 5s on its first worker-capacity observation and another
// 2.5s on the one permitted fresh observation. Keep the client alive beyond
// that full bounded retry budget so it does not manufacture a legacy fallback
// while the server is still making a valid routing decision.
const TRANSPORT_TIMEOUT_MS = 10_000;
const MAX_LEASE_TOKEN_LENGTH = 8 * 1024;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class AgenticChatWorkerUnavailableResponseError extends Error {
	readonly code = 'worker_unavailable';

	constructor() {
		super('Worker chat is temporarily unavailable. Please try again shortly.');
		this.name = 'AgenticChatWorkerUnavailableResponseError';
	}
}

export type AgenticChatWorkerCommand = {
	leaseToken: string;
	clientTurnId: string;
	streamRunId: string;
	sessionId: string;
	context: AgentChatTransportLeaseRequestV1['context'];
	message: string;
	attachments: ChatAttachmentRef[];
	projectFocus: ProjectFocus | null;
	lastTurnContext: LastTurnContext | null;
	voiceNoteGroupId: string | null;
	preparedPromptKey: string | null;
};

export async function requestAgenticChatTransportLease(input: {
	request: AgentChatTransportLeaseRequestV1;
	fetchImpl?: typeof fetch;
}): Promise<AgentChatTransportLeaseV1 | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS);
	try {
		const response = await (input.fetchImpl ?? fetch)(TRANSPORT_ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json'
			},
			credentials: 'same-origin',
			cache: 'no-store',
			signal: controller.signal,
			body: JSON.stringify(input.request)
		});
		if (!response.ok) {
			if (await isLegacyTransportUnavailableResponse(response)) return null;
			throw new AgenticChatWorkerUnavailableResponseError();
		}
		const value: unknown = await response.json();
		const lease = parseTransportLeaseEnvelope(value);
		if (!lease) throw new AgenticChatWorkerUnavailableResponseError();
		return lease;
	} catch (error) {
		if (error instanceof AgenticChatWorkerUnavailableResponseError) throw error;
		throw new AgenticChatWorkerUnavailableResponseError();
	} finally {
		clearTimeout(timer);
	}
}

async function isLegacyTransportUnavailableResponse(response: Response): Promise<boolean> {
	if (response.status !== 503) return false;
	try {
		const value: unknown = await response.clone().json();
		return isRecord(value) && value.code === 'TRANSPORT_UNAVAILABLE';
	} catch {
		return false;
	}
}

export async function requestAgenticChatWorkerAdmission(input: {
	command: AgenticChatWorkerCommand;
	fetchImpl?: typeof fetch;
}): Promise<{ response: Response; payload: unknown | null }> {
	const response = await (input.fetchImpl ?? fetch)(WORKER_TURNS_ENDPOINT, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		credentials: 'same-origin',
		cache: 'no-store',
		body: JSON.stringify(buildWorkerAdmissionBody(input.command))
	});
	if (!response.ok) return { response, payload: null };
	return { response, payload: await response.json() };
}

function buildWorkerAdmissionBody(command: AgenticChatWorkerCommand) {
	return {
		leaseToken: command.leaseToken,
		clientTurnId: command.clientTurnId,
		streamRunId: command.streamRunId,
		sessionId: command.sessionId,
		context: command.context,
		message: command.message,
		attachments: command.attachments.map(buildWorkerAttachmentBody),
		projectFocus: command.projectFocus
			? {
					focusType: command.projectFocus.focusType,
					focusEntityId: command.projectFocus.focusEntityId ?? null,
					focusEntityName: command.projectFocus.focusEntityName ?? null,
					projectId: command.projectFocus.projectId,
					projectName: command.projectFocus.projectName
				}
			: null,
		lastTurnContext: command.lastTurnContext,
		voiceNoteGroupId: command.voiceNoteGroupId,
		preparedPromptKey: command.preparedPromptKey
	};
}

function buildWorkerAttachmentBody(attachment: ChatAttachmentRef) {
	if (attachment.attachment_kind === 'onto_asset') {
		return {
			attachmentKind: 'onto_asset' as const,
			mediaType: 'image' as const,
			assetId: attachment.asset_id,
			projectId: attachment.project_id ?? null,
			displayOrder: attachment.display_order
		};
	}
	if (attachment.attachment_kind === 'temporary_file') {
		return {
			attachmentKind: 'temporary_file' as const,
			mediaType: 'image' as const,
			temporaryAttachmentId: attachment.temporary_attachment_id,
			storageBucket: attachment.storage_bucket,
			storagePath: attachment.storage_path,
			fileName: attachment.file_name ?? null,
			contentType: attachment.content_type,
			fileSizeBytes: attachment.file_size_bytes,
			width: attachment.width ?? null,
			height: attachment.height ?? null,
			checksumSha256: attachment.checksum_sha256 ?? null,
			expiresAt: attachment.expires_at ?? null,
			displayOrder: attachment.display_order
		};
	}
	throw new Error(`Unsupported worker attachment kind: ${attachment.attachment_kind}`);
}

function parseTransportLeaseEnvelope(value: unknown): AgentChatTransportLeaseV1 | null {
	if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
	const data = value.data;
	if (
		!hasExactKeys(data, ['mode', 'contractVersion', 'decisionId', 'token', 'expiresAt']) ||
		!CANONICAL_UUID.test(String(data.decisionId)) ||
		!canonicalLeaseToken(data.token) ||
		typeof data.expiresAt !== 'string' ||
		!Number.isFinite(Date.parse(data.expiresAt))
	) {
		return null;
	}
	if (
		(data.mode === 'legacy_sse' && data.contractVersion === 'legacy_internal_v1') ||
		(data.mode === 'worker_realtime' && data.contractVersion === 'agentic_chat_worker_v1')
	) {
		return data as AgentChatTransportLeaseV1;
	}
	return null;
}

function canonicalLeaseToken(value: unknown): value is string {
	return Boolean(
		typeof value === 'string' &&
			value.length > 0 &&
			value.length <= MAX_LEASE_TOKEN_LENGTH &&
			value === value.trim() &&
			value.startsWith('actl1.') &&
			/^[\x21-\x7e]+$/.test(value)
	);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
