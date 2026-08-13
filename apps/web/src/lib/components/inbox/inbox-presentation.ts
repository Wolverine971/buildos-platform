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
