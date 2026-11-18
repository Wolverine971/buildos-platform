// apps/web/src/lib/components/knowledge/record-knowledge-mentions.svelte.ts
//
// Names in a doc (or chat) that open their knowledge card (tasker 160). A document is linked to
// the people, organizations and places read from it (knowledge_record_links, the viewer's own
// graph only); this loads those links once per doc and turns each into a mention target for
// the entityMentions() attachment, which links the first place the name appears in the rendered
// text. The words come from the entry's name and the quote it was read from, never from parsing
// the prose. Kept free of the knowledge card itself: the popover loads in its own chunk, only
// when a doc has names.

import type { MentionTarget } from '$lib/components/task-entities/entity-mentions';

export type RecordKnowledgeMention = {
	entity_id: string;
	kind: string;
	name: string;
	quote: string | null;
};

/** A quote short enough to read as the name itself ("Dr. Angela Ruiz"), not a sentence. */
const MAX_QUOTE_WORDS_CHARS = 60;

export function mentionTargets(mentions: RecordKnowledgeMention[]): MentionTarget[] {
	return mentions.map((mention) => {
		const words = [mention.name];
		const quote = mention.quote?.trim();
		if (quote && quote.length <= MAX_QUOTE_WORDS_CHARS && quote !== mention.name) {
			words.push(quote);
		}
		return {
			id: mention.entity_id,
			words: words.sort((a, b) => b.length - a.length),
			label: mention.name
		};
	});
}

export class RecordKnowledgeMentions {
	#source: () => { kind: 'document' | 'chat_session'; id: string | null } = () => ({
		kind: 'document',
		id: null
	});
	#recordId: string | null = $derived(this.#source().id);
	#recordKind: 'document' | 'chat_session' = $derived(this.#source().kind);

	mentions = $state.raw<RecordKnowledgeMention[]>([]);
	readonly targets: MentionTarget[] = $derived(mentionTargets(this.mentions));
	/** The card the popover shows and the name it hangs from. */
	open = $state<{ entityId: string; anchor: HTMLElement } | null>(null);
	readonly openMention: RecordKnowledgeMention | null = $derived(
		this.open ? (this.mentions.find((m) => m.entity_id === this.open?.entityId) ?? null) : null
	);

	constructor(source: () => { kind: 'document' | 'chat_session'; id: string | null }) {
		this.#source = source;
		$effect(() => {
			const id = this.#recordId;
			const kind = this.#recordKind;
			this.mentions = [];
			this.open = null;
			if (!id) return;
			const controller = new AbortController();
			void this.#load(kind, id, controller.signal);
			return () => controller.abort();
		});
	}

	async #load(kind: string, id: string, signal: AbortSignal) {
		try {
			const params = new URLSearchParams({ record_kind: kind, record_id: id });
			const response = await fetch(`/api/knowledge/mentions?${params}`, { signal });
			if (!response.ok || this.#recordId !== id) return;
			const body = await response.json();
			this.mentions = Array.isArray(body?.data?.mentions) ? body.data.mentions : [];
		} catch {
			// A convenience: the doc reads the same without it.
		}
	}

	openFor(entityId: string, anchor: HTMLElement) {
		this.open = { entityId, anchor };
	}

	close() {
		this.open = null;
	}

	/** Hidden or deleted from inside the card: stop linking that name here. */
	forget(entityId: string) {
		this.mentions = this.mentions.filter((m) => m.entity_id !== entityId);
	}
}
