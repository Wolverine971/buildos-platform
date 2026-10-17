// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts
import type { ContextPlanV1 } from '@buildos/agentic-chat-runtime/context-finder';
import type {
	AgentChatTransportContextV1,
	ChatAttachmentRef,
	ProjectFocus
} from '@buildos/shared-types';
import { captureEvent } from '$lib/services/posthog';
import { AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT } from '$lib/services/posthog-capture-receipt';

// One request per turn: admission resolves the transport decision inline and
// creates a first turn's session, so there is no separate lease endpoint.
const WORKER_TURNS_ENDPOINT = '/api/agent/v2/turns';

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
	voiceNoteGroupId: string | null;
	preparedPromptKey: string | null;
	reviewIntent?: 'project_review' | 'document_organization' | null;
	publishedSpecialist?: PublishedSpecialistReference | null;
	/** Skill a chat launch named; sent on that launch's first turn only. */
	requestedSkillId?: string | null;
};

/** One admission attempt that has not answered by now counts as lost. */
export const WORKER_ADMISSION_TIMEOUT_MS = 30_000;
/** Pause before the single re-POST of a lost admission. */
export const WORKER_ADMISSION_RETRY_DELAY_MS = 750;
const WORKER_ADMISSION_MAX_ATTEMPTS = 2;
/** 5xx code meaning "unknown whether the turn committed": safe to re-POST the same body. */
const WORKER_ADMISSION_UNKNOWN_OUTCOME_CODE = 'WORKER_ADMISSION_UNAVAILABLE';

export class AgenticChatAdmissionTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`Worker admission did not answer within ${timeoutMs}ms`);
		this.name = 'AgenticChatAdmissionTimeoutError';
	}
}

/**
 * Admit one turn. A lost answer (network error, timeout, or an
 * unknown-outcome 5xx) is re-POSTed once with the identical body: admission is
 * idempotent on `clientTurnId`, so a first attempt that did land comes back as
 * `matching_duplicate` with the same handle. Aborting `signal` (the user left
 * the conversation) cancels the request and any retry.
 */
export async function requestAgenticChatWorkerAdmission(input: {
	command: AgenticChatWorkerCommand;
	fetchImpl?: typeof fetch;
	nowMs?: () => number;
	signal?: AbortSignal;
	timeoutMs?: number;
	retryDelayMs?: number;
}): Promise<{ response: Response; payload: unknown | null }> {
	const nowMs = input.nowMs ?? (() => performance.now());
	const fetchImpl = input.fetchImpl ?? fetch;
	const timeoutMs = input.timeoutMs ?? WORKER_ADMISSION_TIMEOUT_MS;
	const retryDelayMs = input.retryDelayMs ?? WORKER_ADMISSION_RETRY_DELAY_MS;
	// Serialized once so a retry is byte-identical to the first attempt.
	const body = JSON.stringify(buildWorkerAdmissionBody(input.command));

	for (let attempt = 1; ; attempt += 1) {
		throwIfAborted(input.signal);
		const canRetry = attempt < WORKER_ADMISSION_MAX_ATTEMPTS;
		const requestStartedAt = nowMs();
		let response: Response;
		try {
			response = await postWorkerAdmission({
				fetchImpl,
				body,
				signal: input.signal,
				timeoutMs
			});
		} catch (error) {
			if (input.signal?.aborted || !canRetry) throw error;
			await waitForRetry(retryDelayMs, input.signal);
			continue;
		}
		captureWorkerAdmissionTiming({
			command: input.command,
			response,
			attempt,
			clientRoundTripMs: Math.max(0, nowMs() - requestStartedAt)
		});
		if (canRetry && (await isUnknownAdmissionOutcome(response))) {
			await waitForRetry(retryDelayMs, input.signal);
			continue;
		}
		if (!response.ok) return { response, payload: null };
		return { response, payload: await response.json() };
	}
}

async function postWorkerAdmission(input: {
	fetchImpl: typeof fetch;
	body: string;
	signal: AbortSignal | undefined;
	timeoutMs: number;
}): Promise<Response> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let onAbort: (() => void) | null = null;
	// Raced as well as aborted, so a fetch that ignores abort cannot hang the send.
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			reject(new AgenticChatAdmissionTimeoutError(input.timeoutMs));
			controller.abort();
		}, input.timeoutMs);
	});
	const cancelled = new Promise<never>((_resolve, reject) => {
		onAbort = () => {
			controller.abort();
			reject(createAbortError());
		};
		if (input.signal?.aborted) onAbort();
		else input.signal?.addEventListener('abort', onAbort, { once: true });
	});
	try {
		return await Promise.race([
			input.fetchImpl(WORKER_TURNS_ENDPOINT, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				credentials: 'same-origin',
				cache: 'no-store',
				body: input.body,
				signal: controller.signal
			}),
			deadline,
			cancelled
		]);
	} finally {
		if (timer !== null) clearTimeout(timer);
		if (onAbort) input.signal?.removeEventListener('abort', onAbort);
	}
}

/**
 * True when the server could not say whether the turn committed: its
 * unknown-outcome code, or a bare gateway 502/503/504 with no code at all.
 * Every other answer, including each known not-admitted code, is final.
 */
async function isUnknownAdmissionOutcome(response: Response): Promise<boolean> {
	if (response.status < 500) return false;
	const code = await readErrorCode(response);
	if (code !== null) return code === WORKER_ADMISSION_UNKNOWN_OUTCOME_CODE;
	return response.status === 502 || response.status === 503 || response.status === 504;
}

async function readErrorCode(response: Response): Promise<string | null> {
	try {
		// A clone, so the caller can still read the error body.
		const body: unknown = await response.clone().json();
		return isRecord(body) && typeof body.code === 'string' ? body.code : null;
	} catch {
		return null;
	}
}

function waitForRetry(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(createAbortError());
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, delayMs);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw createAbortError();
}

function createAbortError(): Error {
	if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
	const error = new Error('Aborted');
	error.name = 'AbortError';
	return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function captureWorkerAdmissionTiming(input: {
	command: AgenticChatWorkerCommand;
	response: Response;
	attempt: number;
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
			admission_attempt: input.attempt,
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
		voiceNoteGroupId: command.voiceNoteGroupId,
		preparedPromptKey: command.preparedPromptKey,
		...(command.requestedSkillId ? { requestedSkillId: command.requestedSkillId } : {}),
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
