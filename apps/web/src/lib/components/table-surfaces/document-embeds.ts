// apps/web/src/lib/components/table-surfaces/document-embeds.ts
//
// Post-render hydration for document bodies rendered with `{@html}`:
// - a fenced `buildos-table` block (it survives the sanitizer as
//   `<pre><code class="language-buildos-table">id</code></pre>`) becomes a live,
//   read-only <TableEmbed>;
// - each plain markdown table gets a small "Make live table" action when the
//   host can edit.
// The sanitizer strips classes and data attributes from authored markdown, so
// nothing here can be triggered by document text beyond the fence language.
import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { TABLE_EMBED_LANGUAGE, isUuid, readRenderedTable } from './table-surface-utils';

export type MakeLiveTableClick = {
	renderedIndex: number;
	renderedHeaders: string[];
	button: HTMLButtonElement;
};

export type DocumentEmbedOptions = {
	projectId: string | null | undefined;
	/** The rendered HTML. Passing it re-runs the hydration whenever the body changes. */
	html: string;
	onMakeLiveTable?: (click: MakeLiveTableClick) => void | Promise<void>;
	/** Open an embedded table in place (e.g. the reader); default is its page link. */
	onOpenTable?: (tableId: string) => void;
};

const EMBED_HOST_CLASS =
	'buildos-table-embed not-prose my-4 block whitespace-normal bg-transparent p-0 font-sans text-sm';
const LIVE_BAR_CLASS = 'buildos-make-live-table not-prose -mt-2 mb-4 flex justify-end';
const LIVE_BUTTON_CLASS =
	'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-ink transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none';

type TableEmbedModule = typeof import('$lib/components/tables/TableEmbed.svelte');
let tableEmbedModule: Promise<TableEmbedModule> | null = null;
function loadTableEmbed(): Promise<TableEmbedModule> {
	tableEmbedModule ??= import('$lib/components/tables/TableEmbed.svelte');
	return tableEmbedModule;
}

export function documentEmbeds(options: DocumentEmbedOptions): Attachment<HTMLElement> {
	return (root) => {
		void options.html;
		let disposed = false;
		const mounted: Array<Record<string, unknown>> = [];
		const inserted: HTMLElement[] = [];

		// Run after Svelte has finished writing this flush's {@html} nodes.
		queueMicrotask(() => {
			if (disposed) return;

			// 1. "Make live table" on plain markdown tables (before embeds add their own).
			const onMakeLiveTable = options.onMakeLiveTable;
			if (onMakeLiveTable) {
				const tables = Array.from(root.querySelectorAll('table')).filter(
					(table) => !table.closest('.buildos-table-embed')
				);
				tables.forEach((table, renderedIndex) => {
					const { headers } = readRenderedTable(table);
					if (headers.length === 0) return;
					const bar = document.createElement('div');
					bar.className = LIVE_BAR_CLASS;
					const button = document.createElement('button');
					button.type = 'button';
					button.className = LIVE_BUTTON_CLASS;
					button.textContent = 'Make live table';
					button.title = 'Turn this into a table you can sort, filter and chat about';
					button.addEventListener('click', () => {
						void onMakeLiveTable({ renderedIndex, renderedHeaders: headers, button });
					});
					bar.append(button);
					table.after(bar);
					inserted.push(bar);
				});
			}

			// 2. Embedded tables. The <pre> becomes the host in place (never replaced),
			// so Svelte's own bookkeeping of the {@html} nodes stays intact.
			const projectId = options.projectId;
			const codes = root.querySelectorAll<HTMLElement>(
				`pre > code.language-${TABLE_EMBED_LANGUAGE}`
			);
			const hosts: Array<{ host: HTMLElement; tableId: string }> = [];
			for (const code of codes) {
				const tableId = (code.textContent ?? '').trim();
				const pre = code.parentElement;
				if (!pre || !isUuid(tableId) || !projectId) continue;
				pre.className = EMBED_HOST_CLASS;
				pre.dataset.tableEmbed = tableId;
				pre.replaceChildren();
				hosts.push({ host: pre, tableId });
			}
			// Hosts converted by an earlier run over the same nodes (re-run without
			// new HTML) get their embed back.
			for (const pre of root.querySelectorAll<HTMLElement>('pre[data-table-embed]')) {
				const tableId = pre.dataset.tableEmbed ?? '';
				if (!projectId || !isUuid(tableId) || hosts.some((entry) => entry.host === pre))
					continue;
				pre.replaceChildren();
				hosts.push({ host: pre, tableId });
			}
			if (hosts.length === 0 || !projectId) return;

			loadTableEmbed()
				.then(({ default: TableEmbed }) => {
					if (disposed) return;
					for (const { host, tableId } of hosts) {
						mounted.push(
							mount(TableEmbed, {
								target: host,
								props: {
									documentId: tableId,
									projectId,
									onOpen: options.onOpenTable
								}
							}) as Record<string, unknown>
						);
					}
				})
				.catch(() => {
					for (const { host } of hosts) {
						host.textContent = 'Table preview unavailable.';
					}
				});
		});

		return () => {
			disposed = true;
			for (const component of mounted) void unmount(component);
			for (const element of inserted) element.remove();
		};
	};
}
