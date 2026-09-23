// apps/web/src/lib/components/agent/agent-chat-markdown.ts
import { Lexer, type Token } from 'marked';
import type { Attachment } from 'svelte/attachments';
import {
	hasMarkdownFormatting,
	normalizeMarkdownTables,
	renderAgentMarkdownContent
} from '$lib/utils/markdown';

const TABLE_OPEN_TAG = /<table(\s[^>]*)?>/g;
const TABLE_CLOSE_TAG = /<\/table>/g;
const TABLE_SCROLL_SELECTOR = '.agent-markdown-table-scroll';
const SCROLL_EPSILON_PX = 1;

/**
 * Render sanitized agent markdown and give tables their own scroll boundary.
 *
 * The wrapper is injected only after `renderMarkdown` has sanitized user input,
 * so its classes and accessibility attributes cannot be supplied by the model.
 */
export function renderAgentMarkdown(text: string | null | undefined): string {
	return renderAgentMarkdownContent(text)
		.replace(
			TABLE_OPEN_TAG,
			'<div class="agent-markdown-table-shell"><div class="agent-markdown-table-scroll" data-scrollable="false" data-at-end="true" tabindex="-1"><table$1>'
		)
		.replace(
			TABLE_CLOSE_TAG,
			'</table></div><span class="agent-markdown-table-cue" aria-hidden="true">Scroll →</span></div>'
		);
}

// ---------------------------------------------------------------------------
// Block-incremental rendering
//
// A chat bubble is rendered as a list of top-level markdown blocks (paragraph,
// list, table, code fence, …), each sanitized independently through the same
// `renderAgentMarkdown` path as a whole message. Completed blocks are cached by
// their markdown source, so a streaming update re-parses only the tail block,
// and a keyed `{#each}` of `{@html}` leaves every earlier block's DOM (and any
// text selection in it) untouched. Blocks never share sanitizer state: each
// fragment is balanced HTML on its own, so splitting cannot open an injection
// seam that whole-message sanitization would have closed.
// ---------------------------------------------------------------------------

const BLOCK_HTML_CACHE_LIMIT = 600;
const MESSAGE_BLOCKS_CACHE_LIMIT = 300;
const blockHtmlCache = new Map<string, string>();
const messageBlocksCache = new Map<string, { isMarkdown: boolean; blocks: string[] | null }>();

function rememberBounded<V>(cache: Map<string, V>, limit: number, key: string, value: V): void {
	if (cache.size >= limit) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, value);
}

function cachedBlockHtml(source: string): string {
	const hit = blockHtmlCache.get(source);
	if (hit !== undefined) return hit;
	const html = renderAgentMarkdown(source);
	rememberBounded(blockHtmlCache, BLOCK_HTML_CACHE_LIMIT, source, html);
	return html;
}

/** Same pre-processing `renderAgentMarkdownContent` applies before parsing. */
function prepareMarkdownSource(text: string): string {
	return normalizeMarkdownTables(text.trim());
}

/**
 * Top-level block tokens only. Inline lexing is skipped — only `raw` spans are
 * needed here, and the block pass is roughly half the cost of `marked.lexer`.
 */
function lexMarkdownBlocks(source: string): { tokens: Token[]; hasLinkDefinitions: boolean } {
	const lexer = new Lexer();
	const tokens = lexer.blockTokens(source, []);
	const hasLinkDefinitions =
		tokens.some((token) => token.type === 'def') ||
		Object.keys(lexer.tokens.links ?? {}).length > 0;
	return { tokens, hasLinkDefinitions };
}

function longestBacktickRun(text: string): number {
	let longest = 0;
	let run = 0;
	for (let index = 0; index < text.length; index += 1) {
		run = text.charCodeAt(index) === 96 ? run + 1 : 0;
		if (run > longest) longest = run;
	}
	return longest;
}

/**
 * Markdown for one block, rendered standalone. The shared renderer trims its
 * input, which would demote an indented code block to a paragraph and shift a
 * `  - item` list's nesting, so those shapes are rewritten to equivalents that
 * survive the trim.
 */
function blockMarkdownSource(token: Token): string {
	if (token.type === 'code' && token.codeBlockStyle === 'indented') {
		const fence = '`'.repeat(Math.max(3, longestBacktickRun(token.text) + 1));
		return `${fence}\n${token.text}\n${fence}`;
	}
	const raw = token.raw;
	let indent = 0;
	while (indent < raw.length && indent < 3 && raw.charCodeAt(indent) === 32) indent += 1;
	if (indent === 0) return raw;
	return raw
		.split('\n')
		.map((line) => {
			let strip = 0;
			while (strip < indent && line.charCodeAt(strip) === 32) strip += 1;
			return line.slice(strip);
		})
		.join('\n');
}

const INLINE_CLOSABLE_BLOCKS = new Set([
	'paragraph',
	'heading',
	'list',
	'blockquote',
	'table',
	'text'
]);
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

function isWhitespaceCode(code: number): boolean {
	return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
}

/**
 * Close (or drop) an unterminated `**` / `***` or backtick code span on one
 * line so a half-streamed marker renders as formatting instead of flashing as
 * literal syntax. Only left-flanking openers count (`2 ** 3` is left alone);
 * an opener with nothing after it yet is hidden until its content arrives.
 */
function closeInlineMarkersOnLine(line: string): string {
	let codeOpenAt = -1;
	let codeRun = 0;
	let strongOpenAt = -1;
	let strongRun = 0;
	let index = 0;
	while (index < line.length) {
		const code = line.charCodeAt(index);
		if (code === 92 && codeOpenAt === -1) {
			index += 2; // backslash escape
			continue;
		}
		if (code === 96) {
			let run = 1;
			while (line.charCodeAt(index + run) === 96) run += 1;
			if (codeOpenAt === -1) {
				codeOpenAt = index;
				codeRun = run;
			} else if (run === codeRun) {
				codeOpenAt = -1;
				codeRun = 0;
			}
			index += run;
			continue;
		}
		if (code === 42 && codeOpenAt === -1) {
			let run = 1;
			while (line.charCodeAt(index + run) === 42) run += 1;
			if (run === 2 || run === 3) {
				if (strongOpenAt !== -1 && run === strongRun) {
					strongOpenAt = -1;
					strongRun = 0;
				} else if (strongOpenAt === -1) {
					const next = line.charCodeAt(index + run);
					// Left-flanking opener, or a dangling opener at end of line.
					if (Number.isNaN(next) || !isWhitespaceCode(next)) {
						strongOpenAt = index;
						strongRun = run;
					}
				}
			}
			index += run;
			continue;
		}
		index += 1;
	}

	let result = line;
	if (codeOpenAt !== -1) {
		if (result.slice(codeOpenAt + codeRun).trim()) {
			result = `${result}${'`'.repeat(codeRun)}`;
		} else {
			result = result.slice(0, codeOpenAt);
			if (strongOpenAt >= codeOpenAt) strongOpenAt = -1;
		}
	}
	if (strongOpenAt !== -1) {
		if (result.slice(strongOpenAt + strongRun).trim()) {
			result = `${result.trimEnd()}${'*'.repeat(strongRun)}`;
		} else {
			result = result.slice(0, strongOpenAt);
		}
	}
	return result;
}

/**
 * Display-only repair for the still-streaming tail block. Unterminated code
 * fences need no help (marked already runs them to end of input); inside one,
 * nothing is touched. Otherwise the last line's open inline markers are closed.
 */
export function closeStreamingMarkdownTail(source: string, blockType = 'paragraph'): string {
	if (!INLINE_CLOSABLE_BLOCKS.has(blockType)) return source;
	let end = source.length;
	while (end > 0 && isWhitespaceCode(source.charCodeAt(end - 1))) end -= 1;
	const body = source.slice(0, end);

	let fence: { marker: string; length: number } | null = null;
	let lastLineIsFence = false;
	let lineStart = 0;
	for (;;) {
		const lineEnd = body.indexOf('\n', lineStart);
		const line = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd);
		const match = FENCE_LINE.exec(line);
		lastLineIsFence = Boolean(match);
		if (match?.[1]) {
			const marker = match[1].charAt(0);
			if (!fence) fence = { marker, length: match[1].length };
			else if (marker === fence.marker && match[1].length >= fence.length) fence = null;
		}
		if (lineEnd === -1) break;
		lineStart = lineEnd + 1;
	}
	if (fence || lastLineIsFence) return source;

	const lastLineStart = body.lastIndexOf('\n') + 1;
	const lastLine = body.slice(lastLineStart);
	const closed = closeInlineMarkersOnLine(lastLine);
	return closed === lastLine ? source : `${body.slice(0, lastLineStart)}${closed}`;
}

/**
 * Finalized assistant message → sanitized HTML per top-level block, or `null`
 * when the text should render as plain pre-wrapped text. Memoized by text so a
 * re-render of an unchanged bubble (e.g. when the streaming id moves) is a
 * lookup; block HTML shared with the streaming pass comes from the block cache.
 */
export function renderAgentMessageBlocks(
	text: string | null | undefined,
	options: { forceMarkdown?: boolean } = {}
): string[] | null {
	const content = text ?? '';
	let entry = messageBlocksCache.get(content);
	if (!entry) {
		entry = { isMarkdown: hasMarkdownFormatting(content), blocks: null };
		rememberBounded(messageBlocksCache, MESSAGE_BLOCKS_CACHE_LIMIT, content, entry);
	}
	if (!entry.isMarkdown && !options.forceMarkdown) return null;
	if (!entry.blocks) {
		const source = prepareMarkdownSource(content);
		if (!source) {
			entry.blocks = [];
		} else {
			const { tokens, hasLinkDefinitions } = lexMarkdownBlocks(source);
			entry.blocks = hasLinkDefinitions
				? [cachedBlockHtml(source)]
				: tokens
						.filter((token) => token.type !== 'space')
						.map((token) => cachedBlockHtml(blockMarkdownSource(token)));
		}
	}
	return entry.blocks;
}

/**
 * Incremental renderer for ONE streaming message. Text only grows while a turn
 * streams, so blocks before the tail are frozen: the renderer remembers where
 * the tail starts and re-lexes only from there. If earlier text ever changes
 * (a rewrite, or table normalization reaching back), it falls back to a full
 * pass. Markdown detection is sticky so the bubble never flips back to plain.
 */
export class AgentMarkdownStreamRenderer {
	isMarkdown = false;
	#stablePrefix = '';
	#stableHtml: string[] = [];
	#wholeDocument = false;

	render(text: string): string[] | null {
		if (!this.isMarkdown) this.isMarkdown = hasMarkdownFormatting(text);
		if (!this.isMarkdown) return null;

		const source = prepareMarkdownSource(text);
		if (!source) return [];
		if (this.#wholeDocument) {
			return [renderAgentMarkdown(closeStreamingMarkdownTail(source))];
		}

		let offset = 0;
		let stableHtml: string[] = [];
		if (this.#stablePrefix && source.startsWith(this.#stablePrefix)) {
			offset = this.#stablePrefix.length;
			stableHtml = this.#stableHtml;
		}

		const { tokens, hasLinkDefinitions } = lexMarkdownBlocks(source.slice(offset));
		if (hasLinkDefinitions) {
			// Reference-style links resolve across blocks; stop splitting.
			this.#wholeDocument = true;
			this.#stablePrefix = '';
			this.#stableHtml = [];
			return [renderAgentMarkdown(closeStreamingMarkdownTail(source))];
		}

		let tailIndex = -1;
		for (let index = tokens.length - 1; index >= 0; index -= 1) {
			if (tokens[index]?.type !== 'space') {
				tailIndex = index;
				break;
			}
		}

		const nextStableHtml = stableHtml.slice();
		let tailStart = offset;
		for (let index = 0; index < tailIndex; index += 1) {
			const token = tokens[index]!;
			if (token.type !== 'space')
				nextStableHtml.push(cachedBlockHtml(blockMarkdownSource(token)));
			tailStart += token.raw.length;
		}

		if (tailIndex === -1) {
			this.#stablePrefix = source.slice(0, offset);
			this.#stableHtml = nextStableHtml;
			return nextStableHtml;
		}

		const tail = tokens[tailIndex]!;
		// Guard the offset bookkeeping: tokens must tile the source exactly.
		if (source.startsWith(tail.raw, tailStart)) {
			this.#stablePrefix = source.slice(0, tailStart);
			this.#stableHtml = nextStableHtml;
		} else {
			this.#stablePrefix = '';
			this.#stableHtml = [];
		}
		const tailHtml = renderAgentMarkdown(
			closeStreamingMarkdownTail(blockMarkdownSource(tail), tail.type)
		);
		return [...nextStableHtml, tailHtml];
	}
}

interface TableScrollState {
	scroller: HTMLElement;
	isScrollable: boolean;
	isAtEnd: boolean;
}

function readTableScrollState(scroller: HTMLElement): TableScrollState {
	const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
	const isScrollable = maxScrollLeft > SCROLL_EPSILON_PX;
	const isAtEnd = !isScrollable || scroller.scrollLeft >= maxScrollLeft - SCROLL_EPSILON_PX;
	return { scroller, isScrollable, isAtEnd };
}

function writeTableScrollState({ scroller, isScrollable, isAtEnd }: TableScrollState): void {
	const scrollable = String(isScrollable);
	const atEnd = String(isAtEnd);
	const shell = scroller.closest<HTMLElement>('.agent-markdown-table-shell');
	// Skip no-op writes: attribute sets still invalidate style for the subtree.
	if (
		scroller.dataset.scrollable === scrollable &&
		scroller.dataset.atEnd === atEnd &&
		(!shell || (shell.dataset.scrollable === scrollable && shell.dataset.atEnd === atEnd))
	) {
		return;
	}

	scroller.dataset.scrollable = scrollable;
	scroller.dataset.atEnd = atEnd;
	if (shell) {
		shell.dataset.scrollable = scrollable;
		shell.dataset.atEnd = atEnd;
	}
	scroller.tabIndex = isScrollable ? 0 : -1;

	if (isScrollable) {
		scroller.setAttribute('role', 'region');
		scroller.setAttribute('aria-label', 'Scrollable table');
	} else {
		scroller.removeAttribute('role');
		scroller.removeAttribute('aria-label');
	}
}

/** Measure every scroller first, then write, so one layout serves the batch. */
function syncTableScrollStates(scrollers: Iterable<HTMLElement>): void {
	const states: TableScrollState[] = [];
	for (const scroller of scrollers) states.push(readTableScrollState(scroller));
	for (const state of states) writeTableScrollState(state);
}

function collectTableScrollers(node: Node, into: Set<HTMLElement>): void {
	if (!(node instanceof HTMLElement)) return;
	if (node.matches(TABLE_SCROLL_SELECTOR)) into.add(node);
	for (const scroller of node.querySelectorAll<HTMLElement>(TABLE_SCROLL_SELECTOR)) {
		into.add(scroller);
	}
}

/**
 * Keep every table cue in one message list accurate as streamed markdown and
 * bubble sizes change. One root attachment avoids observer work per message;
 * mutations only inspect the nodes they added, so a streaming tail swap does
 * not re-query or re-measure every table in the conversation.
 */
export const observeAgentMarkdownTables: Attachment<HTMLElement> = (root) => {
	const observedScrollers = new Set<HTMLElement>();
	const resizeObserver =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver((entries) => {
					syncTableScrollStates(entries.map((entry) => entry.target as HTMLElement));
				});

	const handleScroll = (event: Event) => {
		syncTableScrollStates([event.currentTarget as HTMLElement]);
	};

	const adoptScrollers = (scrollers: Set<HTMLElement>) => {
		for (const scroller of scrollers) {
			if (observedScrollers.has(scroller)) continue;
			scroller.addEventListener('scroll', handleScroll, { passive: true });
			resizeObserver?.observe(scroller);
			observedScrollers.add(scroller);
		}
		syncTableScrollStates(scrollers);
	};

	const releaseScrollers = (scrollers: Set<HTMLElement>) => {
		for (const scroller of scrollers) {
			// A node moved within the list shows up as removed and re-added.
			if (!observedScrollers.has(scroller) || root.contains(scroller)) continue;
			scroller.removeEventListener('scroll', handleScroll);
			resizeObserver?.unobserve(scroller);
			observedScrollers.delete(scroller);
		}
	};

	const handleMutations = (mutations: MutationRecord[]) => {
		const added = new Set<HTMLElement>();
		const removed = new Set<HTMLElement>();
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) collectTableScrollers(node, added);
			if (observedScrollers.size > 0) {
				for (const node of mutation.removedNodes) collectTableScrollers(node, removed);
			}
		}
		if (removed.size > 0) releaseScrollers(removed);
		if (added.size > 0) adoptScrollers(added);
	};

	const refreshAllScrollers = () => {
		syncTableScrollStates(observedScrollers);
	};

	const mutationObserver = new MutationObserver(handleMutations);
	mutationObserver.observe(root, { childList: true, subtree: true });
	adoptScrollers(new Set(root.querySelectorAll<HTMLElement>(TABLE_SCROLL_SELECTOR)));

	if (!resizeObserver) window.addEventListener('resize', refreshAllScrollers);

	return () => {
		mutationObserver.disconnect();
		resizeObserver?.disconnect();
		if (!resizeObserver) window.removeEventListener('resize', refreshAllScrollers);
		for (const scroller of observedScrollers) {
			scroller.removeEventListener('scroll', handleScroll);
		}
		observedScrollers.clear();
	};
};
