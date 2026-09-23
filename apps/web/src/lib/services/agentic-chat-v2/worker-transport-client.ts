// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts
import type { ContextPlanV1 } from '@buildos/agentic-chat-runtime/context-finder';
import type {
	AgentChatTransportContextV1,
	ChatAttachmentRef,
	LastTurnContext,
	ProjectFocus
} from '@buildos/shared-types';
import { captureEvent } from '$lib/services/posthog';
import { AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT } from '$lib/services/posthog-capture-receipt';

// One request per turn: admission resolves the transport decision inline and
// creates a first turn's session, so there is no separate lease endpoint.
const WORKER_TURNS_ENDPOINT = '/api/agent/v2/turns';

/**
 * Retained for callers' existing `instanceof` checks. This module no longer
 * throws it: it was the lease-negotiation failure, and that endpoint is gone.
 */
export class AgenticChatWorkerUnavailableResponseError extends Error {
	readonly code = 'worker_unavailable';

	constructor() {
		super('Worker chat is temporarily unavailable. Please try again shortly.');
		this.name = 'AgenticChatWorkerUnavailableResponseError';
	}
}

export type PublishedSpecialistReference = {
	draftId: string;
	version: number;
	snapshotHash: string;
	selectionDecisionId?: string;
	/** Evidence the user curated in Workflow Lab (context_plan_v1); the server validates it. */
	contextPlan?: ContextPlanV1;
};

/** Host-only provenance used to keep a recommendation or plan scoped to its question. */
export type PublishedSpecialistSelection = PublishedSpecialistReference & {
	selectionQuestion?: string;
	selectionProjectId?: string;
	contextPlanQuestion?: string;
	contextPlanProjectId?: string;
};

export type AgenticChatWorkerCommand = {
	clientTurnId: string;
	streamRunId: string;
	sessionId: string | null;
	context: AgentChatTransportContextV1;
	message: string;
	attachments: ChatAttachmentRef[];
	projectFocus: ProjectFocus | null;
	lastTurnContext: LastTurnContext | null;
	voiceNoteGroupId: string | null;
	preparedPromptKey: string | null;
	reviewIntent?: 'project_review' | 'document_organization' | null;
	publishedSpecialist?: PublishedSpecialistReference | null;
};

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
			delivery: 'immediate_fetch'
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
		preparedPromptKey: command.preparedPromptKey,
		...(command.reviewIntent ? { reviewIntent: command.reviewIntent } : {}),
		...(command.reviewIntent === 'document_organization' && command.publishedSpecialist
			? {
					publishedSpecialist: {
						draftId: command.publishedSpecialist.draftId,
						version: command.publishedSpecialist.version,
						snapshotHash: command.publishedSpecialist.snapshotHash,
						...(command.publishedSpecialist.selectionDecisionId
							? {
									selectionDecisionId:
										command.publishedSpecialist.selectionDecisionId
								}
							: {}),
						...(command.publishedSpecialist.contextPlan
							? { contextPlan: command.publishedSpecialist.contextPlan }
							: {})
					}
				}
			: {})
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
