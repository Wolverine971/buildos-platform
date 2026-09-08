// apps/web/src/lib/services/agentic-chat-v2/focused-document-context.ts
// Keep the primary document useful on the first model pass, while bounding large bodies.
export const FOCUSED_DOCUMENT_CONTENT_MAX_CHARS = 16_000;

export function buildFocusedDocumentContent(content: string | null) {
	return {
		content_length: content?.length ?? null,
		content_preview: content?.slice(0, FOCUSED_DOCUMENT_CONTENT_MAX_CHARS) ?? null,
		content_truncated: content !== null && content.length > FOCUSED_DOCUMENT_CONTENT_MAX_CHARS
	};
}
