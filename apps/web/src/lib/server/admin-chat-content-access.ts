// apps/web/src/lib/server/admin-chat-content-access.ts
//
// Admin views of users' chat content. Rows are passed through the same storage
// projection the worker applies (tool-storage-projection.ts), so rows written
// before it cannot show Gmail, Google Calendar, or web page content, and every
// read or export of another user's chat is recorded as a security event with
// ids and row counts only.
import {
	isAgenticChatPassThroughToolNameV1,
	isAgenticChatToolResultContentRedactedV1,
	projectAgenticChatToolProgressForStorageV1,
	projectAgenticChatToolResultForStorageV1,
	redactionNoticeForAgenticChatToolV1
} from '@buildos/agentic-chat-runtime/tools';
import {
	getSecurityRequestContext,
	logSecurityEventBlocking
} from '$lib/server/security-event-logger';

type ToolExecutionRow = { tool_name?: string | null; result?: unknown };
type TurnEventRow = { event_type?: string | null; payload?: unknown };
type ChatMessageRow = {
	role?: string | null;
	tool_name?: string | null;
	tool_result?: unknown;
	content?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function projectAdminToolExecutionRows<T extends ToolExecutionRow>(rows: T[]): T[] {
	return rows.map((row) => {
		const result = projectAgenticChatToolResultForStorageV1(row.tool_name, row.result);
		return result === row.result ? row : { ...row, result };
	});
}

/** A tool_result or tool_progress payload as storage now keeps it. */
export function projectAdminTurnEventPayload(eventType: unknown, payload: unknown): unknown {
	if (!isRecord(payload)) return payload;
	if (eventType === 'tool_result' && isRecord(payload.result)) {
		const inner = payload.result;
		const result = projectAgenticChatToolResultForStorageV1(inner.tool_name, inner.result);
		return result === inner.result ? payload : { ...payload, result: { ...inner, result } };
	}
	if (eventType === 'tool_progress') {
		const progress = {
			message: typeof payload.message === 'string' ? payload.message : '',
			data: isRecord(payload.data) ? payload.data : {}
		};
		const stored = projectAgenticChatToolProgressForStorageV1(payload.tool_name, progress);
		if (stored === progress) return payload;
		return { ...payload, message: stored.message, data: stored.data };
	}
	return payload;
}

export function projectAdminTurnEventRows<T extends TurnEventRow>(rows: T[]): T[] {
	return rows.map((row) => {
		const payload = projectAdminTurnEventPayload(row.event_type, row.payload);
		return payload === row.payload ? row : { ...row, payload };
	});
}

/** Legacy web-lane `role='tool'` messages held the tool's summary as content. */
export function projectAdminChatMessageRows<T extends ChatMessageRow>(rows: T[]): T[] {
	return rows.map((row) => {
		if (row.role !== 'tool' || !isAgenticChatPassThroughToolNameV1(row.tool_name)) return row;
		return {
			...row,
			content: redactionNoticeForAgenticChatToolV1(row.tool_name),
			...('tool_result' in row
				? {
						tool_result: projectAgenticChatToolResultForStorageV1(
							row.tool_name,
							row.tool_result
						)
					}
				: {})
		};
	});
}

/**
 * Fails closed, like assertAdminChatUserAnalyticsRedacted: an admin payload
 * must never carry a pass-through tool result that is not a stored trace.
 */
export function assertAdminChatPassThroughContentProjected(input: {
	toolExecutions?: ToolExecutionRow[];
	turnEvents?: TurnEventRow[];
}): void {
	const leaks = (toolName: unknown, result: unknown) =>
		isAgenticChatPassThroughToolNameV1(toolName) &&
		result !== null &&
		result !== undefined &&
		!isAgenticChatToolResultContentRedactedV1(result) &&
		projectAgenticChatToolResultForStorageV1(toolName, result) !== result;
	for (const row of input.toolExecutions ?? []) {
		if (leaks(row.tool_name, row.result)) {
			throw new Error(`Admin chat payload contains unprojected ${row.tool_name} result`);
		}
	}
	for (const row of input.turnEvents ?? []) {
		if (row.event_type !== 'tool_result' || !isRecord(row.payload)) continue;
		const inner = isRecord(row.payload.result) ? row.payload.result : null;
		if (inner && leaks(inner.tool_name, inner.result)) {
			throw new Error(`Admin chat payload contains unprojected ${inner.tool_name} event`);
		}
	}
}

export type AdminChatContentAccessInput = {
	adminUserId: string;
	action: 'read' | 'export';
	route: string;
	targetType: 'chat_session' | 'user' | 'chat_export';
	targetId: string | null;
	targetUserIds: Array<string | null | undefined>;
	rowCounts: Record<string, number>;
	request?: Request | null;
	details?: Record<string, string | number | boolean | null>;
};

/**
 * Records an admin read or export of chat content. Ids, route, and row counts
 * only; nothing read is copied into the event. Awaited so the record is written
 * before the content leaves the server. Skipped when the admin reads only their
 * own chat.
 */
export async function logAdminChatContentAccess(input: AdminChatContentAccessInput): Promise<void> {
	const targetUserIds = [
		...new Set(input.targetUserIds.filter((id): id is string => typeof id === 'string' && !!id))
	];
	if (
		input.action === 'read' &&
		targetUserIds.length > 0 &&
		targetUserIds.every((id) => id === input.adminUserId)
	) {
		return;
	}
	const requestContext = input.request?.headers ? getSecurityRequestContext(input.request) : null;
	await logSecurityEventBlocking({
		eventType:
			input.action === 'export' ? 'admin.chat_content.exported' : 'admin.chat_content.read',
		category: 'admin',
		outcome: 'success',
		severity: input.action === 'export' ? 'medium' : 'low',
		actorType: 'admin',
		actorUserId: input.adminUserId,
		targetType: input.targetType,
		targetId: input.targetId,
		requestId: requestContext?.requestId ?? null,
		ipAddress: requestContext?.ipAddress ?? null,
		userAgent: requestContext?.userAgent ?? null,
		metadata: {
			route: input.route,
			target_user_ids: targetUserIds.slice(0, 20),
			target_user_count: targetUserIds.length,
			rows: input.rowCounts,
			...(input.details ?? {})
		}
	});
}
