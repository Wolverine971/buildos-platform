// apps/web/src/lib/utils/agent-chat-resume.ts
export function readChatResumeSessionId(url: URL): string | null {
	const value = url.searchParams.get('chat');
	// Structural UUID validation only; never infer intent from chat text.
	return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
		? value.toLowerCase()
		: null;
}
