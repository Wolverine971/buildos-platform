// apps/web/src/lib/components/agent/freshness-radar-card.ts
/**
 * Freshness radar chat card (Tasker 88, docs/architecture/jev-freshness-radar-v1-plan.md §3, §5).
 *
 * The worker injects one assistant `chat_messages` row per scan whose metadata carries the
 * card payload. This module reads that row into a UI message, derives the card's live state
 * from the scan-status route, and wraps the card's four network actions. It is pure apart from
 * the fetch helpers so the card component stays a thin view.
 */
import {
	parseFreshnessCardPayloadV1,
	type FreshnessCardPayloadV1,
	type FreshnessDisposition,
	type FreshnessFlagStatus,
	type FreshnessScanStatusV1,
	type FreshnessUndoResultV1,
	type ProjectSuggestionStatus
} from '@buildos/shared-types';
import type { UIMessage } from './agent-chat.types';

export const FRESHNESS_CARD_SOURCE = 'freshness_radar';
export const FRESHNESS_CARD_KIND = 'freshness_radar_card';
/** Retired inbox items can be restored for the same 72 hours as auto-applied changes (plan §4, §6). */
export const FRESHNESS_UNDO_WINDOW_MS = 72 * 60 * 60 * 1000;

type CardItem = FreshnessCardPayloadV1['items'][number];
export type FreshnessCardEntityKind = CardItem['entity']['kind'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True for the worker-injected card row, whether or not its payload parses. */
export function isFreshnessCardMetadata(metadata: unknown): boolean {
	return (
		isRecord(metadata) &&
		metadata.source === FRESHNESS_CARD_SOURCE &&
		metadata.kind === FRESHNESS_CARD_KIND
	);
}

/** The card payload of an injected row, or null when the row is not a (valid) card. */
export function readFreshnessCardFromMetadata(metadata: unknown): FreshnessCardPayloadV1 | null {
	if (!isFreshnessCardMetadata(metadata)) return null;
	return parseFreshnessCardPayloadV1((metadata as Record<string, unknown>).card);
}

export function freshnessScanIdFromMetadata(metadata: unknown): string | null {
	if (!isFreshnessCardMetadata(metadata)) return null;
	const scanId = (metadata as Record<string, unknown>).freshness_scan_id;
	return typeof scanId === 'string' && scanId ? scanId : null;
}

type CardRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	content?: string | null;
	created_at?: string | null;
	metadata?: unknown;
};

/**
 * Map an injected card row to its chat message. Rows whose payload does not parse fall back
 * to an ordinary assistant bubble: the worker writes a factual text body for exactly this case.
 */
export function buildFreshnessCardUIMessage(row: CardRow): UIMessage {
	const card = readFreshnessCardFromMetadata(row.metadata);
	const metadata = isRecord(row.metadata) ? row.metadata : undefined;
	return {
		id: row.id,
		session_id: row.session_id ?? undefined,
		user_id: row.user_id ?? undefined,
		role: 'assistant',
		type: card ? 'freshness_card' : 'assistant',
		content: row.content ?? '',
		created_at: row.created_at ?? undefined,
		timestamp: row.created_at ? new Date(row.created_at) : new Date(),
		metadata,
		...(card ? { data: { card } } : {})
	};
}

export function formatFreshnessPercent(probability: number): string {
	const clamped = Number.isFinite(probability) ? Math.min(1, Math.max(0, probability)) : 0;
	return `${Math.round(clamped * 100)}%`;
}

export const FRESHNESS_KIND_LABEL: Record<FreshnessCardEntityKind, string> = {
	task: 'Task',
	document: 'Document',
	goal: 'Goal',
	milestone: 'Milestone'
};

export function freshnessEntityHref(
	projectId: string,
	entity: { kind: FreshnessCardEntityKind; id: string }
): string {
	const project = encodeURIComponent(projectId);
	const id = encodeURIComponent(entity.id);
	if (entity.kind === 'document') return `/projects/${project}?doc=${id}`;
	return `/projects/${project}?entity=${entity.kind}&entity_id=${id}`;
}

export function draftInChatPromptFor(item: CardItem): string {
	const prompt = item.draftInChatPrompt?.trim();
	if (prompt) return prompt;
	return `Update "${item.entity.title}" to reflect what I just said.`;
}

/** The card is a lead to investigate, not authority that an entity is still stale. */
export function reviewDeeperPromptFor(card: FreshnessCardPayloadV1): string {
	const leads = card.items
		.slice(0, 5)
		.map((item) => `- ${item.entity.kind}: "${item.entity.title.slice(0, 180)}"`)
		.join('\n');
	const date = new Date(card.createdAt);
	const checkedAt = Number.isFinite(date.getTime())
		? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
		: 'this conversation';
	return `Review this project's current state, priorities, and risks in light of the freshness check from ${checkedAt}. Verify what is still relevant against current project context; these flags may already be resolved. Recommend the next steps without making changes.${leads ? `\n\nItems to investigate:\n${leads}` : ''}`;
}

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------

export type FreshnessItemState =
	| 'open'
	| 'updated'
	| 'not_stale'
	| 'undone'
	| 'changed'
	| 'replaced'
	| 'expired';

export const FRESHNESS_ITEM_STATE_LABEL: Record<Exclude<FreshnessItemState, 'open'>, string> = {
	updated: 'Updated',
	not_stale: 'Marked current',
	undone: 'Undone',
	changed: 'Changed since',
	replaced: 'Replaced by a newer check',
	expired: 'Expired'
};

export function freshnessItemState(
	status: FreshnessFlagStatus | null | undefined
): FreshnessItemState {
	switch (status) {
		case 'applied':
			return 'updated';
		case 'dismissed':
			return 'not_stale';
		case 'undone':
			return 'undone';
		case 'resolved_by_change':
			return 'changed';
		case 'superseded':
			return 'replaced';
		case 'expired':
			return 'expired';
		default:
			return 'open';
	}
}

export type FreshnessBundleState =
	| 'none'
	| 'pending'
	| 'applying'
	| 'applied'
	| 'failed'
	| 'dismissed'
	| 'replaced';

export function freshnessBundleState(
	status: ProjectSuggestionStatus | null | undefined
): FreshnessBundleState {
	switch (status) {
		case 'pending':
			return 'pending';
		case 'approved':
			return 'applying';
		case 'applied':
			return 'applied';
		case 'failed':
			return 'failed';
		case 'superseded':
			return 'replaced';
		case 'rejected':
		case 'addressed':
		case 'delegated':
			return 'dismissed';
		default:
			return 'none';
	}
}

export type FreshnessFlagView = {
	status: FreshnessFlagStatus;
	disposition: FreshnessDisposition | null;
	undoable: boolean;
};

/**
 * The effective per-flag view: a local action result wins over the last fetched status,
 * which wins over the payload's own (open) state.
 */
export function freshnessFlagView(
	flagId: string,
	status: FreshnessScanStatusV1 | null,
	local: Record<string, FreshnessFlagStatus>
): FreshnessFlagView {
	const fetched = status?.flags[flagId];
	const localStatus = local[flagId];
	const effective = localStatus ?? fetched?.status ?? 'open';
	return {
		status: effective,
		disposition: fetched?.disposition ?? null,
		undoable: localStatus ? false : (fetched?.undoable ?? true)
	};
}

/** Whether an undo line still offers Undo: inside the window and at least one flag undoable. */
export function hasUndoableFlags(params: {
	flagIds: string[];
	status: FreshnessScanStatusV1 | null;
	local: Record<string, FreshnessFlagStatus>;
	undoableUntil: string | null;
	now: number;
}): boolean {
	if (params.flagIds.length === 0) return false;
	const until = params.undoableUntil ? Date.parse(params.undoableUntil) : NaN;
	if (Number.isFinite(until) && params.now >= until) return false;
	return params.flagIds.some((flagId) => {
		const view = freshnessFlagView(flagId, params.status, params.local);
		return view.undoable && (view.status === 'open' || view.status === 'applied');
	});
}

/** Latest undo deadline of the auto-applied rows (they share one scan, so usually equal). */
export function autoAppliedUndoableUntil(card: FreshnessCardPayloadV1): string | null {
	let latest: number | null = null;
	for (const row of card.autoApplied) {
		const ms = Date.parse(row.undoableUntil);
		if (Number.isFinite(ms) && (latest === null || ms > latest)) latest = ms;
	}
	return latest === null ? null : new Date(latest).toISOString();
}

/** Retired inbox items share the 72-hour window, counted from the scan's card. */
export function retiredUndoableUntil(card: FreshnessCardPayloadV1): string | null {
	const created = Date.parse(card.createdAt);
	return Number.isFinite(created)
		? new Date(created + FRESHNESS_UNDO_WINDOW_MS).toISOString()
		: null;
}

/**
 * Operations still in the bundle: the payload's count minus drafted card items the user has
 * since marked current (each "Not out of date" rebuilds the bundle without that op).
 */
export function remainingBundleOperationCount(
	card: FreshnessCardPayloadV1,
	status: FreshnessScanStatusV1 | null,
	local: Record<string, FreshnessFlagStatus>
): number {
	if (!card.bundle) return 0;
	const removed = card.items.filter(
		(item) =>
			item.disposition === 'drafted' &&
			item.proposal !== null &&
			freshnessFlagView(item.flagId, status, local).status === 'dismissed'
	).length;
	return Math.max(0, card.bundle.operationCount - removed);
}

// ---------------------------------------------------------------------------
// Network actions (JSON routes use ApiResponse: { success, data } | { success:false, error })
// ---------------------------------------------------------------------------

export class FreshnessActionError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'FreshnessActionError';
	}
}

async function readApiData<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as {
		success?: boolean;
		data?: T;
		error?: string;
		message?: string;
	} | null;
	if (!response.ok || !body?.success) {
		throw new FreshnessActionError(
			body?.error || body?.message || 'Something went wrong. Try again.',
			response.status
		);
	}
	return body.data as T;
}

function freshnessBase(projectId: string): string {
	return `/api/onto/projects/${encodeURIComponent(projectId)}/freshness`;
}

function postJson(fetchFn: typeof fetch, url: string, body: unknown): Promise<Response> {
	return fetchFn(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export async function fetchFreshnessScanStatus(
	projectId: string,
	scanId: string,
	options: { fetchFn?: typeof fetch; signal?: AbortSignal } = {}
): Promise<FreshnessScanStatusV1> {
	const fetchFn = options.fetchFn ?? fetch;
	const response = await fetchFn(
		`${freshnessBase(projectId)}/scans/${encodeURIComponent(scanId)}`,
		{ cache: 'no-store', signal: options.signal }
	);
	return readApiData<FreshnessScanStatusV1>(response);
}

export type FreshnessBundleApproval = {
	status: ProjectSuggestionStatus | null;
	appliedOperations: number | null;
	failed: boolean;
	superseded: boolean;
	alreadyDecided: boolean;
};

/** "Update these": the existing suggestion approve route (plan §5), unchanged. */
export async function approveFreshnessBundle(
	projectId: string,
	suggestionId: string,
	fetchFn: typeof fetch = fetch
): Promise<FreshnessBundleApproval> {
	const response = await postJson(
		fetchFn,
		`/api/onto/projects/${encodeURIComponent(projectId)}/suggestions/${encodeURIComponent(suggestionId)}`,
		{ action: 'approve' }
	);
	const data = await readApiData<{
		suggestion?: { status?: ProjectSuggestionStatus };
		result?: { ok?: boolean; applied_operations?: number };
		superseded?: boolean;
		alreadyDecided?: boolean;
	}>(response);
	const status = data?.suggestion?.status ?? null;
	return {
		status,
		appliedOperations:
			typeof data?.result?.applied_operations === 'number'
				? data.result.applied_operations
				: null,
		failed: status === 'failed' || data?.result?.ok === false,
		superseded: data?.superseded === true || status === 'superseded',
		alreadyDecided: data?.alreadyDecided === true
	};
}

export async function undoFreshnessScan(
	projectId: string,
	scanId: string,
	flagIds: string[] | undefined,
	fetchFn: typeof fetch = fetch
): Promise<FreshnessUndoResultV1> {
	const response = await postJson(
		fetchFn,
		`${freshnessBase(projectId)}/scans/${encodeURIComponent(scanId)}/undo`,
		flagIds ? { flag_ids: flagIds } : {}
	);
	return readApiData<FreshnessUndoResultV1>(response);
}

export async function markFreshnessFlagNotStale(
	projectId: string,
	flagId: string,
	fetchFn: typeof fetch = fetch
): Promise<{ flagStatus: FreshnessFlagStatus; suggestionId: string | null }> {
	const response = await postJson(
		fetchFn,
		`${freshnessBase(projectId)}/flags/${encodeURIComponent(flagId)}`,
		{ action: 'not_stale' }
	);
	const data = await readApiData<{
		flag?: { status?: FreshnessFlagStatus };
		suggestionId?: string | null;
	}>(response);
	return {
		flagStatus: data?.flag?.status ?? 'dismissed',
		suggestionId: typeof data?.suggestionId === 'string' ? data.suggestionId : null
	};
}

/** One sentence for the undo toast/status line. */
export function describeUndoResult(result: FreshnessUndoResultV1, noun: string): string {
	const undone = result.undone.length;
	const changed = result.skipped.filter((row) => row.reason === 'changed_since').length;
	const expired = result.skipped.filter((row) => row.reason === 'window_expired').length;
	const failed = result.skipped.filter(
		(row) => row.reason === 'execution_failed' || row.reason === 'forbidden'
	).length;
	const parts: string[] = [];
	if (undone > 0) parts.push(`Undid ${undone} ${noun}${undone === 1 ? '' : 's'}`);
	if (changed > 0) parts.push(`${changed} changed since, left as is`);
	if (expired > 0) parts.push(`${expired} past the undo window`);
	if (failed > 0) parts.push(`${failed} could not be undone`);
	if (parts.length === 0) {
		return result.skipped.some((row) => row.reason === 'already_undone')
			? 'Already undone'
			: 'Nothing to undo';
	}
	return parts.join(' · ');
}
