// apps/mobile/src/lib/chat/proposals.ts
/**
 * Proposal cards: the agent proposes a structural change (nest a project, combine two,
 * file loose Workspace items into a project, start a project from them) and waits for a
 * tap. The card travels inside a `tool_result` as a `ProposalCardEnvelopeV1`
 * (packages/shared-agent-ops/src/chat-cards/proposal-card.ts). This file reads that
 * contract structurally (no runtime dependency on the package) and turns the payload into
 * the card's words. A field the phone does not know is simply not shown.
 */
import type {
	ProposalCardKind,
	ProposalCardResolution,
	ProposalCardUndo
} from '@buildos/api-client';

export type ProposalCard = {
	card_id: string;
	kind: ProposalCardKind;
	session_id: string;
	expires_at: string;
	payload: Record<string, unknown>;
	/** The model's line ("Needs your choice"); the title and lines below are the person's. */
	message: string;
	card_resolution: ProposalCardResolution | null;
	card_undo: ProposalCardUndo | null;
};

export type ProposalState = 'pending' | 'expired' | 'applied' | 'cancelled' | 'stale' | 'undone';

const KINDS: readonly ProposalCardKind[] = [
	'project_parent',
	'project_combine',
	'workspace_file',
	'workspace_project'
];

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}
function name(value: unknown): string | null {
	return text(record(value)?.name);
}

export function parseProposalCard(value: unknown): ProposalCard | null {
	const root = record(value);
	if (
		!root ||
		root.card_rail !== 'proposal_v1' ||
		root.status !== 'proposal_ready' ||
		root.requires_user_action !== true ||
		root.saved !== false
	) {
		return null;
	}
	const cardId = text(root.card_id);
	const kind = KINDS.find((candidate) => candidate === root.kind) ?? null;
	const action = record(root.client_action);
	if (
		!cardId ||
		!kind ||
		!action ||
		action.kind !== 'proposal_card' ||
		action.card_id !== cardId ||
		action.card_kind !== kind
	) {
		return null;
	}
	const sessionId = text(action.session_id);
	const expiresAt = text(action.expires_at);
	if (!sessionId || !expiresAt) return null;
	const resolution = record(root.card_resolution);
	const undo = record(root.card_undo);
	return {
		card_id: cardId,
		kind,
		session_id: sessionId,
		expires_at: expiresAt,
		payload: record(action.payload) ?? {},
		message: typeof root.message === 'string' ? root.message : '',
		card_resolution:
			resolution && text(resolution.outcome)
				? (resolution as unknown as ProposalCardResolution)
				: null,
		card_undo: undo && text(undo.outcome) ? (undo as unknown as ProposalCardUndo) : null
	};
}

/** How far a copy of the card has got: an undo outranks a decision, which outranks none. */
export function proposalProgress(card: ProposalCard): number {
	return card.card_undo ? 2 : card.card_resolution ? 1 : 0;
}

export function proposalState(card: ProposalCard, now: number = Date.now()): ProposalState {
	if (card.card_undo) return card.card_undo.outcome === 'undone' ? 'undone' : 'stale';
	if (card.card_resolution) {
		const outcome = card.card_resolution.outcome;
		return outcome === 'applied' ? 'applied' : outcome === 'cancelled' ? 'cancelled' : 'stale';
	}
	const expires = Date.parse(card.expires_at);
	return Number.isFinite(expires) && expires <= now ? 'expired' : 'pending';
}

function plural(count: number, word: string): string {
	return `${count} ${count === 1 ? word : `${word}s`}`;
}

function items(payload: Record<string, unknown>): Array<{ title: string }> {
	const list = Array.isArray(payload.items) ? payload.items : [];
	return list.flatMap((item) => {
		const title = text(record(item)?.title);
		return title ? [{ title }] : [];
	});
}

/** The card's headline, the website's wording. */
export function proposalTitle(card: ProposalCard): string {
	const p = card.payload;
	switch (card.kind) {
		case 'workspace_file': {
			const list = items(p);
			const what = list.length === 1 ? `“${list[0]!.title}”` : plural(list.length, 'item');
			return `File ${what} into ${name(p.target) ?? 'a project'}`;
		}
		case 'workspace_project':
			return `Start ${text(p.name) ?? 'a project'} from ${plural(items(p).length, 'Workspace item')}`;
		case 'project_parent': {
			const project = name(p.project) ?? 'this project';
			return p.action === 'detach'
				? `Take ${project} out of ${name(p.from_parent) ?? 'its parent'}`
				: `Put ${project} inside ${name(p.to_parent) ?? 'another project'}`;
		}
		case 'project_combine':
			return `Combine ${name(p.source) ?? 'a project'} into ${name(p.destination) ?? 'another'}`;
	}
}

/** A few plain lines under the title: what is in it, what to know. */
export function proposalLines(card: ProposalCard): string[] {
	const p = card.payload;
	const lines: string[] = [];
	switch (card.kind) {
		case 'workspace_file':
		case 'workspace_project': {
			const list = items(p);
			if (list.length > 1) {
				const shown = list.slice(0, 3).map((item) => item.title);
				const more = list.length - shown.length;
				lines.push(shown.join(' · ') + (more > 0 ? ` · ${more} more` : ''));
			}
			const nested = typeof p.nested_documents === 'number' ? p.nested_documents : 0;
			if (nested > 0) lines.push(`${plural(nested, 'nested doc')} come along.`);
			const reason = text(p.reason) ?? text(p.description);
			if (reason) lines.push(reason);
			break;
		}
		case 'project_parent': {
			const members = record(p.child_only_members);
			const count = typeof members?.count === 'number' ? members.count : 0;
			if (count > 0) {
				lines.push(
					p.action === 'detach'
						? `${plural(count, 'person')} on the parent lose access.`
						: `${plural(count, 'person')} on the parent gain access.`
				);
			}
			const note = text(p.note);
			if (note) lines.push(note);
			break;
		}
		case 'project_combine': {
			const counts = record(p.counts);
			const parts = counts
				? Object.entries(counts)
						.filter(([, value]) => typeof value === 'number' && value > 0)
						.map(([key, value]) => plural(value as number, key.replace(/_/g, ' ')))
				: [];
			if (parts.length) lines.push(`Moves ${parts.join(', ')}.`);
			lines.push('Combining has a preview and member choices; review it on the web.');
			break;
		}
	}
	return lines;
}

/** The main key's words, or null when the phone sends the person to the web (combine). */
export function proposalMainLabel(card: ProposalCard): string | null {
	const p = card.payload;
	switch (card.kind) {
		case 'workspace_file':
			return items(p).length === 1 ? 'File it' : 'File them';
		case 'workspace_project':
			return 'Start the project';
		case 'project_parent':
			return p.action === 'detach'
				? 'Take it out'
				: `Move under ${name(p.to_parent) ?? 'parent'}`;
		case 'project_combine':
			return null;
	}
}

export function proposalStateLabel(state: ProposalState): string | null {
	switch (state) {
		case 'applied':
			return 'Applied';
		case 'cancelled':
			return 'Not applied';
		case 'stale':
			return 'No longer applies';
		case 'undone':
			return 'Undone';
		case 'expired':
			return 'This proposal has expired';
		case 'pending':
			return null;
	}
}

/** What "Finish it" on the pending-change strip sends: the website's exact message. */
export const PENDING_CHANGE_FINISH_MESSAGE = "Finish the changes that didn't go through earlier.";
