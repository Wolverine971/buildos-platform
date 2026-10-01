// packages/shared-agent-ops/src/ontology/shared-document-edit-card.ts
//
// The confirm card a child project's chat shows before anything changes in a
// document its parent shares with sub-projects (project hierarchy, Phase 2).
// Consent is the user's click on the card, never chat text.
//
// - The worker writes the card into the update_onto_document effect receipt
//   (`chat_turn_effects.downstream_receipt`, service-only). The exact edit, the
//   previewed document version and the ids are held there; the browser only
//   ever sends back the card id and a choice.
// - The web renders `client_action` under the assistant's reply, resolves the
//   click (POST /api/chat/shared-document-edits/[id]) through the same document
//   update the chat uses, records the resolution in the ledger, and hands the
//   outcome to the next chat turn as a structured note.
//
// Every reader here parses structured fields only. Client-safe: no Node imports.
import type { DocumentChangeHunkV1 } from './document-edits';

export const SHARED_DOCUMENT_EDIT_CARD_KIND = 'shared_document_edit_v1' as const;
/** v1 was the retired typed-"yes" token preview; it can no longer be resolved. */
export const SHARED_DOCUMENT_EDIT_CARD_VERSION = 2 as const;
export const SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND = 'confirm_shared_document_edit' as const;
/** A card can be resolved for 24 hours after the edit was proposed. */
export const SHARED_DOCUMENT_EDIT_CARD_TTL_MS = 24 * 60 * 60 * 1000;

export type SharedDocumentEditChoice = 'apply' | 'copy' | 'cancel';
export type SharedDocumentEditOutcome = 'applied' | 'copied' | 'cancelled' | 'stale' | 'unknown';

export const SHARED_DOCUMENT_EDIT_CHOICES: readonly SharedDocumentEditChoice[] = [
	'apply',
	'copy',
	'cancel'
];

export type SharedDocumentEditFieldChangeV1 = {
	field: 'title' | 'description' | 'state' | 'type' | 'metadata';
	from: string | null;
	to: string | null;
};

/** Bounded diff of the body change, rendered as-is (no re-diffing). */
export type SharedDocumentEditCardChangeV1 = {
	lines_added: number;
	lines_removed: number;
	hunks: DocumentChangeHunkV1[];
	hunks_truncated: boolean;
};

/** What the browser renders. Display data only; nothing here is sent back. */
export type SharedDocumentEditClientActionV1 = {
	kind: typeof SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND;
	action_id: string;
	card_id: string;
	session_id: string;
	document_id: string;
	document_title: string;
	parent_project_id: string;
	parent_name: string;
	child_project_id: string;
	shared_with_count: number;
	change: SharedDocumentEditCardChangeV1 | null;
	field_changes: SharedDocumentEditFieldChangeV1[];
	expires_at: string;
};

/** The server-held half. The web resolver reads it only from the ledger. */
export type SharedDocumentEditPendingV1 = {
	document_id: string;
	child_project_id: string;
	parent_project_id: string;
	shared_folder_id: string;
	shared_with_count: number;
	/** The parent document's `updated_at` the change was previewed against. */
	document_version: string;
	/** Exact normalized update_onto_document arguments. */
	arguments: Record<string, unknown>;
};

export type SharedDocumentEditCopyV1 = {
	document_id: string;
	project_id: string;
	project_name: string | null;
	title: string;
	/** False only when the copy was made but the edit could not be applied to it. */
	edit_applied: boolean;
};

export type SharedDocumentEditResolutionV1 = {
	version: 1;
	card_id: string;
	choice: SharedDocumentEditChoice;
	outcome: SharedDocumentEditOutcome;
	resolved_at: string;
	document_id: string;
	document_title: string;
	parent_project_id: string;
	parent_name: string;
	shared_with_count: number;
	copy: SharedDocumentEditCopyV1 | null;
};

export type SharedDocumentEditCardReceiptV1 = {
	status: 'confirmation_required';
	requires_user_action: true;
	confirmation_kind: typeof SHARED_DOCUMENT_EDIT_CARD_KIND;
	card_version: typeof SHARED_DOCUMENT_EDIT_CARD_VERSION;
	card_id: string;
	source_user_message_id: string;
	pending_edit: SharedDocumentEditPendingV1;
	client_action: SharedDocumentEditClientActionV1;
	message: string;
	/** Mirrored onto the chat_tool_executions copy by the web resolver. */
	card_resolution?: SharedDocumentEditResolutionV1;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function uuid(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}
function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}
function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
function timestamp(value: unknown): string | null {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Any shared-document preview receipt (this card or the retired v1 token
 * preview). It changed nothing, so it is never a saved write.
 */
export function isSharedDocumentEditPreview(value: unknown): boolean {
	return (
		isRecord(value) &&
		value.confirmation_kind === SHARED_DOCUMENT_EDIT_CARD_KIND &&
		value.status === 'confirmation_required'
	);
}

function parseHunks(value: unknown): DocumentChangeHunkV1[] | null {
	if (!Array.isArray(value)) return null;
	const hunks: DocumentChangeHunkV1[] = [];
	for (const hunk of value) {
		if (!isRecord(hunk) || !Array.isArray(hunk.lines)) return null;
		const oldStart = count(hunk.old_start);
		const newStart = count(hunk.new_start);
		if (oldStart === null || newStart === null) return null;
		const lines: DocumentChangeHunkV1['lines'] = [];
		for (const line of hunk.lines) {
			if (
				!isRecord(line) ||
				(line.kind !== 'add' && line.kind !== 'remove' && line.kind !== 'context') ||
				typeof line.text !== 'string'
			)
				return null;
			lines.push({ kind: line.kind, text: line.text });
		}
		hunks.push({ old_start: oldStart, new_start: newStart, lines });
	}
	return hunks;
}

function parseChange(value: unknown): SharedDocumentEditCardChangeV1 | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const added = count(value.lines_added);
	const removed = count(value.lines_removed);
	const hunks = parseHunks(value.hunks);
	if (added === null || removed === null || !hunks) return undefined;
	return {
		lines_added: added,
		lines_removed: removed,
		hunks,
		hunks_truncated: value.hunks_truncated === true
	};
}

const FIELD_NAMES = new Set(['title', 'description', 'state', 'type', 'metadata']);

function parseFieldChanges(value: unknown): SharedDocumentEditFieldChangeV1[] | null {
	if (!Array.isArray(value)) return null;
	const changes: SharedDocumentEditFieldChangeV1[] = [];
	for (const entry of value) {
		if (!isRecord(entry) || typeof entry.field !== 'string' || !FIELD_NAMES.has(entry.field))
			return null;
		changes.push({
			field: entry.field as SharedDocumentEditFieldChangeV1['field'],
			from: text(entry.from),
			to: text(entry.to)
		});
	}
	return changes;
}

export function parseSharedDocumentEditClientAction(
	value: unknown
): SharedDocumentEditClientActionV1 | null {
	if (!isRecord(value) || value.kind !== SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND) return null;
	const cardId = uuid(value.card_id);
	const sessionId = uuid(value.session_id);
	const documentId = uuid(value.document_id);
	const parentId = uuid(value.parent_project_id);
	const childId = uuid(value.child_project_id);
	const sharedWith = count(value.shared_with_count);
	const title = text(value.document_title);
	const parentName = text(value.parent_name);
	const expiresAt = timestamp(value.expires_at);
	const change = parseChange(value.change);
	const fieldChanges = parseFieldChanges(value.field_changes);
	if (
		!cardId ||
		!sessionId ||
		!documentId ||
		!parentId ||
		!childId ||
		sharedWith === null ||
		title === null ||
		parentName === null ||
		!expiresAt ||
		change === undefined ||
		!fieldChanges
	)
		return null;
	return {
		kind: SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND,
		action_id: cardId,
		card_id: cardId,
		session_id: sessionId,
		document_id: documentId,
		document_title: title,
		parent_project_id: parentId,
		parent_name: parentName,
		child_project_id: childId,
		shared_with_count: sharedWith,
		change,
		field_changes: fieldChanges,
		expires_at: expiresAt
	};
}

export function parseSharedDocumentEditResolution(
	value: unknown
): SharedDocumentEditResolutionV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const cardId = uuid(value.card_id);
	const documentId = uuid(value.document_id);
	const parentId = uuid(value.parent_project_id);
	const resolvedAt = timestamp(value.resolved_at);
	const sharedWith = count(value.shared_with_count);
	const choice = value.choice;
	const outcome = value.outcome;
	if (
		!cardId ||
		!documentId ||
		!parentId ||
		!resolvedAt ||
		sharedWith === null ||
		typeof value.document_title !== 'string' ||
		typeof value.parent_name !== 'string' ||
		(choice !== 'apply' && choice !== 'copy' && choice !== 'cancel') ||
		(outcome !== 'applied' &&
			outcome !== 'copied' &&
			outcome !== 'cancelled' &&
			outcome !== 'stale' &&
			outcome !== 'unknown')
	)
		return null;
	let copy: SharedDocumentEditCopyV1 | null = null;
	if (isRecord(value.copy)) {
		const copyId = uuid(value.copy.document_id);
		const copyProject = uuid(value.copy.project_id);
		if (!copyId || !copyProject || typeof value.copy.title !== 'string') return null;
		copy = {
			document_id: copyId,
			project_id: copyProject,
			project_name: text(value.copy.project_name),
			title: value.copy.title,
			edit_applied: value.copy.edit_applied === true
		};
	}
	if (outcome === 'copied' && !copy) return null;
	return {
		version: 1,
		card_id: cardId,
		choice,
		outcome,
		resolved_at: resolvedAt,
		document_id: documentId,
		document_title: value.document_title,
		parent_project_id: parentId,
		parent_name: value.parent_name,
		shared_with_count: sharedWith,
		copy
	};
}

/** The v2 card receipt with its server-held edit, or null (v1 previews included). */
export function parseSharedDocumentEditCardReceipt(
	value: unknown
): SharedDocumentEditCardReceiptV1 | null {
	if (
		!isSharedDocumentEditPreview(value) ||
		!isRecord(value) ||
		value.card_version !== SHARED_DOCUMENT_EDIT_CARD_VERSION
	)
		return null;
	const cardId = uuid(value.card_id);
	const sourceMessageId = uuid(value.source_user_message_id);
	const action = parseSharedDocumentEditClientAction(value.client_action);
	const pending = isRecord(value.pending_edit) ? value.pending_edit : null;
	if (!cardId || !sourceMessageId || !action || action.card_id !== cardId || !pending)
		return null;
	const documentId = uuid(pending.document_id);
	const childId = uuid(pending.child_project_id);
	const parentId = uuid(pending.parent_project_id);
	const folderId = uuid(pending.shared_folder_id);
	const sharedWith = count(pending.shared_with_count);
	const version = timestamp(pending.document_version);
	const args = isRecord(pending.arguments) ? pending.arguments : null;
	if (
		!documentId ||
		!childId ||
		!parentId ||
		!folderId ||
		sharedWith === null ||
		!version ||
		!args ||
		uuid(args.document_id) !== documentId ||
		documentId !== action.document_id ||
		parentId !== action.parent_project_id ||
		childId !== action.child_project_id
	)
		return null;
	const resolution = parseSharedDocumentEditResolution(value.card_resolution);
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: SHARED_DOCUMENT_EDIT_CARD_KIND,
		card_version: SHARED_DOCUMENT_EDIT_CARD_VERSION,
		card_id: cardId,
		source_user_message_id: sourceMessageId,
		pending_edit: {
			document_id: documentId,
			child_project_id: childId,
			parent_project_id: parentId,
			shared_folder_id: folderId,
			shared_with_count: sharedWith,
			document_version: version,
			arguments: { ...args }
		},
		client_action: action,
		message: typeof value.message === 'string' ? value.message : '',
		...(resolution && resolution.card_id === cardId ? { card_resolution: resolution } : {})
	};
}

export function sharedDocumentEditCardExpiresAt(proposedAt: string | Date): string {
	const start = typeof proposedAt === 'string' ? Date.parse(proposedAt) : proposedAt.getTime();
	return new Date(start + SHARED_DOCUMENT_EDIT_CARD_TTL_MS).toISOString();
}

export function isSharedDocumentEditCardExpired(
	action: Pick<SharedDocumentEditClientActionV1, 'expires_at'>,
	now: number = Date.now()
): boolean {
	const expiresAt = Date.parse(action.expires_at);
	return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function projects(count: number): string {
	return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

/** Document page link (same deep link the chat's document chips use). */
export function sharedDocumentEditDocumentHref(projectId: string, documentId: string): string {
	return `/projects/${projectId}?doc=${documentId}`;
}

/** The one line a resolved card shows, with its Open link when there is a document to open. */
export function describeSharedDocumentEditResolution(resolution: SharedDocumentEditResolutionV1): {
	text: string;
	href: string | null;
} {
	const parentDoc = sharedDocumentEditDocumentHref(
		resolution.parent_project_id,
		resolution.document_id
	);
	switch (resolution.outcome) {
		case 'applied':
			return {
				text: `Updated in ${resolution.parent_name} · shown in ${projects(resolution.shared_with_count)}`,
				href: parentDoc
			};
		case 'copied': {
			const copy = resolution.copy!;
			const where = copy.project_name || 'this project';
			return {
				text: copy.edit_applied
					? `Copied to ${where} and edited`
					: `Copied to ${where}, but the edit couldn’t be applied to the copy`,
				href: sharedDocumentEditDocumentHref(copy.project_id, copy.document_id)
			};
		}
		case 'cancelled':
			return { text: 'Cancelled', href: null };
		case 'stale':
			return {
				// Phrased without a possessive so no name needs grammatical guessing.
				text: `The copy in ${resolution.parent_name} changed since this preview. Ask Jev again.`,
				href: null
			};
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether this saved. Open the document to check.',
				href: parentDoc
			};
	}
}
