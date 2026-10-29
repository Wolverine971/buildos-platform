// apps/web/src/lib/components/inbox/inbox-presentation.ts
export function formatInboxAttentionSummary(params: {
	loaded: number;
	total: number;
	held: number;
}): string {
	const total = Math.max(0, params.total);
	const loaded = Math.max(0, params.loaded);
	const held = Math.max(0, params.held);

	if (total === 0) {
		return held > 0 ? `No items need attention · ${held} held for later` : 'Inbox is clear';
	}

	const attention =
		loaded < total
			? `Showing ${loaded} of ${total} needing attention`
			: `${total} ${total === 1 ? 'item needs' : 'items need'} attention`;

	return held > 0 ? `${attention} · ${held} held for later` : attention;
}

const INBOX_SOURCE_LABELS: Record<string, string> = {
	agent_run: 'Agent proposal',
	project_review: 'Project manager brief',
	project_audit: 'Project audit',
	project_cleanup: 'Project cleanup',
	calendar_suggestion: 'Calendar suggestion',
	integration_attention: 'Gmail access',
	project_suggestion: 'Project review'
};

/** The eyebrow label an AI Inbox item shows for where it came from. */
export function formatInboxSourceLabel(sourceType: string): string {
	return INBOX_SOURCE_LABELS[sourceType] ?? 'Project review';
}

/** Project states whose cleanup can wait: shown after active work, under their own label. */
const DORMANT_PROJECT_STATES = new Set(['paused', 'completed', 'cancelled', 'archived']);

export function isDormantProjectState(stateKey: string | null | undefined): boolean {
	return Boolean(stateKey && DORMANT_PROJECT_STATES.has(stateKey));
}

export type InboxGroupOrderInput = {
	key: string;
	/** null for account-level items (e.g. Gmail reconnect). */
	projectId: string | null;
	projectState?: string | null;
	projectUpdatedAt?: string | null;
	/** Active on paper but nothing has changed in weeks ("Still on?" check-in). */
	quiet?: boolean;
};

/**
 * Account items first (they block everything), then projects you are working in, most
 * recently touched first, then projects that have gone quiet, then paused or finished
 * projects. Ties keep the server's order.
 */
export function orderInboxGroups<T extends InboxGroupOrderInput>(groups: T[]): T[] {
	const rank = (group: T) =>
		group.projectId === null
			? 0
			: isDormantProjectState(group.projectState)
				? 3
				: group.quiet
					? 2
					: 1;
	const touched = (group: T) => {
		const ms = group.projectUpdatedAt ? Date.parse(group.projectUpdatedAt) : NaN;
		return Number.isFinite(ms) ? ms : 0;
	};
	return groups
		.map((group, index) => ({ group, index }))
		.sort(
			(a, b) =>
				rank(a.group) - rank(b.group) ||
				touched(b.group) - touched(a.group) ||
				a.index - b.index
		)
		.map(({ group }) => group);
}

/**
 * The rail's second line for a project. A cleanup card is one inbox row but many items, so
 * "1 need attention" said nothing; this says what is waiting: "4 need you · 10 ready".
 * Check-ins lead: "10 to confirm · 4 need you · 10 ready", or "Still on?" for a quiet project.
 */
export function formatInboxGroupWorkload(params: {
	itemCount: number;
	cleanupCounts?: { safe_cleanup: number; needs_call: number; note: number } | null;
	checkIns?: { toConfirm: number; quiet?: boolean } | null;
}): string {
	const checkIns = params.checkIns;
	const checkInPart = checkIns
		? checkIns.quiet
			? 'Still on?'
			: checkIns.toConfirm > 0
				? `${checkIns.toConfirm} to confirm`
				: null
		: null;
	if (checkInPart) {
		const rest =
			params.itemCount > 0
				? formatInboxGroupWorkload({
						itemCount: params.itemCount,
						cleanupCounts: params.cleanupCounts
					})
				: null;
		return rest ? `${checkInPart} · ${rest}` : checkInPart;
	}
	const counts = params.cleanupCounts;
	if (counts) {
		const extra = Math.max(0, params.itemCount - 1);
		const parts = [
			counts.needs_call
				? `${counts.needs_call} need${counts.needs_call === 1 ? 's' : ''} you`
				: null,
			counts.safe_cleanup ? `${counts.safe_cleanup} ready` : null,
			!counts.needs_call && !counts.safe_cleanup && counts.note
				? `${counts.note} to know`
				: null,
			extra ? `${extra} more` : null
		].filter(Boolean);
		if (parts.length) return parts.join(' · ');
	}
	const count = Math.max(0, params.itemCount);
	return `${count} need${count === 1 ? 's' : ''} attention`;
}
