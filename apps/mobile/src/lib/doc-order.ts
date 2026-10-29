// apps/mobile/src/lib/doc-order.ts
import type { DocStructure, DocTreeNode } from '@buildos/api-client';

export type DocLike = {
	id: string;
	title: string | null;
	updated_at: string;
	state_key?: string | null;
};

export type DocEntry<T extends DocLike> = { doc: T; depth: number };

function isStructure(value: unknown): value is DocStructure {
	return !!value && typeof value === 'object' && Array.isArray((value as DocStructure).root);
}

/**
 * The project's docs in the order the website's doc tree shows them, with nesting depth.
 * Docs the tree does not mention (new, or a stale tree) follow, newest first. Folder nodes with
 * no document of their own are skipped; their children keep their depth. Archived docs are left
 * out, as on the website.
 */
export function orderDocs<T extends DocLike>(
	docs: readonly T[],
	structure: unknown
): DocEntry<T>[] {
	const live = docs.filter((doc) => doc.state_key !== 'archived');
	const byId = new Map(live.map((doc) => [doc.id, doc]));
	const seen = new Set<string>();
	const ordered: DocEntry<T>[] = [];

	const walk = (nodes: DocTreeNode[], depth: number) => {
		const sorted = [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		for (const node of sorted) {
			const doc = byId.get(node.id);
			if (doc && !seen.has(doc.id)) {
				seen.add(doc.id);
				ordered.push({ doc, depth });
			}
			if (node.children?.length) walk(node.children, doc ? depth + 1 : depth);
		}
	};
	if (isStructure(structure)) walk(structure.root, 0);

	const rest = live
		.filter((doc) => !seen.has(doc.id))
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
	for (const doc of rest) ordered.push({ doc, depth: 0 });
	return ordered;
}
