// apps/web/src/lib/components/agent/capture-receipt.ts
//
// Chat checkpoint receipts (tasker/95). After a checkpoint capture writes the
// project's thinking log or START HERE, or adds what the chat taught about people
// and organizations to the knowledge graph (tasker 164), the chat shows a small
// chip: what was saved, links to it, a pending-review note, and Undo. Receipts come from
// chat_capture_checkpoints (realtime + a load on session open); they are never
// chat messages, so the model never sees them.
import type { UIMessage } from './agent-chat.types';

export const CAPTURE_RECEIPT_COLUMNS =
	'id, session_id, project_id, status, created_at, applied_sections, review_sections, review_run_id, thinking_log_document_id, start_here_document_id, details';

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
	/** details.knowledge: what the knowledge part added (names and counts only). */
	details?: unknown;
};

/** An entry the capture added details to, for the chip. */
export type CaptureKnowledgeEntry = { id: string; name: string; facts: number };

export type CaptureKnowledge = {
	/** Details saved to entries. */
	facts: number;
	entries: CaptureKnowledgeEntry[];
	/** "Same one?" questions filed for the duplicates review instead of saving. */
	questions: number;
};

export type CaptureReceipt = {
	id: string;
	/** Null for a chat with no project whose capture only added knowledge. */
	projectId: string | null;
	status: 'captured' | 'undone';
	createdAt: string;
	startHereDocumentId: string | null;
	thinkingLogDocumentId: string | null;
	appliedSections: string[];
	reviewSections: string[];
	knowledge: CaptureKnowledge | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** The knowledge part of a checkpoint's details, when it saved a detail or filed a question. */
export function readCaptureKnowledge(details: unknown): CaptureKnowledge | null {
	const knowledge = asRecord(asRecord(details)?.knowledge);
	const factIds = Array.isArray(knowledge?.fact_ids) ? knowledge.fact_ids : [];
	if (!knowledge || factIds.length === 0) return null;
	const facts =
		typeof knowledge.saved_facts === 'number' ? knowledge.saved_facts : factIds.length;
	const questions = Array.isArray(knowledge.questions) ? knowledge.questions.length : 0;
	if (facts === 0 && questions === 0) return null;
	const entries = (Array.isArray(knowledge.entities) ? knowledge.entities : []).flatMap(
		(raw): CaptureKnowledgeEntry[] => {
			const entry = asRecord(raw);
			return entry && typeof entry.id === 'string' && typeof entry.name === 'string'
				? [
						{
							id: entry.id,
							name: entry.name,
							facts: typeof entry.facts === 'number' ? entry.facts : 0
						}
					]
				: [];
		}
	);
	return { facts, entries: entries.filter((entry) => entry.facts > 0), questions };
}

/** Receipts exist only for captures that wrote something; noop/failed rows show nothing. */
export function readCaptureReceipt(row: Partial<CaptureReceiptRow> | null): CaptureReceipt | null {
	if (!row?.id || !row.created_at) return null;
	if (row.status !== 'captured' && row.status !== 'undone') return null;
	const projectId = row.project_id ?? null;
	const appliedSections = projectId ? (row.applied_sections ?? []) : [];
	const reviewSections = projectId ? (row.review_sections ?? []) : [];
	const startHereDocumentId =
		appliedSections.length > 0 || reviewSections.length > 0
			? (row.start_here_document_id ?? null)
			: null;
	const thinkingLogDocumentId = projectId ? (row.thinking_log_document_id ?? null) : null;
	const knowledge = readCaptureKnowledge(row.details);
	if (
		!startHereDocumentId &&
		!thinkingLogDocumentId &&
		reviewSections.length === 0 &&
		!knowledge
	) {
		return null;
	}
	return {
		id: row.id,
		projectId,
		status: row.status,
		createdAt: row.created_at,
		startHereDocumentId,
		thinkingLogDocumentId,
		appliedSections,
		reviewSections,
		knowledge
	};
}

/** Where the chip's knowledge link goes: the one entry, or the knowledge page. */
export function knowledgeHref(knowledge: CaptureKnowledge): string {
	return knowledge.entries.length === 1
		? `/knowledge?e=${encodeURIComponent(knowledge.entries[0]!.id)}`
		: '/knowledge';
}

/** "Sam Lee", "Sam Lee and Acme", "Sam Lee, Acme and 2 more". */
export function knowledgeNames(knowledge: CaptureKnowledge): string {
	const names = knowledge.entries.map((entry) => entry.name);
	if (names.length === 0) return 'your contacts';
	if (names.length === 1) return names[0]!;
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return names.length === 3
		? `${names[0]}, ${names[1]} and ${names[2]}`
		: `${names[0]}, ${names[1]} and ${names.length - 2} more`;
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
