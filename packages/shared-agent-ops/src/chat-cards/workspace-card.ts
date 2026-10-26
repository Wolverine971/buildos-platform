// packages/shared-agent-ops/src/chat-cards/workspace-card.ts
//
// The Workspace cards (tasker 146, Phase 2). The Workspace is each person's holding
// ground for loose notes, docs and tasks (an onto_projects row with kind 'workspace';
// docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md). Chat may *propose*:
//
// - `workspace_file` (`propose_workspace_filing`): move these loose items into a project;
// - `workspace_project` (`propose_workspace_project`): start a new project from them.
//
// The agent suggests and never files: only the user's click moves or creates anything,
// and the web runs it through the Workspace's own Organize mover (moveItems /
// graduateItems) with one Undo. "Not now" on a card that answers a Workspace
// suggestion dismisses that suggestion, as the shelf's "Not now" does.
//
// The worker builds the payload from a live read of the items; the web re-reads them at
// click time and compares `visibleDigest`s (ids and counts only), so an item that left
// the Workspace in between shows up as a changed card, never as a silent partial move.
// Client-safe: no Node imports. Structured fields only.
import type {
	ProposalCardEnvelopeV1,
	ProposalCardKindSpecV1,
	ProposalCardResolutionV1,
	ProposalCardState,
	ProposalCardUndoV1
} from './proposal-card';
import {
	count,
	digestOf,
	isRecord,
	parseProjectRef,
	PROPOSAL_CARD_LIST_LIMIT,
	PROPOSAL_CARD_TTL_MS,
	PROPOSAL_CARD_UNDO_TTL_MS,
	sortedStrings,
	text,
	timestamp,
	uuid,
	type ProjectRefV1
} from './card-fields';

export const WORKSPACE_FILE_TOOL_NAME = 'propose_workspace_filing' as const;
export const WORKSPACE_PROJECT_TOOL_NAME = 'propose_workspace_project' as const;
export const WORKSPACE_CARD_CHOICES = ['apply', 'cancel'] as const;
export type WorkspaceCardChoice = (typeof WORKSPACE_CARD_CHOICES)[number];

/** A card names at most this many items (the contract's list cap). */
export const WORKSPACE_CARD_ITEM_LIMIT = PROPOSAL_CARD_LIST_LIMIT;
/** One loose item is a filing, not a project. */
export const WORKSPACE_PROJECT_MIN_ITEMS = 2;
/** The limits graduateItems applies (workspace.service.ts). */
export const WORKSPACE_PROJECT_NAME_MAX = 120;
export const WORKSPACE_PROJECT_DESCRIPTION_MAX = 600;
export const WORKSPACE_CARD_REASON_MAX = 200;

export type WorkspaceItemEntity = 'document' | 'task';
export type WorkspaceItemKind = 'note' | 'doc' | 'task';
export type WorkspaceItemKeyV1 = { entity: WorkspaceItemEntity; id: string };
export type WorkspaceItemV1 = WorkspaceItemKeyV1 & { kind: WorkspaceItemKind; title: string };

const ENTITIES = new Set<string>(['document', 'task']);
const KINDS = new Set<string>(['note', 'doc', 'task']);

export function workspaceItemKey(item: WorkspaceItemKeyV1): string {
	return `${item.entity}:${item.id.toLowerCase()}`;
}

/**
 * Item references as the tools and the suggestions table carry them
 * ({entity|kind: 'document'|'task', id}), deduplicated, ids lowercased. Null when any
 * entry is unusable; callers decide what an empty list means.
 */
export function parseWorkspaceItemKeys(value: unknown): WorkspaceItemKeyV1[] | null {
	if (!Array.isArray(value)) return null;
	const keys: WorkspaceItemKeyV1[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		if (!isRecord(entry)) return null;
		const entity = entry.entity ?? entry.kind;
		const id = uuid(entry.id);
		if (typeof entity !== 'string' || !ENTITIES.has(entity) || !id) return null;
		const key = { entity: entity as WorkspaceItemEntity, id };
		if (seen.has(workspaceItemKey(key))) continue;
		seen.add(workspaceItemKey(key));
		keys.push(key);
	}
	return keys;
}

/** The new project's name the way graduateItems stores it (whitespace collapsed, capped). */
export function cleanWorkspaceProjectName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.replace(/\s+/g, ' ').trim().slice(0, WORKSPACE_PROJECT_NAME_MAX);
	return name || null;
}

export function cleanWorkspaceCardText(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const cleaned = value.trim().slice(0, max);
	return cleaned || null;
}

/** "1 item", "3 items". */
export function workspaceItemCountLabel(n: number): string {
	return `${n} ${n === 1 ? 'item' : 'items'}`;
}

// ---------------------------------------------------------------------------
// Payloads.

export type WorkspaceFileProposalPayloadV1 = {
	version: 1;
	workspace: ProjectRefV1;
	target: ProjectRefV1;
	/** Live loose items, in the order asked for. */
	items: WorkspaceItemV1[];
	/** Docs nested inside a moving doc that come along with it. */
	nested_documents: number;
	/** The open Workspace suggestion this card answers, if any. */
	suggestion_id: string | null;
	reason: string | null;
	checked_at: string;
};

export type WorkspaceProjectProposalPayloadV1 = {
	version: 1;
	workspace: ProjectRefV1;
	name: string;
	description: string | null;
	items: WorkspaceItemV1[];
	nested_documents: number;
	suggestion_id: string | null;
	checked_at: string;
};

function parseItems(value: unknown): WorkspaceItemV1[] | null {
	if (!Array.isArray(value) || value.length < 1 || value.length > WORKSPACE_CARD_ITEM_LIMIT)
		return null;
	const items: WorkspaceItemV1[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		if (!isRecord(entry)) return null;
		const id = uuid(entry.id);
		const title = text(entry.title);
		if (
			!id ||
			title === null ||
			typeof entry.entity !== 'string' ||
			!ENTITIES.has(entry.entity) ||
			typeof entry.kind !== 'string' ||
			!KINDS.has(entry.kind)
		)
			return null;
		const item: WorkspaceItemV1 = {
			entity: entry.entity as WorkspaceItemEntity,
			id,
			kind: entry.kind as WorkspaceItemKind,
			title
		};
		// A task is a task; a document is a note or a doc.
		if ((item.entity === 'task') !== (item.kind === 'task')) return null;
		if (seen.has(workspaceItemKey(item))) return null;
		seen.add(workspaceItemKey(item));
		items.push(item);
	}
	return items;
}

function nullableUuid(value: unknown): string | null | undefined {
	if (value === null || value === undefined) return null;
	return uuid(value) ?? undefined;
}

export function parseWorkspaceFilePayload(value: unknown): WorkspaceFileProposalPayloadV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const workspace = parseProjectRef(value.workspace);
	const target = parseProjectRef(value.target);
	const items = parseItems(value.items);
	const nested = count(value.nested_documents);
	const suggestionId = nullableUuid(value.suggestion_id);
	const checkedAt = timestamp(value.checked_at);
	if (
		!workspace ||
		!target ||
		workspace.id === target.id ||
		!items ||
		nested === null ||
		suggestionId === undefined ||
		!checkedAt
	)
		return null;
	return {
		version: 1,
		workspace,
		target,
		items,
		nested_documents: nested,
		suggestion_id: suggestionId,
		reason: text(value.reason),
		checked_at: checkedAt
	};
}

export function parseWorkspaceProjectPayload(
	value: unknown
): WorkspaceProjectProposalPayloadV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const workspace = parseProjectRef(value.workspace);
	const name = cleanWorkspaceProjectName(value.name);
	// A fresh view may hold fewer items than were proposed (one was filed meanwhile).
	const items = parseItems(value.items);
	const nested = count(value.nested_documents);
	const suggestionId = nullableUuid(value.suggestion_id);
	const checkedAt = timestamp(value.checked_at);
	if (
		!workspace ||
		!name ||
		name !== value.name ||
		!items ||
		nested === null ||
		suggestionId === undefined ||
		!checkedAt
	)
		return null;
	return {
		version: 1,
		workspace,
		name,
		description: text(value.description),
		items,
		nested_documents: nested,
		suggestion_id: suggestionId,
		checked_at: checkedAt
	};
}

/** visibleDigest: what the click moves, by id and count (never titles or names). */
export function workspaceFileDigest(payload: WorkspaceFileProposalPayloadV1): string {
	return digestOf({
		kind: 'workspace_file',
		workspace: payload.workspace.id,
		target: payload.target.id,
		items: sortedStrings(payload.items.map(workspaceItemKey)),
		nested_documents: payload.nested_documents,
		suggestion_id: payload.suggestion_id
	});
}

export function workspaceProjectDigest(payload: WorkspaceProjectProposalPayloadV1): string {
	return digestOf({
		kind: 'workspace_project',
		workspace: payload.workspace.id,
		items: sortedStrings(payload.items.map(workspaceItemKey)),
		nested_documents: payload.nested_documents,
		suggestion_id: payload.suggestion_id
	});
}

/** The items in the tool's own arguments are exactly the payload's items. */
function sameItems(args: Record<string, unknown>, items: readonly WorkspaceItemV1[]): boolean {
	const keys = parseWorkspaceItemKeys(args.items);
	if (!keys || keys.length !== items.length) return false;
	const asked = sortedStrings(keys.map(workspaceItemKey));
	const shown = sortedStrings(items.map(workspaceItemKey));
	return asked.every((key, index) => key === shown[index]);
}

function sameSuggestion(args: Record<string, unknown>, suggestionId: string | null): boolean {
	const asked = nullableUuid(args.suggestion_id);
	return asked !== undefined && asked === suggestionId;
}

function fileArgumentsMatch(args: unknown, payload: WorkspaceFileProposalPayloadV1): boolean {
	return (
		isRecord(args) &&
		uuid(args.target_project_id) === payload.target.id &&
		sameItems(args, payload.items) &&
		sameSuggestion(args, payload.suggestion_id)
	);
}

function projectArgumentsMatch(args: unknown, payload: WorkspaceProjectProposalPayloadV1): boolean {
	return (
		isRecord(args) &&
		cleanWorkspaceProjectName(args.name) === payload.name &&
		sameItems(args, payload.items) &&
		sameSuggestion(args, payload.suggestion_id)
	);
}

// ---------------------------------------------------------------------------
// Receipts.

export type WorkspaceFileReceiptV1 = {
	target_project_id: string;
	/** The Organize batch Undo reverses (null when nothing moved). */
	batch_id: string | null;
	moved: number;
	suggestion_id: string | null;
	/** The attached suggestion was answered: accepted on apply, dismissed on Not now. */
	suggestion_updated: boolean;
};

export type WorkspaceFileUndoReceiptV1 = { batch_id: string };

export type WorkspaceProjectReceiptV1 = {
	project_id: string | null;
	project_name: string | null;
	batch_id: string | null;
	moved: number;
	suggestion_id: string | null;
	suggestion_updated: boolean;
};

export type WorkspaceProjectUndoReceiptV1 = {
	project_id: string;
	batch_id: string;
	/** False: the items went back but the project stays (something else was added to it). */
	project_removed: boolean;
};

function parseFileReceipt(value: unknown): WorkspaceFileReceiptV1 | null {
	if (!isRecord(value)) return null;
	const target = uuid(value.target_project_id);
	const batchId = nullableUuid(value.batch_id);
	const suggestionId = nullableUuid(value.suggestion_id);
	if (!target || batchId === undefined || suggestionId === undefined) return null;
	return {
		target_project_id: target,
		batch_id: batchId,
		moved: count(value.moved) ?? 0,
		suggestion_id: suggestionId,
		suggestion_updated: value.suggestion_updated === true
	};
}

function parseFileUndoReceipt(value: unknown): WorkspaceFileUndoReceiptV1 | null {
	if (!isRecord(value)) return null;
	const batchId = uuid(value.batch_id);
	return batchId ? { batch_id: batchId } : null;
}

function parseProjectReceipt(value: unknown): WorkspaceProjectReceiptV1 | null {
	if (!isRecord(value)) return null;
	const projectId = nullableUuid(value.project_id);
	const batchId = nullableUuid(value.batch_id);
	const suggestionId = nullableUuid(value.suggestion_id);
	if (projectId === undefined || batchId === undefined || suggestionId === undefined) return null;
	return {
		project_id: projectId,
		project_name: text(value.project_name),
		batch_id: batchId,
		moved: count(value.moved) ?? 0,
		suggestion_id: suggestionId,
		suggestion_updated: value.suggestion_updated === true
	};
}

function parseProjectUndoReceipt(value: unknown): WorkspaceProjectUndoReceiptV1 | null {
	if (!isRecord(value)) return null;
	const projectId = uuid(value.project_id);
	const batchId = uuid(value.batch_id);
	if (!projectId || !batchId) return null;
	return {
		project_id: projectId,
		batch_id: batchId,
		project_removed: value.project_removed === true
	};
}

// ---------------------------------------------------------------------------
// Wording. Fixed sentences built from structured fields.

/** The Workspace lives on the Projects home. */
const WORKSPACE_HREF = '/projects';

function projectHref(id: string): string {
	return `/projects/${id}`;
}

function staleFileText(reason: string | null, payload: WorkspaceFileProposalPayloadV1): string {
	switch (reason) {
		case 'items_moved':
			return 'These items already left the Workspace, so nothing moved.';
		case 'target_unavailable':
			return `${payload.target.name} is archived or gone, so nothing moved.`;
		default:
			return 'Something changed since this card, so nothing moved. Ask again.';
	}
}

function describeFileResolution(
	resolution: ProposalCardResolutionV1<WorkspaceFileReceiptV1>,
	payload: WorkspaceFileProposalPayloadV1
) {
	switch (resolution.outcome) {
		case 'applied': {
			const moved = resolution.receipt?.moved || payload.items.length;
			return {
				text: `Filed ${workspaceItemCountLabel(moved)} into ${payload.target.name}`,
				href: projectHref(payload.target.id)
			};
		}
		case 'cancelled':
			return { text: 'Not now. Nothing moved.', href: null };
		case 'stale':
			return {
				text: staleFileText(resolution.reason_code, payload),
				href: WORKSPACE_HREF
			};
		case 'unknown':
			return {
				text: `BuildOS couldn’t confirm whether this saved. Open ${payload.target.name} to check.`,
				href: projectHref(payload.target.id)
			};
	}
}

function describeFileUndo(
	undo: ProposalCardUndoV1<WorkspaceFileUndoReceiptV1>,
	payload: WorkspaceFileProposalPayloadV1
) {
	switch (undo.outcome) {
		case 'undone':
			return { text: 'Undone. The items are back in your Workspace.', href: WORKSPACE_HREF };
		case 'stale':
			return {
				text: `Couldn’t undo: those items changed or moved again since. Nothing moved back.`,
				href: projectHref(payload.target.id)
			};
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether the undo saved. Open your Workspace to check.',
				href: WORKSPACE_HREF
			};
	}
}

function fileNoteMeaning(
	state: ProposalCardState,
	_payload: WorkspaceFileProposalPayloadV1,
	_card: ProposalCardEnvelopeV1<WorkspaceFileProposalPayloadV1>
): string {
	switch (state) {
		case 'pending':
			return 'The user has not chosen yet and nothing moved. If they want this, point them to the card; do not propose it again.';
		case 'applied':
			return 'The user confirmed. The listed items moved out of the Workspace into target (docs nested inside them came along). An attached suggestion is accepted.';
		case 'cancelled':
			return 'The user chose Not now. Nothing moved, and an attached suggestion is dismissed. Do not bring it up again unless the user asks.';
		case 'stale':
			return 'Nothing moved: the items or the target changed before the user chose. Check the Workspace before proposing again.';
		case 'unknown':
			return 'BuildOS could not confirm whether the move saved. Ask the user to check the target project before trying again.';
		case 'undone':
			return 'The user undid this. The items are back in the Workspace.';
	}
}

function staleProjectText(reason: string | null): string {
	switch (reason) {
		case 'items_moved':
			return 'These items already left the Workspace, so no project was started.';
		default:
			return 'Something changed since this card, so no project was started. Ask again.';
	}
}

function describeProjectResolution(
	resolution: ProposalCardResolutionV1<WorkspaceProjectReceiptV1>,
	payload: WorkspaceProjectProposalPayloadV1
) {
	const receipt = resolution.receipt;
	switch (resolution.outcome) {
		case 'applied': {
			const moved = receipt?.moved || payload.items.length;
			return {
				text: `Started ${receipt?.project_name ?? payload.name} with ${workspaceItemCountLabel(moved)}`,
				href: receipt?.project_id ? projectHref(receipt.project_id) : WORKSPACE_HREF
			};
		}
		case 'cancelled':
			return { text: 'Not now. Nothing changed.', href: null };
		case 'stale':
			return { text: staleProjectText(resolution.reason_code), href: WORKSPACE_HREF };
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether the project was started. Open your Workspace to check.',
				href: WORKSPACE_HREF
			};
	}
}

function describeProjectUndo(
	undo: ProposalCardUndoV1<WorkspaceProjectUndoReceiptV1>,
	payload: WorkspaceProjectProposalPayloadV1
) {
	switch (undo.outcome) {
		case 'undone':
			return {
				text:
					undo.receipt?.project_removed === false
						? `Undone. The items are back in your Workspace; ${payload.name} stays because something else was added to it.`
						: `Undone. The items are back in your Workspace and ${payload.name} was removed.`,
				href: WORKSPACE_HREF
			};
		case 'stale':
			return {
				text: 'Couldn’t undo: those items changed or moved again since. Nothing moved back.',
				href: WORKSPACE_HREF
			};
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether the undo saved. Open your Workspace to check.',
				href: WORKSPACE_HREF
			};
	}
}

function projectNoteMeaning(
	state: ProposalCardState,
	_payload: WorkspaceProjectProposalPayloadV1,
	_card: ProposalCardEnvelopeV1<WorkspaceProjectProposalPayloadV1>
): string {
	switch (state) {
		case 'pending':
			return 'The user has not chosen yet and no project exists. If they want this, point them to the card; do not propose it again.';
		case 'applied':
			return 'The user confirmed. A new project named name now holds the listed items, moved out of the Workspace. An attached suggestion is accepted.';
		case 'cancelled':
			return 'The user chose Not now. Nothing changed, and an attached suggestion is dismissed. Do not bring it up again unless the user asks.';
		case 'stale':
			return 'No project was started: the items changed before the user chose. Check the Workspace before proposing again.';
		case 'unknown':
			return 'BuildOS could not confirm whether the project was started. Ask the user to check before trying again.';
		case 'undone':
			return 'The user undid this. The items are back in the Workspace, and the new project was removed unless something else had been added to it.';
	}
}

const itemsForModel = (items: readonly WorkspaceItemV1[]) =>
	items.map((item) => ({ entity: item.entity, id: item.id, kind: item.kind, title: item.title }));

// ---------------------------------------------------------------------------
// Specs.

export const WORKSPACE_FILE_CARD_SPEC: ProposalCardKindSpecV1<
	WorkspaceFileProposalPayloadV1,
	WorkspaceFileReceiptV1,
	WorkspaceFileUndoReceiptV1
> = {
	kind: 'workspace_file',
	toolName: WORKSPACE_FILE_TOOL_NAME,
	ttlMs: PROPOSAL_CARD_TTL_MS,
	undoTtlMs: PROPOSAL_CARD_UNDO_TTL_MS,
	choices: WORKSPACE_CARD_CHOICES,
	hasPreview: false,
	hasUndoPreview: false,
	parsePayload: parseWorkspaceFilePayload,
	parseReceipt: parseFileReceipt,
	parseUndoReceipt: parseFileUndoReceipt,
	argumentsMatch: fileArgumentsMatch,
	digest: workspaceFileDigest,
	modelView: (payload) => ({
		workspace: payload.workspace,
		target: payload.target,
		items: itemsForModel(payload.items),
		nested_documents: payload.nested_documents,
		suggestion_id: payload.suggestion_id
	}),
	subjects: (payload) => [
		{ role: 'workspace', ...payload.workspace },
		{ role: 'target', ...payload.target }
	],
	describeResolution: describeFileResolution,
	describeUndo: describeFileUndo,
	noteMeaning: fileNoteMeaning
};

export const WORKSPACE_PROJECT_CARD_SPEC: ProposalCardKindSpecV1<
	WorkspaceProjectProposalPayloadV1,
	WorkspaceProjectReceiptV1,
	WorkspaceProjectUndoReceiptV1
> = {
	kind: 'workspace_project',
	toolName: WORKSPACE_PROJECT_TOOL_NAME,
	ttlMs: PROPOSAL_CARD_TTL_MS,
	undoTtlMs: PROPOSAL_CARD_UNDO_TTL_MS,
	choices: WORKSPACE_CARD_CHOICES,
	hasPreview: false,
	hasUndoPreview: false,
	parsePayload: parseWorkspaceProjectPayload,
	parseReceipt: parseProjectReceipt,
	parseUndoReceipt: parseProjectUndoReceipt,
	argumentsMatch: projectArgumentsMatch,
	digest: workspaceProjectDigest,
	modelView: (payload) => ({
		workspace: payload.workspace,
		name: payload.name,
		description: payload.description,
		items: itemsForModel(payload.items),
		nested_documents: payload.nested_documents,
		suggestion_id: payload.suggestion_id
	}),
	subjects: (payload) => [{ role: 'workspace', ...payload.workspace }],
	describeResolution: describeProjectResolution,
	describeUndo: describeProjectUndo,
	noteMeaning: projectNoteMeaning
};
