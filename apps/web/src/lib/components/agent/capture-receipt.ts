// apps/web/src/lib/components/agent/capture-receipt.ts
//
// Chat checkpoint receipts (tasker/95). After a checkpoint capture writes the
// project's thinking log or START HERE, the chat shows a small chip: what was
// saved, links to it, a pending-review note, and Undo. Receipts come from
// chat_capture_checkpoints (realtime + a load on session open); they are never
// chat messages, so the model never sees them.
import type { UIMessage } from './agent-chat.types';

export const CAPTURE_RECEIPT_COLUMNS =
	'id, session_id, project_id, status, created_at, applied_sections, review_sections, review_run_id, thinking_log_document_id, start_here_document_id';

export type CaptureReceiptRow = {
	id: string;
	session_id: string;
	project_id: string | null;
	status: string;
	created_at: string;
	applied_sections: string[] | null;
	review_sections: string[] | null;
	review_run_id: string | null;
	thinking_log_document_id: string | null;
	start_here_document_id: string | null;
};

export type CaptureReceipt = {
	id: string;
	projectId: string;
	status: 'captured' | 'undone';
	createdAt: string;
	startHereDocumentId: string | null;
	thinkingLogDocumentId: string | null;
	appliedSections: string[];
	reviewSections: string[];
};

/** Receipts exist only for captures that wrote something; noop/failed rows show nothing. */
export function readCaptureReceipt(row: Partial<CaptureReceiptRow> | null): CaptureReceipt | null {
	if (!row?.id || !row.project_id || !row.created_at) return null;
	if (row.status !== 'captured' && row.status !== 'undone') return null;
	const appliedSections = row.applied_sections ?? [];
	const reviewSections = row.review_sections ?? [];
	const startHereDocumentId =
		appliedSections.length > 0 || reviewSections.length > 0
			? (row.start_here_document_id ?? null)
			: null;
	if (!startHereDocumentId && !row.thinking_log_document_id && reviewSections.length === 0) {
		return null;
	}
	return {
		id: row.id,
		projectId: row.project_id,
		status: row.status,
		createdAt: row.created_at,
		startHereDocumentId,
		thinkingLogDocumentId: row.thinking_log_document_id ?? null,
		appliedSections,
		reviewSections
	};
}

export function documentHref(projectId: string, documentId: string): string {
	return `/projects/${encodeURIComponent(projectId)}?doc=${encodeURIComponent(documentId)}`;
}

export function buildCaptureReceiptUIMessage(row: Partial<CaptureReceiptRow>): UIMessage | null {
	const receipt = readCaptureReceipt(row);
	if (!receipt) return null;
	return {
		id: `capture-receipt:${receipt.id}`,
		session_id: row.session_id ?? undefined,
		role: 'assistant',
		type: 'capture_receipt',
		content: '',
		created_at: receipt.createdAt,
		timestamp: new Date(receipt.createdAt),
		data: { receipt }
	};
}

/**
 * Insert or refresh a receipt in the message list, in time order. An update to
 * an existing receipt (e.g. undone) replaces it in place.
 */
export function upsertCaptureReceipt(messages: UIMessage[], receipt: UIMessage): UIMessage[] {
	const existing = messages.findIndex((message) => message.id === receipt.id);
	if (existing >= 0) {
		return messages.map((message, index) => (index === existing ? receipt : message));
	}
	const at = receipt.timestamp.getTime();
	const insertAt = messages.findIndex((message) => message.timestamp.getTime() > at);
	return insertAt < 0
		? [...messages, receipt]
		: [...messages.slice(0, insertAt), receipt, ...messages.slice(insertAt)];
}
