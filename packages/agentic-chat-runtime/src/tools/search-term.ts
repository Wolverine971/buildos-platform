// packages/agentic-chat-runtime/src/tools/search-term.ts
/** Shared cleanup used by both direct ontology reads and cross-entity search. */
export function prepareAgenticChatSearchTerm(term?: string): string {
	if (!term) return '';
	return term.replace(/%/g, '').replace(/,/g, ' ').trim();
}
