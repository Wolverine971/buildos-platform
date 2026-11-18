// apps/web/src/lib/components/task-entities/entity-mentions.ts
//
// Turns the names a model found in a task (people, organizations, places) into links inside the
// task's own words, so the text stays the one place to read and a tap opens the entity's card
// (docs/research/task-entity-layer-2026-10-07.md). Only the first mention of each entity is
// linked. The words come from the model's checked quote and label, never from reading the prose.
//
// Two forms: splitMentions() for plain text Svelte renders itself (the reader's title), and the
// entityMentions() attachment for markdown rendered with {@html}. The sanitizer strips buttons
// and data attributes from authored markdown, so task text cannot fake a mention.
import type { Attachment } from 'svelte/attachments';
import { reanchorMentions } from '@buildos/shared-agent-ops/knowledge';

export type MentionTarget = {
	/** Card id the mention opens. */
	id: string;
	/** Words to look for, longest first. */
	words: string[];
	label: string;
};

/** A fixed-format value (a phone number or email in plain text) that becomes a plain link. */
export type MentionLink = { text: string; href: string };

export type MentionSegment =
	| { kind: 'text'; text: string }
	| { kind: 'mention'; text: string; id: string; label: string }
	| { kind: 'link'; text: string; href: string };

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** First case-insensitive match of `word` in `text` that is not part of a longer word. */
export function findWord(text: string, word: string, from = 0): number {
	if (!word) return -1;
	const haystack = text.toLowerCase();
	const needle = word.toLowerCase();
	let at = haystack.indexOf(needle, from);
	while (at !== -1) {
		const before = at > 0 ? text[at - 1] : '';
		const after = text[at + needle.length] ?? '';
		const startsWord = !WORD_CHAR.test(needle[0] ?? '') || !before || !WORD_CHAR.test(before);
		const endsWord =
			!WORD_CHAR.test(needle[needle.length - 1] ?? '') || !after || !WORD_CHAR.test(after);
		if (startsWord && endsWord) return at;
		at = haystack.indexOf(needle, at + 1);
	}
	return -1;
}

type Span = { start: number; end: number } & (
	| { kind: 'mention'; id: string; label: string }
	| { kind: 'link'; href: string }
);

/** Non-overlapping spans: links first, then each target's first (longest) word. */
function planSpans(text: string, targets: MentionTarget[], links: MentionLink[]): Span[] {
	const spans: Span[] = [];
	const free = (start: number, end: number) =>
		spans.every((span) => end <= span.start || start >= span.end);
	for (const link of links) {
		const at = findWord(text, link.text);
		if (at !== -1 && free(at, at + link.text.length)) {
			spans.push({ kind: 'link', start: at, end: at + link.text.length, href: link.href });
		}
	}
	for (const target of targets) {
		for (const word of target.words) {
			let at = findWord(text, word);
			while (at !== -1 && !free(at, at + word.length)) at = findWord(text, word, at + 1);
			if (at === -1) continue;
			spans.push({
				kind: 'mention',
				start: at,
				end: at + word.length,
				id: target.id,
				label: target.label
			});
			break;
		}
	}
	return spans.sort((a, b) => a.start - b.start);
}

/** Plain text → text, mention and link segments (for text Svelte renders, like a title). */
export function splitMentions(
	text: string,
	targets: MentionTarget[],
	links: MentionLink[] = []
): MentionSegment[] {
	if (!text) return [];
	const segments: MentionSegment[] = [];
	let cursor = 0;
	for (const span of planSpans(text, targets, links)) {
		if (span.start > cursor)
			segments.push({ kind: 'text', text: text.slice(cursor, span.start) });
		const words = text.slice(span.start, span.end);
		segments.push(
			span.kind === 'mention'
				? { kind: 'mention', text: words, id: span.id, label: span.label }
				: { kind: 'link', text: words, href: span.href }
		);
		cursor = span.end;
	}
	if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
	return segments;
}

/**
 * A stored tag (tasker 167): where a name was in the saved text, by its words and the words
 * around them. The rendered page isn't the stored markdown, so each tag is found again in the
 * page's text by the same quote + context anchoring the server uses.
 */
export type MentionTag = {
	/** knowledge_mentions id. */
	tagId: string;
	/** Card id the tag opens (the knowledge entry). */
	id: string;
	label: string;
	text: string;
	prefix: string;
	suffix: string;
	/** The user removed this tag: it claims its spot (so nothing else lands there) unshown. */
	removed?: boolean;
};

/** Where each tag sits in `text` (tags whose words aren't there are left out). */
export function placeTags(
	text: string,
	tags: MentionTag[]
): Array<{ tag: MentionTag; start: number; end: number }> {
	if (!text || !tags.length) return [];
	const outcomes = reanchorMentions(
		{ content: text },
		tags.map((tag) => ({
			id: tag.tagId,
			anchor: {
				field: 'content' as const,
				start: -1,
				end: -1,
				text: tag.text,
				prefix: tag.prefix,
				suffix: tag.suffix
			}
		}))
	);
	const placed: Array<{ tag: MentionTag; start: number; end: number }> = [];
	for (const tag of tags) {
		const outcome = outcomes.get(tag.tagId);
		if (!outcome || (outcome.status !== 'same' && outcome.status !== 'moved')) continue;
		placed.push({ tag, start: outcome.anchor.start, end: outcome.anchor.end });
	}
	return placed.sort((a, b) => a.start - b.start);
}

export const MENTION_CLASS = 'entity-mention';
const SKIP = 'a, button, code, pre, [data-entity-mention], .buildos-table-embed';

export type EntityMentionOptions = {
	/** The rendered HTML. Passing it re-runs the linking whenever the body changes. */
	html: string;
	targets: MentionTarget[];
	/** Stored tags: every tagged place is linked (not only the first). */
	tags?: MentionTag[];
	onOpen: (id: string, trigger: HTMLElement) => void;
	/** Pointer rests on (or keyboard focus reaches) a name; null when it leaves. */
	onPeek?: (id: string | null, trigger: HTMLElement | null) => void;
};

const PEEK_DELAY_MS = 350;

/**
 * Links the first mention of each target inside rendered markdown. Text inside links, code and
 * buttons is left alone. Cleanup puts the plain words back, so a re-run never nests.
 */
export function entityMentions(options: EntityMentionOptions): Attachment<HTMLElement> {
	return (root) => {
		void options.html;
		const targets = options.targets;
		const tags = options.tags ?? [];
		let disposed = false;
		const inserted: HTMLElement[] = [];

		const mentionAt = (target: EventTarget | null) => {
			const button = (target as Element | null)?.closest?.<HTMLElement>(
				'[data-entity-mention]'
			);
			return button && root.contains(button) ? button : null;
		};
		const onClick = (event: MouseEvent) => {
			const button = mentionAt(event.target);
			if (!button) return;
			event.preventDefault();
			clearPeek();
			options.onOpen(button.dataset.entityMention ?? '', button);
		};
		root.addEventListener('click', onClick);

		// Peek: a resting mouse pointer or keyboard focus shows a light preview of the entry.
		let peekTimer: ReturnType<typeof setTimeout> | null = null;
		let peeking: HTMLElement | null = null;
		const clearPeek = () => {
			if (peekTimer) clearTimeout(peekTimer);
			peekTimer = null;
			if (peeking) options.onPeek?.(null, null);
			peeking = null;
		};
		const startPeek = (button: HTMLElement) => {
			if (!options.onPeek || peeking === button) return;
			if (peekTimer) clearTimeout(peekTimer);
			peekTimer = setTimeout(() => {
				peeking = button;
				options.onPeek?.(button.dataset.entityMention ?? '', button);
			}, PEEK_DELAY_MS);
		};
		const onPointerOver = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse') return;
			const button = mentionAt(event.target);
			if (button) startPeek(button);
		};
		const onPointerOut = (event: PointerEvent) => {
			const button = mentionAt(event.target);
			if (button && !button.contains(event.relatedTarget as Node | null)) clearPeek();
		};
		const onFocusIn = (event: FocusEvent) => {
			const button = mentionAt(event.target);
			if (button && button.matches(':focus-visible')) startPeek(button);
		};
		const onFocusOut = () => clearPeek();
		if (options.onPeek) {
			root.addEventListener('pointerover', onPointerOver);
			root.addEventListener('pointerout', onPointerOut);
			root.addEventListener('focusin', onFocusIn);
			root.addEventListener('focusout', onFocusOut);
		}

		const makeButton = (text: string, id: string, label: string, tagId?: string) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = MENTION_CLASS;
			button.dataset.entityMention = id;
			if (tagId) button.dataset.mentionId = tagId;
			button.setAttribute('aria-haspopup', 'dialog');
			button.title = `About ${label}`;
			button.textContent = text;
			return button;
		};

		// Run after Svelte has finished writing this flush's {@html} nodes.
		queueMicrotask(() => {
			if (disposed) return;
			if (tags.length) {
				// Every text node in order (skipped ones too, so context reads like the page).
				const nodes: Array<{ node: Text; start: number; skip: boolean }> = [];
				let flat = '';
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
				while (walker.nextNode()) {
					const node = walker.currentNode as Text;
					nodes.push({
						node,
						start: flat.length,
						skip: Boolean(node.parentElement?.closest(SKIP))
					});
					flat += node.data;
				}
				// Right to left, so splitting a node never moves a later span's offsets.
				for (const place of placeTags(flat, tags).reverse()) {
					if (place.tag.removed) continue;
					const host = nodes.find(
						(n) => place.start >= n.start && place.end <= n.start + n.node.data.length
					);
					if (!host || host.skip) continue;
					const match = host.node.splitText(place.start - host.start);
					match.splitText(place.end - place.start);
					const button = makeButton(
						match.data,
						place.tag.id,
						place.tag.label,
						place.tag.tagId
					);
					match.replaceWith(button);
					inserted.push(button);
				}
			}
			if (!targets.length) return;
			const textNodes = (): Text[] => {
				const nodes: Text[] = [];
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
					acceptNode: (node) =>
						node.parentElement?.closest(SKIP) || !node.nodeValue?.trim()
							? NodeFilter.FILTER_REJECT
							: NodeFilter.FILTER_ACCEPT
				});
				while (walker.nextNode()) nodes.push(walker.currentNode as Text);
				return nodes;
			};
			for (const target of targets) {
				let placed = false;
				for (const word of target.words) {
					for (const node of textNodes()) {
						const at = findWord(node.data, word);
						if (at === -1) continue;
						const match = node.splitText(at);
						match.splitText(word.length);
						const button = makeButton(match.data, target.id, target.label);
						match.replaceWith(button);
						inserted.push(button);
						placed = true;
						break;
					}
					if (placed) break;
				}
			}
		});

		return () => {
			disposed = true;
			clearPeek();
			root.removeEventListener('click', onClick);
			root.removeEventListener('pointerover', onPointerOver);
			root.removeEventListener('pointerout', onPointerOut);
			root.removeEventListener('focusin', onFocusIn);
			root.removeEventListener('focusout', onFocusOut);
			for (const element of inserted) {
				if (!element.isConnected) continue;
				const parent = element.parentNode;
				element.replaceWith(document.createTextNode(element.textContent ?? ''));
				parent?.normalize();
			}
		};
	};
}
