// apps/web/src/lib/services/agentic-chat-v2/session-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatContextType,
	ChatMessage,
	ChatAttachmentRef,
	ChatSession,
	ChatSessionInsert,
	Database,
	Json
} from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import type { FastChatHistoryMessage } from './types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	buildAttachmentContextBlock,
	createChatAttachmentRefFromAsset,
	type ChatAttachmentAssetRow
} from './attachments';
import type { ChatHistorySnapshot } from './turn-admission';
import '$lib/services/agentic-chat/tools/registry/install-loop-catalog';
import { CONTROL_TOOL_NAMES, isLikelyWriteToolName } from '@buildos/agentic-chat-runtime/loop';
import { renderFailedCleanupContinuation } from '@buildos/agentic-chat-runtime/context';
import {
	CHAT_CONTINUITY_EXECUTION_FILTER,
	isSharedDocumentEditCardRow,
	sharedDocumentEditCardNotes
} from './shared-document-edit-card-history';
import { isProposalCardRow, proposalCardNotes } from './proposal-card-history';

const logger = createLogger('FastChatSession');

type ResolveSessionParams = {
	sessionId?: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string;
	projectFocus?: ProjectFocus | null;
};

type FastChatSessionServiceOptions = {
	errorLogger?: ErrorLoggerService;
	endpoint?: string;
	httpMethod?: string;
};

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!metadata) return undefined;
	const sanitized = sanitizeLogData(metadata);
	if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
		return sanitized as Record<string, unknown>;
	}
	return { value: sanitized };
}

type RecentChatMessageRow = Pick<
	ChatMessage,
	'id' | 'role' | 'content' | 'metadata' | 'created_at'
>;

type ChatMessageAttachmentRow = {
	message_id: string;
	asset_id: string | null;
	project_id: string | null;
	attachment_kind: string;
	media_type: string;
	role: string | null;
	display_order: number | null;
	metadata: Record<string, unknown> | null;
	asset: ChatAttachmentAssetRow | ChatAttachmentAssetRow[] | null;
};

export type InterruptedToolExecutionSummaryRow = {
	message_id: string | null;
	provider_tool_call_id?: string | null;
	tool_name: string;
	gateway_op: string | null;
	sequence_index: number | null;
	success: boolean;
	error_message: string | null;
	arguments: Json;
	result: Json | null;
};

export type LoadedSkillExecutionSummaryRow = InterruptedToolExecutionSummaryRow;

type PendingClarificationCandidate = {
	id?: string;
	label: string;
	kind?: string;
};

type PendingClarificationSummary = {
	reason: string | null;
	question: string;
	candidates: PendingClarificationCandidate[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isInterruptedAssistantMessage(message: RecentChatMessageRow): boolean {
	if (message.role !== 'assistant' || !isRecord(message.metadata)) return false;
	const metadata = message.metadata;
	return (
		metadata.interrupted === true ||
		metadata.finished_reason === 'cancelled' ||
		typeof metadata.interrupted_reason === 'string'
	);
}

function previewText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stringifyPreview(value: unknown, maxLength: number): string | null {
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return previewText(text, maxLength);
}

function boundedStoredText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, maxLength) : null;
}

export const PENDING_CLARIFICATION_LEDGER_PREFIX =
	'Pending clarification from the immediately prior assistant turn:';

function extractPendingClarificationCandidate(
	value: unknown
): PendingClarificationCandidate | null {
	if (!isRecord(value)) return null;
	const label = boundedStoredText(value.label, 200);
	if (!label) return null;
	const id = boundedStoredText(value.id, 160);
	const kind = boundedStoredText(value.kind, 40);
	return {
		...(id ? { id } : {}),
		label,
		...(kind ? { kind } : {})
	};
}

function extractPendingClarificationSummary(
	row: LoadedSkillExecutionSummaryRow
): PendingClarificationSummary | null {
	if (
		!row.success ||
		row.tool_name !== 'request_turn_clarification' ||
		!isRecord(row.result) ||
		row.result.status !== 'clarification_required'
	) {
		return null;
	}
	const question = boundedStoredText(row.result.question, 500);
	if (!question) return null;
	const reason = boundedStoredText(row.result.reason, 240);
	const rawCandidates = row.result.candidates;
	const candidates = Array.isArray(rawCandidates)
		? rawCandidates
				.slice(0, 20)
				.map(extractPendingClarificationCandidate)
				.filter((candidate): candidate is PendingClarificationCandidate =>
					Boolean(candidate)
				)
		: [];
	return { reason, question, candidates };
}

/**
 * Rehydrates the one clarification that is still pending. Restricting this to
 * the latest assistant message prevents an answered choice from leaking into
 * later turns while preserving exact candidate IDs across the immediate reply.
 */
export function buildPendingClarificationHistorySummary(params: {
	executions: LoadedSkillExecutionSummaryRow[];
	pendingAssistantMessageId: string | null;
}): string | null {
	if (!params.pendingAssistantMessageId) return null;
	const pending = params.executions
		.filter((row) => row.message_id === params.pendingAssistantMessageId)
		.slice()
		.sort((left, right) => (right.sequence_index ?? 0) - (left.sequence_index ?? 0))
		.map(extractPendingClarificationSummary)
		.find((summary): summary is PendingClarificationSummary => Boolean(summary));
	if (!pending) return null;

	const lines = [
		PENDING_CLARIFICATION_LEDGER_PREFIX,
		'This is durable control state. Resolve the current user reply against it without searching solely to rediscover these choices.',
		...(pending.reason ? [`Unresolved choice: ${pending.reason}`] : []),
		`Question: ${pending.question}`
	];
	if (pending.candidates.length > 0) {
		lines.push(
			'Candidates (preserve these exact IDs and labels):',
			...pending.candidates.map((candidate) => `- ${JSON.stringify(candidate)}`)
		);
	}
	return lines.join('\n');
}

function normalizeAttachmentAsset(
	value: ChatMessageAttachmentRow['asset']
): ChatAttachmentAssetRow | null {
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

function summarizeStructuredData(value: unknown): string | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const summaries = value.slice(0, 6).map((item) => {
		if (!isRecord(item)) return null;
		const type = Array.isArray(item.type)
			? item.type.join('/')
			: typeof item.type === 'string'
				? item.type
				: undefined;
		const name = typeof item.name === 'string' ? item.name : undefined;
		const startDate = typeof item.startDate === 'string' ? item.startDate : undefined;
		const status = typeof item.eventStatus === 'string' ? item.eventStatus : undefined;
		const offers = Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [];
		const availability = offers
			.map((offer) =>
				isRecord(offer) && typeof offer.availability === 'string'
					? offer.availability
					: null
			)
			.find(Boolean);
		const parts = [type, name, startDate, status, availability].filter(Boolean);
		return parts.length > 0 ? parts.join(' | ') : null;
	});
	const compact = summaries.filter((item): item is string => Boolean(item));
	return compact.length > 0 ? compact.join('; ') : null;
}

function summarizeWebVisitResult(result: Record<string, unknown>): string {
	const title = previewText(result.title, 160);
	const finalUrl = previewText(result.final_url ?? result.url, 220);
	const statusCode = typeof result.status_code === 'number' ? result.status_code : undefined;
	const structured = summarizeStructuredData(result.structured_data);
	const content = previewText(result.content, 900) ?? previewText(result.excerpt, 500);
	const parts = [
		title ? `title="${title}"` : null,
		finalUrl ? `url=${finalUrl}` : null,
		statusCode ? `status=${statusCode}` : null,
		structured ? `structured_data=${structured}` : null,
		content ? `content="${content}"` : null
	].filter(Boolean);
	return parts.join('; ');
}

function summarizeWebSearchResult(result: Record<string, unknown>): string {
	const query = previewText(result.query, 180);
	const results = Array.isArray(result.results) ? result.results : [];
	const resultTitles = results
		.slice(0, 5)
		.map((entry) =>
			isRecord(entry)
				? previewText(entry.title ?? entry.url ?? entry.content, 180)
				: previewText(entry, 180)
		)
		.filter((entry): entry is string => Boolean(entry));
	const parts = [query ? `query="${query}"` : null];
	if (resultTitles.length > 0) {
		parts.push(`results=${resultTitles.join(' | ')}`);
	}
	return parts.filter(Boolean).join('; ');
}

function summarizeInterruptedToolResult(row: InterruptedToolExecutionSummaryRow): string | null {
	if (!row.success || !row.result) return null;
	const op = row.gateway_op ?? row.tool_name;
	if (isRecord(row.result)) {
		if (row.tool_name === 'web_visit' || op === 'util.web.visit') {
			return summarizeWebVisitResult(row.result);
		}
		if (row.tool_name === 'web_search' || op === 'util.web.search') {
			return summarizeWebSearchResult(row.result);
		}
		const message = previewText(row.result.message, 280);
		if (message) return message;
	}
	return stringifyPreview(row.result, 700);
}

const INTERRUPTED_WRITE_VERBS: Record<string, string> = {
	create: 'created',
	update: 'updated',
	move: 'moved',
	delete: 'deleted'
};

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

/**
 * One line per committed write of an interrupted turn: the next turn must know
 * which records already exist, or it recreates them
 * (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F118).
 */
function summarizeInterruptedWrite(row: InterruptedToolExecutionSummaryRow): string {
	const match = row.tool_name.trim().match(/^(create|update|move|delete)_(?:onto_)?([a-z_]+)$/);
	const verb = match ? INTERRUPTED_WRITE_VERBS[match[1]!] : (row.gateway_op ?? row.tool_name);
	const kind = match ? match[2]!.replace(/_/g, ' ') : null;
	const result = isRecord(row.result) ? row.result : {};
	const args = isRecord(row.arguments) ? row.arguments : {};
	const task = isRecord(result.task) ? result.task : {};
	const document = isRecord(result.document) ? result.document : {};
	const title = firstString(
		result.title,
		result.name,
		task.title,
		document.title,
		args.title,
		args.name
	);
	const id = firstString(result.id, task.id, document.id, result.entity_id);
	const parts = [verb, kind, title ? `"${title}"` : null, id ? `(${id})` : null].filter(
		(part): part is string => Boolean(part)
	);
	return previewText(`- ${parts.join(' ')}`, 100) ?? `- ${verb}`;
}

export function buildInterruptedToolHistorySummary(
	executions: InterruptedToolExecutionSummaryRow[]
): string | null {
	if (!Array.isArray(executions) || executions.length === 0) return null;
	const sorted = executions
		.slice()
		.sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0))
		.filter(
			(row) =>
				!CONTROL_TOOL_NAMES.has(row.tool_name.trim().toLowerCase()) &&
				!isSharedDocumentEditCardRow(row) &&
				!isProposalCardRow(row)
		);
	const writes = sorted.filter(
		(row) => row.success && isLikelyWriteToolName(row.tool_name, row.gateway_op)
	);
	const reads = sorted.filter((row) => !writes.includes(row));
	const writeLines = writes.map(summarizeInterruptedWrite);
	const completed = reads
		.map((row) => {
			const summary = summarizeInterruptedToolResult(row);
			if (!summary) return null;
			const op = row.gateway_op ?? row.tool_name;
			return `- ${op}: ${summary}`;
		})
		.filter((line): line is string => Boolean(line))
		.slice(0, 6);
	const failures = reads
		.filter((row) => !row.success && row.error_message)
		.map((row) => {
			const op = row.gateway_op ?? row.tool_name;
			const error = previewText(row.error_message, 140);
			return error ? `${op}: ${error}` : null;
		})
		.filter((line): line is string => Boolean(line))
		.slice(0, 4);

	if (writeLines.length === 0 && completed.length === 0 && failures.length === 0) return null;

	const tail = [
		...completed,
		...(failures.length > 0 ? [`Interrupted or failed calls: ${failures.join('; ')}`] : [])
	];
	const boundedTail = tail.length > 0 ? previewText(tail.join('\n'), 3000) : null;
	return [
		'Previous interrupted assistant turn tool results:',
		...writeLines,
		...(boundedTail ? [boundedTail] : [])
	].join('\n');
}

/**
 * Pure projection shared by the query path and the atomic-admission snapshot
 * path. Admission returns raw bounded rows captured before the current message;
 * this function reproduces the model-facing history shape.
 */
export function projectChatHistorySnapshot(
	snapshot: ChatHistorySnapshot
): FastChatHistoryMessage[] {
	return projectHistorySnapshotWithLineage(snapshot).map(
		({ sourceMessageId: _sourceMessageId, ...message }) => message
	);
}

export type FastChatHistoryMessageWithLineage = FastChatHistoryMessage & {
	sourceMessageId: string | null;
};

/**
 * Worker admission uses the same model-facing projection as the query path
 * while retaining exact database lineage for messages that actually came from
 * the bounded admission window. Synthetic continuity/tool-ledger messages
 * carry null lineage.
 */
export function projectWorkerFrozenHistorySnapshot(
	snapshot: ChatHistorySnapshot
): FastChatHistoryMessageWithLineage[] {
	return projectHistorySnapshotWithLineage(snapshot);
}

function projectHistorySnapshotWithLineage(
	snapshot: ChatHistorySnapshot
): FastChatHistoryMessageWithLineage[] {
	const allowedRoles = new Set(['user', 'assistant', 'system']);
	const orderedMessages = snapshot.messages.filter((message) => allowedRoles.has(message.role));
	const messageOrderById = new Map(orderedMessages.map((message, index) => [message.id, index]));
	const attachmentsByMessageId = new Map<string, ChatAttachmentRef[]>();

	for (const rawRow of snapshot.attachments) {
		const row = rawRow as unknown as ChatMessageAttachmentRow;
		if (!row.message_id || row.media_type !== 'image') continue;
		const existing = attachmentsByMessageId.get(row.message_id) ?? [];
		if (row.attachment_kind === 'temporary_file') {
			const metadata = row.metadata ?? {};
			const temporaryAttachmentId =
				typeof metadata.temporary_attachment_id === 'string'
					? metadata.temporary_attachment_id
					: null;
			if (!temporaryAttachmentId) continue;
			existing.push({
				attachment_kind: 'temporary_file',
				media_type: 'image',
				temporary_attachment_id: temporaryAttachmentId,
				project_id: null,
				file_name: typeof metadata.file_name === 'string' ? metadata.file_name : null,
				content_type:
					typeof metadata.content_type === 'string' ? metadata.content_type : null,
				file_size_bytes:
					typeof metadata.file_size_bytes === 'number' ? metadata.file_size_bytes : null,
				width: typeof metadata.width === 'number' ? metadata.width : null,
				height: typeof metadata.height === 'number' ? metadata.height : null,
				checksum_sha256:
					typeof metadata.checksum_sha256 === 'string' ? metadata.checksum_sha256 : null,
				ocr_status: 'skipped',
				role: row.role === 'analysis_target' ? 'analysis_target' : 'attachment',
				display_order: row.display_order ?? existing.length,
				expires_at: typeof metadata.expires_at === 'string' ? metadata.expires_at : null,
				metadata: null
			});
			attachmentsByMessageId.set(row.message_id, existing);
			continue;
		}
		if (row.attachment_kind !== 'onto_asset') continue;
		const asset = normalizeAttachmentAsset(row.asset);
		if (!asset) continue;
		existing.push(
			createChatAttachmentRefFromAsset(
				asset,
				{
					role: row.role === 'analysis_target' ? 'analysis_target' : 'attachment',
					display_order: row.display_order ?? existing.length,
					metadata: row.metadata ?? null
				},
				{ maxExtractedTextChars: 1600 }
			)
		);
		attachmentsByMessageId.set(row.message_id, existing);
	}

	const executionsByMessageId = new Map<string, InterruptedToolExecutionSummaryRow[]>();
	for (const row of snapshot.interrupted_tool_executions) {
		if (!row.message_id) continue;
		const existing = executionsByMessageId.get(row.message_id) ?? [];
		existing.push(row);
		executionsByMessageId.set(row.message_id, existing);
	}

	// Every consumer of this projection feeds the worker lane, which cannot
	// call skill_load, so the loaded-skills ledger is not appended: it told the
	// model about a tool it does not have and its dedupe removed the playbook
	// from every following write turn (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08
	// F69). The continuity rows still carry the pending clarification.
	const orderedContinuityExecutionRows = snapshot.loaded_skill_executions.slice().sort((a, b) => {
		const aMessageOrder = messageOrderById.get(a.message_id ?? '') ?? Number.MAX_SAFE_INTEGER;
		const bMessageOrder = messageOrderById.get(b.message_id ?? '') ?? Number.MAX_SAFE_INTEGER;
		if (aMessageOrder !== bMessageOrder) return aMessageOrder - bMessageOrder;
		return (a.sequence_index ?? 0) - (b.sequence_index ?? 0);
	});
	const latestMessage = orderedMessages.at(-1);
	const pendingClarificationHistorySummary = buildPendingClarificationHistorySummary({
		executions: orderedContinuityExecutionRows,
		pendingAssistantMessageId: latestMessage?.role === 'assistant' ? latestMessage.id : null
	});
	// Each confirm card's state (the user resolves it between turns) follows the
	// reply that showed it.
	const cardNotes = sharedDocumentEditCardNotes(orderedContinuityExecutionRows);
	// Proposal cards (nest, combine) are decided the same way, between turns.
	const proposalNotes = proposalCardNotes(orderedContinuityExecutionRows);

	const historyMessages = orderedMessages.flatMap((message) => {
		const msg = message as RecentChatMessageRow;
		const attachments = attachmentsByMessageId.get(msg.id) ?? [];
		const attachmentContext = buildAttachmentContextBlock(attachments, { maxChars: 5000 });
		const projected: FastChatHistoryMessageWithLineage[] = [
			{
				role: msg.role as FastChatHistoryMessage['role'],
				content: attachmentContext ? `${msg.content}\n\n${attachmentContext}` : msg.content,
				attachments: attachments.length > 0 ? attachments : undefined,
				sourceMessageId: msg.id
			},
			...(msg.role === 'assistant'
				? [...(cardNotes.get(msg.id) ?? []), ...(proposalNotes.get(msg.id) ?? [])]
				: [])
		];
		if (isInterruptedAssistantMessage(msg)) {
			const summary = buildInterruptedToolHistorySummary(
				executionsByMessageId.get(msg.id) ?? []
			);
			if (summary) {
				projected.push({ role: 'system', content: summary, sourceMessageId: null });
			}
		}
		return projected;
	});

	const latestAssistant = orderedMessages.findLast((message) => message.role === 'assistant');
	const failedCleanupRecall = renderFailedCleanupContinuation(latestAssistant?.metadata);
	if (failedCleanupRecall) {
		historyMessages.push({
			role: 'system',
			content: failedCleanupRecall,
			continuityKind: 'failed_cleanup_v1',
			sourceMessageId: null
		});
	}

	if (pendingClarificationHistorySummary) {
		historyMessages.push({
			role: 'system',
			content: pendingClarificationHistorySummary,
			sourceMessageId: null
		});
	}
	return historyMessages;
}

export function createFastChatSessionService(
	supabase: SupabaseClient<Database>,
	options: FastChatSessionServiceOptions = {}
) {
	const errorLogger = options.errorLogger;
	const endpoint = options.endpoint ?? '/api/agent/v2/stream';
	const httpMethod = options.httpMethod ?? 'POST';

	function logFastChatSessionError(params: {
		error: unknown;
		operationType: string;
		userId?: string;
		projectId?: string;
		tableName?: string;
		recordId?: string;
		metadata?: Record<string, unknown>;
	}): void {
		if (!errorLogger) return;
		void errorLogger.logError(params.error, {
			userId: params.userId,
			projectId: params.projectId,
			endpoint,
			httpMethod,
			operationType: params.operationType,
			tableName: params.tableName,
			recordId: params.recordId,
			metadata: sanitizeMetadata(params.metadata)
		});
	}

	async function resolveSession(params: ResolveSessionParams): Promise<{
		session: ChatSession;
		created: boolean;
		/** The stored session's scope differs from the request; it was left as is. */
		scopeMismatch?: true;
	}> {
		const { sessionId, userId, contextType, entityId, projectFocus } = params;
		let session: ChatSession | null = null;

		if (sessionId) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('user_id', userId)
				.maybeSingle();

			if (error) {
				logger.warn('Failed to load chat session', { error, sessionId, userId });
				logFastChatSessionError({
					error,
					operationType: 'fastchat_session_load',
					userId,
					projectId: projectFocus?.projectId ?? undefined,
					tableName: 'chat_sessions',
					recordId: sessionId,
					metadata: {
						sessionId,
						contextType,
						entityId
					}
				});
			} else if (data) {
				session = data;
			}
		}

		if (session) {
			// Scope (context_type / entity_id) is never rewritten here. Admission
			// treats the row as the source of truth and a worker context shift is
			// the only thing that moves it; a stale tab that rewrote it on prewarm
			// could undo a project handoff another device just made, and the
			// other device's next send then failed with WORKER_SESSION_CONFLICT
			// (agentic chat teardown 2026-10-18). On a mismatch the caller gets
			// the row back unchanged so the browser can adopt its scope.
			const scopeMismatch =
				session.context_type !== contextType ||
				(session.entity_id ?? null) !== (entityId ?? null);
			if (scopeMismatch) {
				return { session, created: false, scopeMismatch: true };
			}

			// Only merge `focus` when it actually changed. This path fires on nearly
			// every project-context prewarm; writing the whole agent_metadata column
			// here (as it did previously) clobbers cancel hints or other keys merged
			// concurrently by the stream/cancel writers.
			const currentFocus = ((session.agent_metadata ?? {}) as Record<string, unknown>).focus;
			const focusChanged =
				!!projectFocus && JSON.stringify(currentFocus) !== JSON.stringify(projectFocus);

			if (focusChanged) {
				const { data, error } = await supabase.rpc('merge_chat_session_agent_metadata', {
					p_session_id: session.id,
					p_patch: { focus: projectFocus } as unknown as Json
				});

				if (error) {
					logger.warn('Failed to merge chat session focus', { error, sessionId });
					logFastChatSessionError({
						error,
						operationType: 'fastchat_session_update_context',
						userId,
						projectId: projectFocus?.projectId ?? undefined,
						tableName: 'chat_sessions',
						recordId: session.id,
						metadata: {
							sessionId: session.id,
							contextType,
							entityId,
							stage: 'focus_merge_rpc'
						}
					});
				} else if (data) {
					session = {
						...session,
						agent_metadata: data as ChatSession['agent_metadata']
					};
				}
			}

			return { session, created: false };
		}

		// Canonical brief session key: one active session per (user, daily_brief_id).
		if (contextType === 'daily_brief' && entityId) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('user_id', userId)
				.eq('context_type', contextType)
				.eq('entity_id', entityId)
				.eq('status', 'active')
				.order('updated_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (error) {
				logger.warn('Failed to resolve canonical daily brief session', {
					error,
					userId,
					entityId
				});
				logFastChatSessionError({
					error,
					operationType: 'fastchat_daily_brief_session_lookup',
					userId,
					tableName: 'chat_sessions',
					metadata: {
						contextType,
						entityId
					}
				});
			} else if (data) {
				return { session: data, created: false };
			}
		}

		const insert: ChatSessionInsert = {
			user_id: userId,
			context_type: contextType,
			entity_id: entityId ?? null,
			status: 'active',
			agent_metadata: projectFocus
				? ({ focus: projectFocus } as unknown as ChatSessionInsert['agent_metadata'])
				: undefined
		};

		const { data, error } = await supabase
			.from('chat_sessions')
			.insert(insert)
			.select('*')
			.single();
		let sessionCreateError = error;

		// The worker-admission migration makes the active daily-brief key unique.
		// If a concurrent worker/legacy request inserted the canonical row after
		// the lookup above, adopt that committed winner instead of surfacing the
		// expected 23505 race or attempting to create another session.
		if (error?.code === '23505' && contextType === 'daily_brief' && entityId) {
			const { data: canonicalSession, error: canonicalError } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('user_id', userId)
				.eq('context_type', contextType)
				.eq('entity_id', entityId)
				.eq('status', 'active')
				.maybeSingle();

			if (!canonicalError && canonicalSession) {
				return { session: canonicalSession, created: false };
			}
			if (canonicalError) {
				sessionCreateError = canonicalError;
			}
		}

		if (sessionCreateError || !data) {
			logger.error('Failed to create chat session', {
				error: sessionCreateError,
				insertError: error,
				userId
			});
			logFastChatSessionError({
				error: sessionCreateError ?? new Error('No session returned from insert'),
				operationType: 'fastchat_session_create',
				userId,
				projectId: projectFocus?.projectId ?? undefined,
				tableName: 'chat_sessions',
				metadata: {
					contextType,
					entityId,
					hasProjectFocus: Boolean(projectFocus),
					insertErrorCode: error?.code ?? null
				}
			});
			throw new Error(
				`Failed to create chat session: ${sessionCreateError?.message ?? 'unknown error'}`
			);
		}

		return { session: data, created: true };
	}

	async function loadRecentMessages(
		sessionId: string,
		limit = 10
	): Promise<FastChatHistoryMessage[]> {
		const { data, error } = await supabase
			.from('chat_messages')
			.select('id, role, content, metadata, created_at')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error || !data) {
			logger.warn('Failed to load chat history', { error, sessionId });
			logFastChatSessionError({
				error: error ?? new Error('No chat history rows returned'),
				operationType: 'fastchat_history_load',
				tableName: 'chat_messages',
				recordId: sessionId,
				metadata: {
					sessionId,
					limit
				}
			});
			return [];
		}

		const allowedRoles = new Set(['user', 'assistant', 'system']);
		const orderedMessages = data
			.slice()
			.reverse()
			.filter((msg): msg is RecentChatMessageRow => allowedRoles.has(msg.role));
		const messageIds = orderedMessages
			.map((msg) => msg.id)
			.filter((id): id is string => Boolean(id));
		let fallbackAttachmentRows: ChatMessageAttachmentRow[] = [];
		if (messageIds.length > 0) {
			const { data: attachmentRows, error: attachmentError } = await (supabase as any)
				.from('chat_message_attachments')
				.select(
					'message_id, asset_id, project_id, attachment_kind, media_type, role, display_order, metadata, asset:onto_assets(id, project_id, storage_bucket, storage_path, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, ocr_status, extraction_summary, extracted_text)'
				)
				.in('message_id', messageIds)
				.eq('session_id', sessionId)
				.order('display_order', { ascending: true })
				.limit(limit * 8);

			if (attachmentError) {
				logger.warn('Failed to load chat message attachments', {
					error: attachmentError,
					sessionId
				});
				logFastChatSessionError({
					error: attachmentError,
					operationType: 'fastchat_message_attachments_load',
					tableName: 'chat_message_attachments',
					recordId: sessionId,
					metadata: {
						sessionId,
						messageCount: messageIds.length
					}
				});
			} else {
				fallbackAttachmentRows = (attachmentRows ?? []) as ChatMessageAttachmentRow[];
			}
		}
		const interruptedMessageIds = orderedMessages
			.filter(isInterruptedAssistantMessage)
			.map((msg) => msg.id)
			.filter((id): id is string => Boolean(id));
		let interruptedExecutionRows: InterruptedToolExecutionSummaryRow[] = [];

		if (interruptedMessageIds.length > 0) {
			const { data: executionRows, error: executionError } = await supabase
				.from('chat_tool_executions')
				.select(
					'message_id, provider_tool_call_id, tool_name, gateway_op, sequence_index, success, error_message, arguments, result'
				)
				.in('message_id', interruptedMessageIds)
				.order('sequence_index', { ascending: true });

			if (executionError) {
				logger.warn('Failed to load interrupted chat tool history', {
					error: executionError,
					sessionId
				});
				logFastChatSessionError({
					error: executionError,
					operationType: 'fastchat_interrupted_tool_history_load',
					tableName: 'chat_tool_executions',
					recordId: sessionId,
					metadata: {
						sessionId,
						messageIds: interruptedMessageIds,
						limit
					}
				});
			} else {
				interruptedExecutionRows = (executionRows ??
					[]) as InterruptedToolExecutionSummaryRow[];
			}
		}

		let continuityExecutionRows: LoadedSkillExecutionSummaryRow[] = [];
		const assistantMessageIds = orderedMessages
			.filter((msg) => msg.role === 'assistant')
			.map((msg) => msg.id)
			.filter((id): id is string => Boolean(id));
		if (assistantMessageIds.length > 0) {
			const { data: continuityRows, error: continuityError } = await supabase
				.from('chat_tool_executions')
				.select(
					'message_id, provider_tool_call_id, tool_name, gateway_op, sequence_index, success, error_message, arguments, result'
				)
				.in('message_id', assistantMessageIds)
				.or(CHAT_CONTINUITY_EXECUTION_FILTER)
				.eq('success', true)
				.order('sequence_index', { ascending: true })
				.limit(limit * 6);

			if (continuityError) {
				logger.warn('Failed to load completed continuity tool history', {
					error: continuityError,
					sessionId
				});
				logFastChatSessionError({
					error: continuityError,
					operationType: 'fastchat_continuity_tool_history_load',
					tableName: 'chat_tool_executions',
					recordId: sessionId,
					metadata: {
						sessionId,
						messageCount: assistantMessageIds.length,
						limit
					}
				});
			} else {
				continuityExecutionRows = (continuityRows ??
					[]) as LoadedSkillExecutionSummaryRow[];
			}
		}

		return projectChatHistorySnapshot({
			messages: orderedMessages,
			attachments: fallbackAttachmentRows as ChatHistorySnapshot['attachments'],
			interrupted_tool_executions: interruptedExecutionRows,
			loaded_skill_executions: continuityExecutionRows
		});
	}

	return {
		resolveSession,
		loadRecentMessages
	};
}
