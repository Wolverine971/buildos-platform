// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts
import type {
	AgentChatTransportLeaseRequestV1,
	AgentChatTransportLeaseV1,
	ChatAttachmentRef,
	LastTurnContext,
	ProjectFocus
} from '@buildos/shared-types';
import { captureEvent } from '$lib/services/posthog';
import { AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT } from '$lib/services/posthog-capture-receipt';

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
	nowMs?: () => number;
}): Promise<{ response: Response; payload: unknown | null }> {
	const nowMs = input.nowMs ?? (() => performance.now());
	const requestStartedAt = nowMs();
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
	captureWorkerAdmissionTiming({
		command: input.command,
		response,
		clientRoundTripMs: Math.max(0, nowMs() - requestStartedAt)
	});
	if (!response.ok) return { response, payload: null };
	return { response, payload: await response.json() };
}

function captureWorkerAdmissionTiming(input: {
	command: AgenticChatWorkerCommand;
	response: Response;
	clientRoundTripMs: number;
}): void {
	const timing = parseWorkerAdmissionServerTiming(input.response.headers.get('server-timing'));
	const workerServerTotalMs =
		timing.workerPreparationMs !== null && timing.workerAdmissionMs !== null
			? timing.workerPreparationMs + timing.workerAdmissionMs
			: null;
	void captureEvent(
		AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT,
		{
			client_admission_round_trip_ms: finiteDuration(input.clientRoundTripMs),
			prepared_inspection_ms: timing.preparedInspectionMs,
			worker_preparation_ms: timing.workerPreparationMs,
			worker_admission_ms: timing.workerAdmissionMs,
			worker_server_total_ms: workerServerTotalMs,
			prepared_admission_outcome: timing.preparedOutcome,
			prepared_admission_hit: timing.preparedOutcome === 'hit',
			prepared_prompt_requested: input.command.preparedPromptKey !== null,
			response_status: input.response.status,
			response_ok: input.response.ok,
			context_type: input.command.context.type,
			has_attachments: input.command.attachments.length > 0
		},
		{
			delivery: 'immediate_beacon'
		}
	);
}

function parseWorkerAdmissionServerTiming(header: string | null): {
	preparedInspectionMs: number | null;
	workerPreparationMs: number | null;
	workerAdmissionMs: number | null;
	preparedOutcome: string | null;
} {
	const entries = new Map(
		(header ?? '')
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => {
				const [name = '', ...parameters] = entry.split(';').map((part) => part.trim());
				return [name, parameters] as const;
			})
	);
	const prepared = entries.get('prepared-admission') ?? [];
	const preparation = entries.get('worker-preparation') ?? [];
	const admission = entries.get('worker-admission') ?? [];
	return {
		preparedInspectionMs: timingDuration(prepared),
		workerPreparationMs: timingDuration(preparation),
		workerAdmissionMs: timingDuration(admission),
		preparedOutcome: timingDescription(prepared)
	};
}

function timingDuration(parameters: string[]): number | null {
	const raw = parameters.find((parameter) => parameter.startsWith('dur='))?.slice(4);
	return raw === undefined ? null : finiteDuration(Number(raw));
}

function finiteDuration(value: number): number | null {
	return Number.isFinite(value) && value >= 0 && value <= 120_000
		? Math.round(value * 10) / 10
		: null;
}

function timingDescription(parameters: string[]): string | null {
	const raw = parameters.find((parameter) => parameter.startsWith('desc='))?.slice(5);
	if (!raw) return null;
	const value = raw.replace(/^"|"$/g, '');
	return /^[a-z0-9_:-]{1,64}$/.test(value) ? value : null;
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
