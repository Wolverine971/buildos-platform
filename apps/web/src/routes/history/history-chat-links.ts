// apps/web/src/routes/history/history-chat-links.ts
/** Convert an old History selection into the resume-link path owned by Navigation. */
export function legacyHistoryChatResumeUrl(
	current: URL,
	sessionId: string,
	state: Pick<App.PageState, 'agentChat'>
): URL | null {
	if (current.searchParams.has('chat') || state.agentChat) return null;
	// Streamed history data may arrive after the user navigated or cleared selection.
	if (
		current.pathname !== '/history' ||
		current.searchParams.get('id') !== sessionId ||
		current.searchParams.get('itemType') !== 'chat_session'
	)
		return null;
	const url = new URL(current);
	url.searchParams.delete('id');
	url.searchParams.delete('itemType');
	url.searchParams.set('chat', sessionId);
	return url;
}
