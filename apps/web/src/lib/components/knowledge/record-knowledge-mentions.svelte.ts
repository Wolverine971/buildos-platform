// apps/web/src/lib/components/knowledge/record-knowledge-mentions.svelte.ts
//
// Names in a doc, task or chat that open their knowledge card (tasker 160, 167). A record is
// linked to the people, organizations and places read from it (knowledge_record_links, the
// viewer's own graph only), and every place a name appears is a tag (knowledge_mentions). This
// loads both once per record: tags are highlighted wherever they are (found again in the page by
// their words and context, never by parsing the prose); entries with no tags yet fall back to
// linking the first place their name appears. Hovering a name shows a light peek; clicking opens
// the card, whose footer can remove that one tag (remembered at that spot, with Undo).
// Kept free of the knowledge card itself: the popover loads in its own chunk, only when a record
// has names.

import type { MentionTag, MentionTarget } from '$lib/components/task-entities/entity-mentions';
import { toastService } from '$lib/stores/toast.store';
import { lensEntriesFor, lensOnlyNames } from './lens-match';
import type { LensEntry } from './sharing-types';

/** Mention ids for names only other project members have filed (tasker 168). */
export const LENS_ID_PREFIX = 'lens:';

export type RecordKnowledgeMention = {
	entity_id: string;
	kind: string;
	name: string;
	quote: string | null;
};

export type RecordKnowledgeTag = {
	id: string;
	entity_id: string;
	kind: string;
	name: string;
	summary: string | null;
	field: string;
	text: string;
	prefix: string;
	suffix: string;
	status: 'active' | 'removed';
};

export type RecordKind = 'document' | 'task' | 'chat_session';

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

/** Tags in one field, ready for the entityMentions() attachment (removed ones claim their spot). */
export function tagsForField(tags: RecordKnowledgeTag[], field: string): MentionTag[] {
	return tags
		.filter((tag) => tag.field === field)
		.map((tag) => ({
			tagId: tag.id,
			id: tag.entity_id,
			label: tag.name,
			text: tag.text,
			prefix: tag.prefix,
			suffix: tag.suffix,
			removed: tag.status === 'removed'
		}));
}

export class RecordKnowledgeMentions {
	#source: () => { kind: RecordKind; id: string | null; text?: string } = () => ({
		kind: 'document',
		id: null
	});
	#recordId: string | null = $derived(this.#source().id);
	#recordKind: RecordKind = $derived(this.#source().kind);
	#text: string | undefined = $derived(this.#source().text);

	mentions = $state.raw<RecordKnowledgeMention[]>([]);
	tags = $state.raw<RecordKnowledgeTag[]>([]);
	/** Entries placed by tags; the rest link their first appearance. */
	readonly #tagged: Set<string> = $derived(new Set(this.tags.map((tag) => tag.entity_id)));
	/** In a shared project: what the other members' People hold about names here (tasker 168). */
	lens = $state.raw<{ projectId: string; entries: LensEntry[] } | null>(null);
	/** Names only other members have: linked too, opening their "From Alice's People" card. */
	readonly #lensOnly: LensEntry[] = $derived(
		this.lens
			? lensOnlyNames(this.lens.entries, [
					...this.mentions.map((m) => m.name),
					...this.tags.map((t) => t.name)
				])
			: []
	);
	readonly targets: MentionTarget[] = $derived([
		...mentionTargets(this.mentions.filter((m) => !this.#tagged.has(m.entity_id))),
		...mentionTargets(
			this.#lensOnly.map((entry) => ({
				entity_id: `${LENS_ID_PREFIX}${entry.entity.id}`,
				kind: entry.entity.kind,
				name: entry.entity.name,
				quote: entry.quotes[0] ?? null
			}))
		)
	]);
	/** The card the popover shows, the name it hangs from, and the tag clicked (if any). */
	open = $state<{ entityId: string; anchor: HTMLElement; tagId: string | null } | null>(null);
	/** The name a pointer rests on. */
	peek = $state<{ entityId: string; anchor: HTMLElement } | null>(null);
	readonly openMention: RecordKnowledgeMention | null = $derived(
		this.open ? this.#entry(this.open.entityId) : null
	);
	readonly peekEntry: (RecordKnowledgeMention & { summary: string | null }) | null = $derived(
		this.peek ? this.#entry(this.peek.entityId) : null
	);

	constructor(source: () => { kind: RecordKind; id: string | null; text?: string }) {
		this.#source = source;
		$effect(() => {
			const id = this.#recordId;
			const kind = this.#recordKind;
			this.mentions = [];
			this.tags = [];
			this.lens = null;
			this.open = null;
			this.peek = null;
			if (!id) return;
			const controller = new AbortController();
			void this.#load(kind, id, controller.signal);
			return () => controller.abort();
		});

		// After an edit the readers re-tag the text (tasks ~15–30 s): look again twice.
		let textAtLoad: string | undefined;
		let idAtLoad: string | null = null;
		$effect(() => {
			const id = this.#recordId;
			const kind = this.#recordKind;
			const text = this.#text;
			if (!id || text === undefined) return;
			if (idAtLoad !== id || textAtLoad === undefined) {
				idAtLoad = id;
				textAtLoad = text;
				return;
			}
			if (text === textAtLoad) return;
			textAtLoad = text;
			const timers = [20_000, 60_000].map((ms) =>
				setTimeout(() => void this.#load(kind, id), ms)
			);
			return () => timers.forEach(clearTimeout);
		});
	}

	#entry(entityId: string): (RecordKnowledgeMention & { summary: string | null }) | null {
		if (entityId.startsWith(LENS_ID_PREFIX)) {
			const id = entityId.slice(LENS_ID_PREFIX.length);
			const entry = this.lens?.entries.find((e) => e.entity.id === id);
			return entry
				? {
						entity_id: entityId,
						kind: entry.entity.kind,
						name: entry.entity.name,
						quote: null,
						summary: entry.entity.summary
					}
				: null;
		}
		const tag = this.tags.find((t) => t.entity_id === entityId);
		const link = this.mentions.find((m) => m.entity_id === entityId);
		if (!tag && !link) return null;
		return {
			entity_id: entityId,
			kind: tag?.kind ?? link!.kind,
			name: tag?.name ?? link!.name,
			quote: link?.quote ?? null,
			summary: tag?.summary ?? null
		};
	}

	async #load(kind: string, id: string, signal?: AbortSignal) {
		try {
			const params = new URLSearchParams({ record_kind: kind, record_id: id });
			const response = await fetch(`/api/knowledge/mentions?${params}`, { signal });
			if (!response.ok || this.#recordId !== id) return;
			const body = await response.json();
			this.mentions = Array.isArray(body?.data?.mentions) ? body.data.mentions : [];
			this.tags = Array.isArray(body?.data?.tags) ? body.data.tags : [];
			const lens = body?.data?.lens;
			this.lens =
				lens && typeof lens.project_id === 'string' && Array.isArray(lens.entries)
					? { projectId: lens.project_id, entries: lens.entries }
					: null;
		} catch {
			// A convenience: the text reads the same without it.
		}
	}

	/** Other members' entries for a name (its own entry's name, or a lens-only name). */
	lensFor(entry: { entity_id: string; name: string } | null): LensEntry[] {
		if (!entry || !this.lens) return [];
		if (entry.entity_id.startsWith(LENS_ID_PREFIX)) {
			const id = entry.entity_id.slice(LENS_ID_PREFIX.length);
			const own = this.lens.entries.find((e) => e.entity.id === id);
			return own ? lensEntriesFor(this.lens.entries, [own.entity.name, ...own.quotes]) : [];
		}
		return lensEntriesFor(this.lens.entries, [entry.name]);
	}

	tagsFor(field: string): MentionTag[] {
		return tagsForField(this.tags, field);
	}

	openFor(entityId: string, anchor: HTMLElement) {
		this.peek = null;
		this.open = { entityId, anchor, tagId: anchor.dataset.mentionId ?? null };
	}

	peekAt(entityId: string | null, anchor: HTMLElement | null) {
		this.peek = entityId && anchor && !this.open ? { entityId, anchor } : null;
	}

	close() {
		this.open = null;
	}

	/** Load the record's names again (after a rename or merge in the card). */
	refresh() {
		const id = this.#recordId;
		if (id) void this.#load(this.#recordKind, id);
	}

	/** Hidden or deleted from inside the card: stop linking that name here. */
	forget(entityId: string) {
		this.mentions = this.mentions.filter((m) => m.entity_id !== entityId);
		this.tags = this.tags.filter((t) => t.entity_id !== entityId);
	}

	/** "Remove tag" on the spot that was clicked; remembered there, with Undo. */
	async removeTag(tagId: string) {
		const tag = this.tags.find((t) => t.id === tagId);
		if (!tag) return;
		this.open = null;
		this.#setStatus(tagId, 'removed');
		const ok = await this.#save(tagId, 'removed');
		if (!ok) {
			this.#setStatus(tagId, 'active');
			toastService.error('Could not remove the tag');
			return;
		}
		toastService.add({
			type: 'success',
			message: `Removed the ${tag.name} tag here`,
			duration: 6000,
			action: {
				label: 'Undo',
				onClick: () => {
					this.#setStatus(tagId, 'active');
					void this.#save(tagId, 'active').then((restored) => {
						if (!restored) {
							this.#setStatus(tagId, 'removed');
							toastService.error('Could not restore the tag');
						}
					});
				}
			}
		});
	}

	#setStatus(tagId: string, status: 'active' | 'removed') {
		this.tags = this.tags.map((t) => (t.id === tagId ? { ...t, status } : t));
	}

	async #save(tagId: string, status: 'active' | 'removed'): Promise<boolean> {
		try {
			const response = await fetch(`/api/knowledge/mentions/${tagId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
