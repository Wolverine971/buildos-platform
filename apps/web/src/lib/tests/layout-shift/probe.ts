// apps/web/src/lib/tests/layout-shift/probe.ts
//
// What runs inside the page: a layout-shift recorder (installed before the app
// boots) and a snapshot of the reader layout. Elements get a `data-ls-stamp` the
// first time they are seen, so a rebuilt element (a reload, a remount) shows up
// as a new stamp even when it lands in the same place.
import type { Page } from '@playwright/test';
import type { AnchorName, PageShot } from './judge';

declare global {
	interface Window {
		__lsShifts?: { at: number; value: number; sources: string[] }[];
	}
}

/** Runs before the app on every page load. */
export function recordShifts(): void {
	window.__lsShifts = [];
	const describe = (node: Node | null): string => {
		if (!node || !(node instanceof Element)) return 'text';
		const cls = [...node.classList].slice(0, 2).join('.');
		const label = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
		return `${node.tagName.toLowerCase()}${cls ? '.' + cls : ''}${label ? ` “${label}”` : ''}`;
	};
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as unknown as {
				startTime: number;
				value: number;
				sources?: { node: Node | null }[];
			}[]) {
				window.__lsShifts!.push({
					at: entry.startTime,
					value: entry.value,
					sources: (entry.sources ?? []).map((source) => describe(source.node))
				});
			}
		}).observe({ type: 'layout-shift', buffered: true });
	} catch {
		// Not every engine reports layout shifts; the structural checks still run.
	}
}

const ANCHORS: Record<AnchorName, string> = {
	panes: '.panes',
	list: '.panes .list-col',
	reader: '.panes .reader-col .reader',
	readerHead: '.panes .reader-col .reader .head',
	card: 'article.card'
};

interface ShotArgs {
	titles: string[];
	anchors: Record<string, string>;
	since: number;
}

/** Snapshot the reader layout. `titles` are the seeded rows to follow. */
export async function takeShot(page: Page, titles: string[], since: number): Promise<PageShot> {
	return page.evaluate(
		({ titles, anchors, since }: ShotArgs) => {
			let counter = Number(document.documentElement.dataset.lsCounter ?? '0');
			const stamp = (el: Element) => {
				const node = el as HTMLElement;
				if (!node.dataset.lsStamp) node.dataset.lsStamp = String(++counter);
				return node.dataset.lsStamp;
			};
			const visible = (el: Element) => {
				const rect = el.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			};
			const shotOf = (el: Element | null) => {
				if (!el || !visible(el)) return undefined;
				const rect = el.getBoundingClientRect();
				return { stamp: stamp(el), top: rect.top, left: rect.left, height: rect.height };
			};

			const anchorShots: Record<string, unknown> = {};
			for (const [name, selector] of Object.entries(anchors)) {
				const shot = shotOf(document.querySelector(selector));
				if (shot) anchorShots[name] = shot;
			}

			// Rows: the seeded titles as they appear in the list column.
			const list = document.querySelector(anchors.list!);
			const rows: { title: string; top: number; stamp: string }[] = [];
			let selected: string | null = null;
			if (list) {
				// A title can show twice (Today's hero card repeats the next task): a real
				// row (data-row-id, a button, a list item) wins over a bare heading.
				const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
				const best = new Map<
					string,
					{ row: Element; host: Element | null; real: boolean }
				>();
				for (let node = walker.nextNode(); node; node = walker.nextNode()) {
					const text = (node.textContent ?? '').trim();
					const title = titles.find((candidate) => text === candidate);
					if (!title) continue;
					const host = node.parentElement;
					const real = host?.closest('[data-row-id]') ?? host?.closest('button, a, li');
					const row = real ?? host;
					if (!row || !visible(row)) continue;
					const had = best.get(title);
					if (!had || (!had.real && real))
						best.set(title, { row, host, real: Boolean(real) });
				}
				for (const [title, { row, host }] of best) {
					rows.push({ title, top: row.getBoundingClientRect().top, stamp: stamp(row) });
					if (
						row.matches('[aria-current="true"], .sel') ||
						row.querySelector('[aria-current="true"]') ||
						host?.closest('[aria-current="true"]')
					)
						selected = title;
				}
				rows.sort((a, b) => a.top - b.top);
			}

			const head = document.querySelector(anchors.readerHead!);
			const readerTitle =
				head && visible(head)
					? (head.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
					: null;

			const shifts = (window.__lsShifts ?? []).filter((entry) => entry.at >= since);
			document.documentElement.dataset.lsCounter = String(counter);
			return {
				path: location.pathname,
				scrollY: window.scrollY,
				anchors: anchorShots,
				rows,
				selected,
				readerTitle,
				shiftScore: shifts.reduce((total, entry) => total + entry.value, 0),
				shiftSources: [...new Set(shifts.flatMap((entry) => entry.sources))].slice(0, 8)
			} as PageShot;
		},
		{ titles, anchors: ANCHORS, since }
	);
}

/** The page's clock, so shifts can be counted from the moment of an action. */
export function pageNow(page: Page): Promise<number> {
	return page.evaluate(() => performance.now());
}
