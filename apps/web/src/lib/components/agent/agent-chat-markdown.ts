// apps/web/src/lib/components/agent/agent-chat-markdown.ts
import type { Attachment } from 'svelte/attachments';
import { renderAgentMarkdownContent } from '$lib/utils/markdown';

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

function syncTableScrollState(scroller: HTMLElement): void {
	const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
	const isScrollable = maxScrollLeft > SCROLL_EPSILON_PX;
	const isAtEnd = !isScrollable || scroller.scrollLeft >= maxScrollLeft - SCROLL_EPSILON_PX;
	const shell = scroller.closest<HTMLElement>('.agent-markdown-table-shell');

	scroller.dataset.scrollable = String(isScrollable);
	scroller.dataset.atEnd = String(isAtEnd);
	if (shell) {
		shell.dataset.scrollable = String(isScrollable);
		shell.dataset.atEnd = String(isAtEnd);
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

/**
 * Keep every table cue in one message list accurate as streamed markdown and
 * bubble sizes change. One root attachment avoids observer work per message.
 */
export const observeAgentMarkdownTables: Attachment<HTMLElement> = (root) => {
	const observedScrollers = new Set<HTMLElement>();
	const resizeObserver =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver((entries) => {
					for (const entry of entries) {
						syncTableScrollState(entry.target as HTMLElement);
					}
				});

	const handleScroll = (event: Event) => {
		syncTableScrollState(event.currentTarget as HTMLElement);
	};

	const refreshScrollers = () => {
		const currentScrollers = new Set(
			Array.from(root.querySelectorAll<HTMLElement>(TABLE_SCROLL_SELECTOR))
		);

		for (const scroller of observedScrollers) {
			if (currentScrollers.has(scroller)) continue;
			scroller.removeEventListener('scroll', handleScroll);
			resizeObserver?.unobserve(scroller);
			observedScrollers.delete(scroller);
		}

		for (const scroller of currentScrollers) {
			if (!observedScrollers.has(scroller)) {
				scroller.addEventListener('scroll', handleScroll, { passive: true });
				resizeObserver?.observe(scroller);
				observedScrollers.add(scroller);
			}
			syncTableScrollState(scroller);
		}
	};

	const mutationObserver = new MutationObserver(refreshScrollers);
	mutationObserver.observe(root, { childList: true, subtree: true });
	refreshScrollers();

	if (!resizeObserver) window.addEventListener('resize', refreshScrollers);

	return () => {
		mutationObserver.disconnect();
		resizeObserver?.disconnect();
		if (!resizeObserver) window.removeEventListener('resize', refreshScrollers);
		for (const scroller of observedScrollers) {
			scroller.removeEventListener('scroll', handleScroll);
		}
		observedScrollers.clear();
	};
};
