// apps/web/src/lib/components/agent/proposal-cards.ts
//
// Browser half of the proposal-card rail (tasker 122, WP4/WP5). A propose_*
// tool's result is a card envelope (`card_rail: 'proposal_v1'`); it arrives on
// a live tool result or a restored tool execution, renders under the assistant
// reply that showed it, and the user's click goes to
// POST /api/chat/proposal-cards/[id]. Only the card id, its session, the
// choice and the digest of what the card showed leave the browser.
//
// Everything here reads structured fields only (the rail, the kind registry,
// ids, counts and codes); the copy is built from those fields.
import {
	PROPOSAL_CARD_RAIL,
	PROPOSAL_CARD_READY_STATUS,
	parseProposalCardEnvelope,
	parseProposalCardResolution,
	parseProposalCardUndo,
	proposalCardSpec,
	type ProposalCardEnvelopeV1,
	type ProposalCardOutcome,
	type ProposalCardResolutionV1,
	type ProposalCardUndoOutcome,
	type ProposalCardUndoV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import type {
	ProjectParentProposalPayloadV1,
	ProjectParentChoice
} from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
import type {
	ProjectCombineChoice,
	ProjectCombineCountKey,
	ProjectCombineProposalPayloadV1,
	ProjectCombineUndoViewV1
} from '@buildos/shared-agent-ops/chat-cards/project-combine-card';
import type {
	WorkspaceCardChoice,
	WorkspaceFileProposalPayloadV1,
	WorkspaceProjectProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

export type ProposalCardChoice = ProjectParentChoice | ProjectCombineChoice | WorkspaceCardChoice;

/** A card was decided or undone by the user's click (open views refresh). */
export type ProposalCardResolvedEvent = {
	card: ProposalCardEnvelopeV1;
	phase: 'decide' | 'undo';
	outcome: ProposalCardOutcome | ProposalCardUndoOutcome;
	/** Every project the card names, so their open views refresh. */
	projectIds: string[];
};

export function proposalCardProjectIds(card: ProposalCardEnvelopeV1): string[] {
	const subjects = proposalCardSpec(card.kind).subjects(card.client_action.payload);
	return [...new Set(subjects.map((subject) => subject.id))];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

// ---------------------------------------------------------------------------
// Finding cards in tool results and placing them under the reply.

/** The card envelope, however deep the transport nested it. Keyed on the rail. */
function findCardEnvelope(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 4) return null;
	const record = asRecord(value);
	if (!record) return null;
	if (record.card_rail === PROPOSAL_CARD_RAIL && record.status === PROPOSAL_CARD_READY_STATUS)
		return record;
	return findCardEnvelope(record.result, depth + 1) ?? findCardEnvelope(record.data, depth + 1);
}

export function extractProposalCard(activity: ActivityEntry): ProposalCardEnvelopeV1 | null {
	if (activity.status !== 'completed') return null;
	const envelope =
		findCardEnvelope(activity.metadata?.result) ??
		findCardEnvelope(activity.metadata?.response) ??
		findCardEnvelope(activity.metadata);
	return envelope ? parseProposalCardEnvelope(envelope) : null;
}

/** How far a copy of the card has got: an undo outranks a decision, which outranks none. */
function progress(card: ProposalCardEnvelopeV1): number {
	return card.card_undo ? 2 : card.card_resolution ? 1 : 0;
}

export function collectProposalCards(
	activities: readonly ActivityEntry[]
): ProposalCardEnvelopeV1[] {
	const cards = new Map<string, ProposalCardEnvelopeV1>();
	for (const activity of activities) {
		const card = extractProposalCard(activity);
		if (!card) continue;
		const seen = cards.get(card.card_id);
		cards.set(card.card_id, seen && progress(seen) > progress(card) ? seen : card);
	}
	return [...cards.values()];
}

export type ProposalCardPlacement = {
	cards: ProposalCardEnvelopeV1[];
	/** The reply that showed the cards is still streaming. */
	turnActive: boolean;
};

/**
 * Cards keyed by the message they render under: the last assistant reply of
 * the turn whose thinking block produced them, or the thinking block itself
 * while that reply has not started. (Same rule as the shared-doc card.)
 */
export function placeProposalCards(
	messages: readonly UIMessage[]
): Map<string, ProposalCardPlacement> {
	const placements = new Map<string, ProposalCardPlacement>();
	let pending: (ProposalCardPlacement & { anchor: string }) | null = null;
	const flush = () => {
		if (pending && pending.cards.length > 0) {
			const existing = placements.get(pending.anchor);
			placements.set(pending.anchor, {
				cards: [...(existing?.cards ?? []), ...pending.cards],
				turnActive: Boolean(existing?.turnActive) || pending.turnActive
			});
		}
		pending = null;
	};
	for (const message of messages) {
		if (message.type === 'thinking_block') {
			flush();
			const block = message as ThinkingBlockMessage;
			const cards = collectProposalCards(block.activities ?? []);
			if (cards.length > 0)
				pending = { cards, turnActive: block.status === 'active', anchor: block.id };
		} else if (message.type === 'assistant') {
			if (pending) pending.anchor = message.id;
		} else if (message.type === 'user') {
			flush();
		}
	}
	flush();
	return placements;
}

// ---------------------------------------------------------------------------
// Requests.

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const NETWORK_MESSAGE = 'Couldn’t reach BuildOS. Check your connection and try again.';
const FALLBACK_MESSAGE = 'That didn’t go through. Nothing changed; try again.';

/** A fresh view the server sent with a refusal (PREVIEW_CHANGED and friends). */
export type ProposalFreshView = { view: unknown; digest: string };

export type ProposalCardRequestFailure = {
	status: 'error';
	code: string | null;
	message: string;
	fresh: ProposalFreshView | null;
	/** The card was already decided (a preview answered ALREADY_RESOLVED). */
	resolution: ProposalCardResolutionV1 | null;
	/** The card was already undone. */
	undo: ProposalCardUndoV1 | null;
};

export type ProposalChooseResult =
	| { status: 'resolved'; resolution: ProposalCardResolutionV1 }
	| ProposalCardRequestFailure;
export type ProposalUndoResult =
	| { status: 'undone'; undo: ProposalCardUndoV1 }
	| ProposalCardRequestFailure;
export type ProposalPreviewResult =
	| { status: 'ok'; view: unknown; digest: string }
	| ProposalCardRequestFailure;

type CardRef = Pick<ProposalCardEnvelopeV1, 'card_id' | 'kind'> & {
	client_action: Pick<ProposalCardEnvelopeV1['client_action'], 'session_id'>;
};

/** Codes after which the card can't be used (it expired or is gone). */
export const PROPOSAL_CARD_CLOSED_CODES: ReadonlySet<string> = new Set([
	'CARD_EXPIRED',
	'CARD_NOT_FOUND'
]);

function freshFrom(details: Record<string, unknown> | null): ProposalFreshView | null {
	const digest = details?.digest;
	if (!details || !('view' in details) || typeof digest !== 'string') return null;
	return DIGEST_PATTERN.test(digest) ? { view: details.view, digest } : null;
}

async function send(
	url: string,
	init: RequestInit,
	fetchImpl: typeof fetch
): Promise<{ ok: boolean; payload: Record<string, unknown> | null } | null> {
	try {
		const response = await fetchImpl(url, init);
		const payload = asRecord(await response.json().catch(() => null));
		return { ok: response.ok, payload };
	} catch {
		return null;
	}
}

function failureFrom(
	card: CardRef,
	reply: { ok: boolean; payload: Record<string, unknown> | null } | null
): ProposalCardRequestFailure {
	if (!reply)
		return {
			status: 'error',
			code: null,
			message: NETWORK_MESSAGE,
			fresh: null,
			resolution: null,
			undo: null
		};
	const payload = reply.payload;
	const details = asRecord(payload?.details);
	const expected = { cardId: card.card_id, kind: card.kind };
	return {
		status: 'error',
		code: typeof payload?.code === 'string' ? payload.code : null,
		message:
			typeof payload?.error === 'string' && payload.error ? payload.error : FALLBACK_MESSAGE,
		fresh: freshFrom(details),
		resolution: parseProposalCardResolution(details?.resolution, expected),
		undo: parseProposalCardUndo(details?.undo, expected)
	};
}

function cardUrl(card: CardRef, suffix = ''): string {
	return `/api/chat/proposal-cards/${encodeURIComponent(card.card_id)}${suffix}`;
}

/** The user's choice. `seenDigest` is the visibleDigest of what the card showed. */
export async function chooseProposalCard(
	card: CardRef,
	choice: ProposalCardChoice,
	seenDigest: string | null,
	fetchImpl: typeof fetch = fetch
): Promise<ProposalChooseResult> {
	const reply = await send(
		cardUrl(card),
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				choice,
				session_id: card.client_action.session_id,
				...(seenDigest ? { seen_digest: seenDigest } : {})
			})
		},
		fetchImpl
	);
	const data = asRecord(reply?.payload?.data);
	const resolution = parseProposalCardResolution(data?.resolution, {
		cardId: card.card_id,
		kind: card.kind
	});
	if (reply?.ok && reply.payload?.success === true && resolution)
		return { status: 'resolved', resolution };
	return failureFrom(card, reply);
}

export async function undoProposalCard(
	card: CardRef,
	seenDigest: string | null,
	fetchImpl: typeof fetch = fetch
): Promise<ProposalUndoResult> {
	const reply = await send(
		cardUrl(card, '/undo'),
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				session_id: card.client_action.session_id,
				...(seenDigest ? { seen_digest: seenDigest } : {})
			})
		},
		fetchImpl
	);
	const data = asRecord(reply?.payload?.data);
	const undo = parseProposalCardUndo(data?.undo, { cardId: card.card_id, kind: card.kind });
	if (reply?.ok && reply.payload?.success === true && undo) return { status: 'undone', undo };
	return failureFrom(card, reply);
}

async function getView(
	card: CardRef,
	suffix: '/preview' | '/undo-preview',
	fetchImpl: typeof fetch
): Promise<ProposalPreviewResult> {
	const query = `?session_id=${encodeURIComponent(card.client_action.session_id)}`;
	const reply = await send(cardUrl(card, `${suffix}${query}`), { method: 'GET' }, fetchImpl);
	const fresh = freshFrom(asRecord(reply?.payload?.data));
	if (reply?.ok && reply.payload?.success === true && fresh)
		return { status: 'ok', view: fresh.view, digest: fresh.digest };
	return failureFrom(card, reply);
}

/** "Check again": what the click would do now. Read-only. */
export function previewProposalCard(
	card: CardRef,
	fetchImpl: typeof fetch = fetch
): Promise<ProposalPreviewResult> {
	return getView(card, '/preview', fetchImpl);
}

/** What an Undo would bring back and what stays. Read-only. */
export function undoPreviewProposalCard(
	card: CardRef,
	fetchImpl: typeof fetch = fetch
): Promise<ProposalPreviewResult> {
	return getView(card, '/undo-preview', fetchImpl);
}

/** A fresh decide view, parsed by the kind (null when it doesn't parse). */
export function parseProposalCardView<P>(
	card: Pick<ProposalCardEnvelopeV1, 'kind'>,
	view: unknown
): P | null {
	return (proposalCardSpec(card.kind).parsePayload(view) as P | null) ?? null;
}

/** The combine Undo confirm's view (GET …/undo-preview), checked field by field. */
export function parseCombineUndoView(value: unknown): ProjectCombineUndoViewV1 | null {
	const view = asRecord(value);
	if (!view || view.version !== 1 || typeof view.fold_id !== 'string') return null;
	const source = asRecord(view.source);
	const destination = asRecord(view.destination);
	const returning = asRecord(view.returning);
	if (
		typeof source?.id !== 'string' ||
		typeof source.name !== 'string' ||
		typeof destination?.id !== 'string' ||
		typeof destination.name !== 'string' ||
		!returning ||
		!Array.isArray(view.staying) ||
		!Array.isArray(view.blockers)
	)
		return null;
	const num = (raw: unknown) =>
		typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
	return {
		version: 1,
		fold_id: view.fold_id,
		source: { id: source.id, name: source.name },
		destination: { id: destination.id, name: destination.name },
		returning: Object.fromEntries(
			Object.entries(returning).map(([key, raw]) => [key, num(raw)])
		),
		returning_total: num(view.returning_total),
		staying: view.staying.flatMap((entry) => {
			const item = asRecord(entry);
			return item && typeof item.id === 'string'
				? [
						{
							id: item.id,
							table: typeof item.table === 'string' ? item.table : '',
							reason: typeof item.reason === 'string' ? item.reason : '',
							title: typeof item.title === 'string' ? item.title : null
						}
					]
				: [];
		}),
		staying_total: num(view.staying_total),
		folder_removed: view.folder_removed === true,
		members_added_stay: num(view.members_added_stay),
		unarchive: view.unarchive === true,
		parent_restored_id:
			typeof view.parent_restored_id === 'string' ? view.parent_restored_id : null,
		parent_not_restored: view.parent_not_restored === true,
		blockers: view.blockers.filter((code): code is string => typeof code === 'string'),
		checked_at: typeof view.checked_at === 'string' ? view.checked_at : ''
	};
}

// ---------------------------------------------------------------------------
// Copy. Built from structured fields only.

/** "Alice", "Alice and Bob", "Alice, Bob and Carol", "Alice, Bob and 3 more". */
export function namesLine(names: readonly string[], total = names.length, shown = 3): string {
	const listed = names.slice(0, shown);
	const rest = Math.max(0, total - listed.length);
	if (rest > 0) return `${listed.join(', ')} and ${rest} more`;
	if (listed.length <= 1) return listed.join('');
	return `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function proposalCardTitle(card: ProposalCardEnvelopeV1, payload: unknown): string {
	if (card.kind === 'workspace_file') {
		const file = payload as WorkspaceFileProposalPayloadV1;
		const what =
			file.items.length === 1
				? `“${file.items[0]!.title}”`
				: plural(file.items.length, 'item');
		return `File ${what} into ${file.target.name}`;
	}
	if (card.kind === 'workspace_project') {
		const start = payload as WorkspaceProjectProposalPayloadV1;
		return `Start ${start.name} from ${plural(start.items.length, 'Workspace item')}`;
	}
	if (card.kind === 'project_parent') {
		const nest = payload as ProjectParentProposalPayloadV1;
		return nest.action === 'attach'
			? `Put ${nest.project.name} inside ${nest.to_parent?.name ?? 'another project'}`
			: `Take ${nest.project.name} out of ${nest.from_parent?.name ?? 'its parent'}`;
	}
	const combine = payload as ProjectCombineProposalPayloadV1;
	return `Combine ${combine.source.name} into ${combine.destination.name}`;
}

/** The nest card's plain lines: nothing moves, who sees what. */
export function projectParentLines(payload: ProjectParentProposalPayloadV1): string[] {
	const project = payload.project.name;
	const members = payload.child_only_members;
	const access =
		members.count > 0 && members.names.length > 0
			? `No one gains or loses access. ${namesLine(members.names, members.count)} still ${members.count === 1 ? 'sees' : 'see'} only ${project}.`
			: 'No one gains or loses access.';
	if (payload.action === 'detach') {
		return [
			`Nothing moves. ${project} goes back to the top level.`,
			access,
			`It stops showing ${payload.from_parent?.name ?? 'the parent'}’s shared docs.`
		];
	}
	const parent = payload.to_parent?.name ?? 'the parent';
	const lines = ['Nothing moves. You can take it out any time.', access];
	if (payload.effects.includes('leaves_previous_parent') && payload.from_parent)
		lines.push(`It leaves ${payload.from_parent.name}.`);
	lines.push(`People who can open ${parent} see its shared docs inside ${project}.`);
	if (payload.effects.includes('creates_shared_folder'))
		lines.push(`${parent} gets a “Shared with sub-projects” folder.`);
	return lines;
}

const COUNT_LABELS: Array<[ProjectCombineCountKey, string, string]> = [
	['documents', 'doc', 'docs'],
	['tasks', 'task', 'tasks'],
	['goals', 'goal', 'goals'],
	['plans', 'plan', 'plans'],
	['milestones', 'milestone', 'milestones'],
	['risks', 'risk', 'risks'],
	['requirements', 'requirement', 'requirements'],
	['metrics', 'metric', 'metrics'],
	['insights', 'insight', 'insights'],
	['signals', 'signal', 'signals'],
	['sources', 'source', 'sources'],
	['assets', 'file', 'files'],
	['links', 'link', 'links'],
	['comments', 'comment', 'comments']
];

/** What moves, by kind: "12 docs, 7 tasks and 1 goal". Empty when nothing moves. */
export function combineCountParts(counts: ProjectCombineProposalPayloadV1['counts']): string[] {
	return COUNT_LABELS.filter(([key]) => counts[key] > 0).map(([key, one, many]) =>
		plural(counts[key], one, many)
	);
}

export function joinAnd(parts: readonly string[]): string {
	if (parts.length <= 1) return parts.join('');
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What a combine blocker means, said plainly. Upcoming events have their own list. */
export function foldBlockerText(code: string, payload: ProjectCombineProposalPayloadV1): string {
	const source = payload.source.name;
	switch (code) {
		case 'standalone_events_not_supported':
			return `Upcoming calendar events in ${source} need to be moved or deleted first.`;
		case 'pending_document_proposal':
			return `A suggested document change in ${source} is waiting for a decision.`;
		case 'calendar_sync_not_deployed':
			return 'Dated tasks can’t move yet: calendar sync for combined projects isn’t on.';
		case 'asset_access_not_deployed':
			return 'Files can’t move yet: file access for combined projects isn’t on.';
		case 'recurring_task_not_supported':
		case 'recurring_event_not_supported':
			return `${source} has repeating tasks or events, which can’t move yet.`;
		case 'event_links_not_supported':
			return `Some calendar events in ${source} are linked to other items.`;
		case 'source_has_sub_projects':
			return `${source} has its own sub-projects. Move them out first.`;
		case 'too_many_entities':
		case 'too_many_documents':
		case 'too_many_relationships':
		case 'too_many_embeddings':
		case 'too_many_documents_in_one_folder':
			return `${source} is too big to combine in one step.`;
		default:
			return 'Something in these projects can’t be combined yet.';
	}
}

/** Which choice the main button sends for the combine card. */
export function combineChoiceFor(
	payload: ProjectCombineProposalPayloadV1,
	memberChoice: 'remove' | 'add' | null
): ProjectCombineChoice | null {
	if (payload.members_missing_total === 0) return 'combine';
	if (memberChoice === 'remove')
		return combineMembersRemovable(payload) ? 'combine_remove_members' : null;
	if (memberChoice === 'add') return 'combine_add_members';
	return null;
}

/** Why the combine's main button is off, or null when it can run. */
export function combineBlockedReason(
	payload: ProjectCombineProposalPayloadV1,
	memberChoice: 'remove' | 'add' | null
): 'blocked' | 'member_choice' | null {
	if (payload.blockers.length > 0) return 'blocked';
	if (combineChoiceFor(payload, memberChoice) === null) return 'member_choice';
	return null;
}

/**
 * Whether the people the destination lacks can be removed (owners can't). The
 * list is capped; the server re-checks everyone at click time.
 */
export function combineMembersRemovable(payload: ProjectCombineProposalPayloadV1): boolean {
	return (
		payload.members_missing.length > 0 &&
		payload.members_missing.every((member) => member.removable)
	);
}

/** Who the member choice is about; a fresh view with other people clears the pick. */
export function combineMembersKey(payload: ProjectCombineProposalPayloadV1): string {
	return [
		payload.members_missing_total,
		...payload.members_missing
			.map((member) => `${member.actor_id}:${member.removable ? 1 : 0}`)
			.sort()
	].join('|');
}

export function undoAvailable(
	card: Pick<ProposalCardEnvelopeV1, 'kind'>,
	resolution: ProposalCardResolutionV1 | null,
	undo: ProposalCardUndoV1 | null,
	now: number = Date.now()
): boolean {
	if (!resolution || resolution.outcome !== 'applied' || undo) return false;
	const appliedAt = Date.parse(resolution.resolved_at);
	return Number.isFinite(appliedAt) && now - appliedAt < proposalCardSpec(card.kind).undoTtlMs;
}

const EVENT_FORMAT = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});

export function eventWhen(startAt: string | null): string | null {
	if (!startAt) return null;
	const time = Date.parse(startAt);
	return Number.isFinite(time) ? EVENT_FORMAT.format(new Date(time)) : null;
}

/** The Workspace cards' item glyph and screen-reader word, from structured fields only. */
export function workspaceItemKindLabel(kind: 'note' | 'doc' | 'task'): string {
	return kind === 'task' ? 'task' : kind === 'note' ? 'note' : 'doc';
}

/** "Plus 2 docs filed inside them." (they move with their folder doc), or null. */
export function workspaceNestedLine(nested: number): string | null {
	return nested > 0 ? `Plus ${plural(nested, 'doc')} filed inside them.` : null;
}
