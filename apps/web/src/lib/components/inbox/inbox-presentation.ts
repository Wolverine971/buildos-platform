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
