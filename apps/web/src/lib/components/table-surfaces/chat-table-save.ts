// apps/web/src/lib/components/table-surfaces/chat-table-save.ts
//
// "Save as table" on tables the agent renders in chat. One attachment on the
// message list's scroller adds a button to every table shell (the wrapper
// agent-chat-markdown.ts injects after sanitizing) and, on click, reads the
// table's cells from the DOM — structured data, never text classification —
// and hands them to the caller (which opens the new-table dialog prefilled).
import type { Attachment } from 'svelte/attachments';
import { readRenderedTable, type GridData } from './table-surface-utils';

const SHELL_SELECTOR = '.agent-markdown-table-shell';
const BUTTON_ATTR = 'data-save-as-table';
const BUTTON_CLASS =
	'mt-1.5 inline-flex min-h-8 items-center gap-1 self-end rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-ink transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';

function addButton(shell: HTMLElement): void {
	if (shell.querySelector(`:scope > [${BUTTON_ATTR}]`)) return;
	const button = document.createElement('button');
	button.type = 'button';
	button.setAttribute(BUTTON_ATTR, '');
	button.className = BUTTON_CLASS;
	button.textContent = 'Save as table';
	button.title = 'Keep this as a table you can sort, filter and keep updating';
	shell.append(button);
}

function collectShells(node: Node, into: Set<HTMLElement>): void {
	if (!(node instanceof HTMLElement)) return;
	if (node.matches(SHELL_SELECTOR)) into.add(node);
	for (const shell of node.querySelectorAll<HTMLElement>(SHELL_SELECTOR)) into.add(shell);
}

export function chatTableSaveButtons(onSave: (data: GridData) => void): Attachment<HTMLElement> {
	return (root) => {
		const initial = new Set<HTMLElement>();
		collectShells(root, initial);
		for (const shell of initial) addButton(shell);

		const observer =
			typeof MutationObserver === 'undefined'
				? null
				: new MutationObserver((mutations) => {
						const added = new Set<HTMLElement>();
						for (const mutation of mutations) {
							for (const node of mutation.addedNodes) collectShells(node, added);
						}
						for (const shell of added) addButton(shell);
					});
		observer?.observe(root, { childList: true, subtree: true });

		const handleClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			const button = target?.closest(`[${BUTTON_ATTR}]`);
			if (!button || !root.contains(button)) return;
			const table = button.closest(SHELL_SELECTOR)?.querySelector('table');
			if (!table) return;
			const data = readRenderedTable(table);
			if (data.headers.length === 0) return;
			event.preventDefault();
			onSave(data);
		};
		root.addEventListener('click', handleClick);

		return () => {
			observer?.disconnect();
			root.removeEventListener('click', handleClick);
		};
	};
}
