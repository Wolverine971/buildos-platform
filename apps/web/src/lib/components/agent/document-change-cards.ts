// apps/web/src/lib/components/agent/document-change-cards.ts
//
// User-facing half of surgical document edits. A successful update_onto_document
// receipt carries a DocumentChangeSummaryV1 (line stats, bounded hunks, inverse
// patch). This module reads that receipt out of a tool result (live SSE or a
// restored tool execution), merges a turn's edits into one card per document,
// builds the rich "updated · +X −Y" toast, and calls the Undo endpoint.
//
// Detection reads the structured `document_change` field only; nothing here
// interprets tool or model text.

import type {
	AppliedDocumentEdit,
	DocumentChangeHunkV1,
	DocumentChangeSummaryV1
} from '@buildos/shared-agent-ops/ontology/document-edits';
import type { DocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';
import { TOAST_DURATION, toastService, type Toast } from '$lib/stores/toast.store';

export type DocumentChangeReceipt = DocumentChangeSummaryV1 & {
	edits_applied?: AppliedDocumentEdit[];
};

/** One chat card: every edit the turn made to one document, in order. */
export interface DocumentChangeCard {
	/** Stable identity: the document plus the body hash the turn left behind. */
	id: string;
	documentId: string;
	projectId: string;
	title: string;
	linesAdded: number;
	linesRemoved: number;
	hunks: DocumentChangeHunkV1[];
	hunksTruncated: boolean;
	editCount: number;
	/** Body hash before the turn's first edit; Undo is idempotent against it. */
	beforeHash: string;
	/** Body hash after the turn's last edit. */
	afterHash: string;
	/** Inverse patches, newest edit first. Null when any edit was too large to carry one. */
	revertPatches: DocumentPatchV1[] | null;
	/** Set once Undo succeeded in this session. */
	undone?: boolean;
}

export type DocumentChangeUndoResult =
	| { status: 'undone'; alreadyUndone: boolean; document: Record<string, unknown> | null }
	| { status: 'conflict'; reason: string; message: string }
	| { status: 'error'; message: string };

const FALLBACK_TITLE = 'Untitled document';

function isRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDocumentChangeSummary(value: unknown): value is DocumentChangeReceipt {
	return (
		isRecord(value) &&
		value.version === 1 &&
		typeof value.document_id === 'string' &&
		value.document_id.length > 0 &&
		typeof value.project_id === 'string' &&
		typeof value.before_hash === 'string' &&
		typeof value.after_hash === 'string' &&
		Number.isFinite(value.lines_added) &&
		Number.isFinite(value.lines_removed) &&
		Array.isArray(value.hunks)
	);
}

/**
 * The change receipt of a successful document edit, or null (title/state-only
 * updates carry none). Live SSE results nest the receipt at `result`; stored tool
 * executions may hold it directly or under the legacy `data` alias.
 */
export function extractDocumentChangeReceipt(toolResult: unknown): DocumentChangeReceipt | null {
	if (!isRecord(toolResult)) return null;
	const candidates = [
		toolResult,
		toolResult.result,
		toolResult.data,
		isRecord(toolResult.result) ? toolResult.result.result : undefined
	];
	for (const candidate of candidates) {
		if (isRecord(candidate) && isDocumentChangeSummary(candidate.document_change)) {
			return candidate.document_change;
		}
	}
	return null;
}

function receiptTitle(receipt: DocumentChangeReceipt): string | null {
	return typeof receipt.title === 'string' && receipt.title.trim() ? receipt.title.trim() : null;
}

/**
 * Merge a turn's receipts into one card per document (first-edit order): stats
 * summed, hunks listed in edit order, Undo chained newest edit first so one
 * request restores the text from before the turn's first edit.
 */
export function buildDocumentChangeCards(receipts: DocumentChangeReceipt[]): DocumentChangeCard[] {
	const groups = new Map<string, DocumentChangeReceipt[]>();
	for (const receipt of receipts) {
		const group = groups.get(receipt.document_id) ?? [];
		// A replayed tool result must not double the stats.
		if (group.some((seen) => seen.after_hash === receipt.after_hash)) continue;
		group.push(receipt);
		groups.set(receipt.document_id, group);
	}

	return [...groups.values()].map((group) => {
		const first = group[0]!;
		const last = group[group.length - 1]!;
		const title =
			[...group]
				.reverse()
				.map(receiptTitle)
				.find((value): value is string => Boolean(value)) ?? FALLBACK_TITLE;
		const revertPatches = group.every((receipt) => receipt.revert_patch)
			? group.map((receipt) => receipt.revert_patch as DocumentPatchV1).reverse()
			: null;
		return {
			id: `${first.document_id}:${last.after_hash}`,
			documentId: first.document_id,
			projectId: first.project_id,
			title,
			linesAdded: group.reduce((sum, receipt) => sum + receipt.lines_added, 0),
			linesRemoved: group.reduce((sum, receipt) => sum + receipt.lines_removed, 0),
			hunks: group.flatMap((receipt) => receipt.hunks),
			hunksTruncated: group.some((receipt) => receipt.hunks_truncated),
			editCount: group.length,
			beforeHash: first.before_hash,
			afterHash: last.after_hash,
			revertPatches
		};
	});
}

/** Opens the document page (same deep link as the created-entity chips). */
export function documentChangeHref(ref: { projectId: string; documentId: string }): string {
	return `/projects/${ref.projectId}?doc=${ref.documentId}`;
}

/**
 * Opens the document in the project workspace editor, whose History panel holds
 * version history and compare/restore. There is no direct deep link to the panel.
 */
export function documentHistoryHref(ref: { projectId: string; documentId: string }): string {
	return `/projects/${ref.projectId}?entity=document&entity_id=${ref.documentId}`;
}

export function buildDocumentChangeToast(receipt: DocumentChangeReceipt): Omit<Toast, 'id'> {
	const title = receiptTitle(receipt) ?? FALLBACK_TITLE;
	const ref = { projectId: receipt.project_id, documentId: receipt.document_id };
	return {
		type: 'success',
		message: `${title} updated`,
		duration: TOAST_DURATION.STANDARD,
		dismissible: true,
		documentChange: {
			title,
			linesAdded: receipt.lines_added,
			linesRemoved: receipt.lines_removed,
			hunks: receipt.hunks,
			hunksTruncated: receipt.hunks_truncated,
			documentHref: documentChangeHref(ref),
			historyHref: documentHistoryHref(ref)
		}
	};
}

export function showDocumentChangeToast(receipt: DocumentChangeReceipt): string {
	return toastService.add(buildDocumentChangeToast(receipt));
}

/** Plain-language copy for the structured conflict codes the Undo endpoint returns. */
export function describeUndoConflict(reason: string): string {
	switch (reason) {
		case 'WRITE_RACE':
			return 'The document was being saved at the same moment. Try Undo again.';
		case 'MANAGED_REGION_BOUNDARY':
			return 'This edit now overlaps a section BuildOS manages, so it can’t be undone automatically.';
		default:
			return 'The edited text has changed since, so Undo can’t apply cleanly. Restore it from version history instead.';
	}
}

export async function undoDocumentChange(
	card: DocumentChangeCard,
	fetchImpl: typeof fetch = fetch
): Promise<DocumentChangeUndoResult> {
	if (!card.revertPatches?.length) {
		return {
			status: 'error',
			message: 'This change is too large to undo automatically.'
		};
	}

	let response: Response;
	try {
		response = await fetchImpl(
			`/api/onto/documents/${encodeURIComponent(card.documentId)}/revert-change`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					revert_patches: card.revertPatches,
					before_hash: card.beforeHash,
					expected_after_hash: card.afterHash
				})
			}
		);
	} catch {
		return {
			status: 'error',
			message: 'Couldn’t reach BuildOS. Check your connection and try again.'
		};
	}

	const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
	if (response.ok && payload?.success) {
		const data = isRecord(payload.data) ? payload.data : {};
		return {
			status: 'undone',
			alreadyUndone: data.already_undone === true,
			document: isRecord(data.document) ? data.document : null
		};
	}
	if (response.status === 409) {
		const reason = typeof payload?.code === 'string' ? payload.code : 'BASE_TEXT_CHANGED';
		return { status: 'conflict', reason, message: describeUndoConflict(reason) };
	}
	return {
		status: 'error',
		message:
			typeof payload?.error === 'string' && payload.error
				? payload.error
				: 'Undo failed. Try again.'
	};
}
