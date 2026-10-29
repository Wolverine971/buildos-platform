// apps/web/src/lib/components/inbox/doc-tree-preview.ts
//
// Pure helpers for the Tidy-ups "Now / After" document tree (AI Inbox, tasker 149). Reads the
// doc-tree endpoint's payload, replays the tidy-ups' raw move and archive steps on a copy of the
// tree, and returns both views with only the parts worth showing: every top-level node, the
// path down to anything that changes, and "+ N more" for the rest.
//
// Step semantics mirror the server (doc-structure.service.ts): a move lifts the node with its
// subtree and inserts it under `new_parent_id` (null = top level) at `new_position` (clamped,
// default 0); an archive removes the node with its subtree (`children: archive_children`, the
// default) or puts its children in its place (`promote_children`). Tasks are not in the tree.
import type { ProjectCleanupItem } from '@buildos/shared-types';

export type TreeOperation =
	| {
			kind: 'move';
			documentId: string;
			parentId: string | null;
			position: number;
			title: string | null;
			itemId: string;
	  }
	| {
			kind: 'archive_document';
			documentId: string;
			mode: 'archive_children' | 'promote_children';
			title: string | null;
			itemId: string;
	  }
	| { kind: 'archive_task'; taskId: string; title: string | null; itemId: string };

export type TreeSourceNode = { id: string; title: string; children: TreeSourceNode[] };

export type DocTreeSnapshot = {
	root: TreeSourceNode[];
	/** Every known document title, including documents outside the tree. */
	titles: Map<string, string>;
};

export type TreePreviewMark = 'moving' | 'moved' | 'archiving' | 'call';

export type TreePreviewNode = {
	id: string;
	title: string;
	isFolder: boolean;
	mark: TreePreviewMark | null;
	note: string | null;
	children: TreePreviewNode[];
	/** Untouched siblings folded into "+ N more". */
	hiddenCount: number;
	/** Documents inside a folder shown closed. */
	collapsedCount: number;
};

export type DocTreePreview = {
	now: TreePreviewNode[];
	after: TreePreviewNode[];
	archivedDocuments: Array<{ id: string; title: string; insideCount: number }>;
	archivedTasks: Array<{ id: string; title: string }>;
	topLevelBefore: number;
	topLevelAfter: number;
	marks: Set<TreePreviewMark>;
};

export type TreeOperationCounts = { moves: number; archives: number };

const UNTITLED = 'Untitled document';

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The verifier's decoded target title for one step (its key is `${tool}:${id}:${index}`). */
function decodedTitle(
	operations: Array<Record<string, unknown>> | undefined,
	tool: string,
	id: string
): string | null {
	for (const operation of operations ?? []) {
		const key = asText(operation.key);
		if (key && key.startsWith(`${tool}:${id}:`)) return asText(operation.target);
	}
	return null;
}

/** Every move and archive step on these items, in row order. Malformed steps are skipped. */
export function collectTreeOperations(items: readonly ProjectCleanupItem[]): TreeOperation[] {
	const operations: TreeOperation[] = [];
	for (const item of items) {
		for (const row of item.rows) {
			for (const step of row.tree_operations ?? []) {
				const args = asRecord(step?.args) ?? {};
				if (step.tool === 'move_document_in_tree') {
					const documentId = asText(args.document_id);
					if (!documentId) continue;
					const rawParent = args.new_parent_id;
					if (rawParent !== null && rawParent !== undefined && !asText(rawParent)) {
						continue;
					}
					const position =
						typeof args.new_position === 'number' &&
						Number.isInteger(args.new_position) &&
						args.new_position >= 0
							? args.new_position
							: 0;
					operations.push({
						kind: 'move',
						documentId,
						parentId: asText(rawParent),
						position,
						title: decodedTitle(row.verified_operations, step.tool, documentId),
						itemId: item.id
					});
				} else if (step.tool === 'archive_onto_document') {
					const documentId = asText(args.document_id);
					if (!documentId) continue;
					const mode =
						args.children === 'promote_children'
							? 'promote_children'
							: 'archive_children';
					operations.push({
						kind: 'archive_document',
						documentId,
						mode,
						title: decodedTitle(row.verified_operations, step.tool, documentId),
						itemId: item.id
					});
				} else if (step.tool === 'archive_onto_task') {
					const taskId = asText(args.task_id);
					if (!taskId) continue;
					operations.push({
						kind: 'archive_task',
						taskId,
						title:
							decodedTitle(row.verified_operations, step.tool, taskId) ??
							(item.rows.length === 1 ? item.title : null),
						itemId: item.id
					});
				}
			}
		}
	}
	return operations;
}

export function countTreeOperations(operations: readonly TreeOperation[]): TreeOperationCounts {
	let moves = 0;
	let archives = 0;
	for (const operation of operations) {
		if (operation.kind === 'move') moves += 1;
		else archives += 1;
	}
	return { moves, archives };
}

/** "4 moves and 6 archives" */
export function treeOperationsLine(counts: TreeOperationCounts): string | null {
	const parts = [
		counts.moves ? `${counts.moves} move${counts.moves === 1 ? '' : 's'}` : null,
		counts.archives ? `${counts.archives} archive${counts.archives === 1 ? '' : 's'}` : null
	].filter(Boolean);
	return parts.length ? parts.join(' and ') : null;
}

/** Documents these steps would move or archive. */
export function treeDocumentIds(operations: readonly TreeOperation[]): Set<string> {
	const ids = new Set<string>();
	for (const operation of operations) {
		if (operation.kind !== 'archive_task') ids.add(operation.documentId);
	}
	return ids;
}

/**
 * Reads GET /api/onto/projects/[id]/doc-tree `data` into a plain tree. Archived and deleted
 * documents leave the tree (their children stay, one level up). Null when the payload has no
 * usable structure.
 */
export function readDocTreeSnapshot(payload: unknown): DocTreeSnapshot | null {
	const data = asRecord(payload);
	const structure = asRecord(data?.structure);
	if (!structure || !Array.isArray(structure.root)) return null;

	const documents = asRecord(data?.documents) ?? {};
	const hasDocuments = Object.keys(documents).length > 0;
	const titles = new Map<string, string>();
	const gone = new Set<string>();
	for (const [id, raw] of Object.entries(documents)) {
		const doc = asRecord(raw);
		const title = asText(doc?.title);
		if (title) titles.set(id, title);
		if (doc?.state_key === 'archived' || doc?.deleted_at) gone.add(id);
	}
	for (const list of [data?.unlinked, data?.archived]) {
		if (!Array.isArray(list)) continue;
		for (const raw of list) {
			const doc = asRecord(raw);
			const id = asText(doc?.id);
			const title = asText(doc?.title);
			if (id && title && !titles.has(id)) titles.set(id, title);
		}
	}
	if (Array.isArray(data?.archived)) {
		for (const raw of data.archived) {
			const id = asText(asRecord(raw)?.id);
			if (id) gone.add(id);
		}
	}

	const seen = new Set<string>();
	const read = (nodes: unknown[]): TreeSourceNode[] => {
		const ordered = nodes
			.map((raw, index) => ({ node: asRecord(raw), index }))
			.filter((entry): entry is { node: Record<string, unknown>; index: number } =>
				Boolean(entry.node)
			)
			.sort((a, b) => {
				const orderA = typeof a.node.order === 'number' ? a.node.order : a.index;
				const orderB = typeof b.node.order === 'number' ? b.node.order : b.index;
				return orderA - orderB || a.index - b.index;
			});
		const out: TreeSourceNode[] = [];
		for (const { node } of ordered) {
			const id = asText(node.id);
			const children = Array.isArray(node.children) ? read(node.children) : [];
			if (!id || seen.has(id)) {
				out.push(...children);
				continue;
			}
			seen.add(id);
			if (gone.has(id) || (hasDocuments && !(id in documents))) {
				out.push(...children);
				continue;
			}
			const title = titles.get(id) ?? asText(node.title) ?? UNTITLED;
			if (!titles.has(id)) titles.set(id, title);
			out.push({ id, title, children });
		}
		return out;
	};

	return { root: read(structure.root), titles };
}

function cloneTree(nodes: TreeSourceNode[]): TreeSourceNode[] {
	return nodes.map((node) => ({ ...node, children: cloneTree(node.children) }));
}

type Located = { node: TreeSourceNode; siblings: TreeSourceNode[]; index: number };

function locate(nodes: TreeSourceNode[], id: string): Located | null {
	for (const [index, node] of nodes.entries()) {
		if (node.id === id) return { node, siblings: nodes, index };
		const found = locate(node.children, id);
		if (found) return found;
	}
	return null;
}

function countDescendants(node: TreeSourceNode): number {
	return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function containsId(node: TreeSourceNode, id: string): boolean {
	return node.id === id || node.children.some((child) => containsId(child, id));
}

type MarkEntry = { mark: TreePreviewMark; note: string; closed?: boolean };

/** Replays the steps on a copy of the tree and describes both views. Never throws. */
export function buildDocTreePreview(
	snapshot: DocTreeSnapshot,
	operations: readonly TreeOperation[],
	options: { callDocumentIds?: Iterable<string> } = {}
): DocTreePreview {
	const titleOf = (id: string, hint: string | null = null) =>
		snapshot.titles.get(id) ?? hint ?? UNTITLED;
	const before = snapshot.root;
	const after = cloneTree(before);
	const nowMarks = new Map<string, MarkEntry>();
	const afterMarks = new Map<string, MarkEntry>();
	const archivedDocuments: DocTreePreview['archivedDocuments'] = [];
	const archivedTasks: DocTreePreview['archivedTasks'] = [];
	const archivedIds = new Set<string>();

	for (const operation of operations) {
		if (operation.kind === 'archive_task') {
			if (!archivedTasks.some((task) => task.id === operation.taskId)) {
				archivedTasks.push({
					id: operation.taskId,
					title: operation.title ?? 'Untitled task'
				});
			}
			continue;
		}
		if (archivedIds.has(operation.documentId)) continue;

		if (operation.kind === 'move') {
			const { documentId, parentId } = operation;
			const found = locate(after, documentId);
			if (parentId && (archivedIds.has(parentId) || parentId === documentId)) continue;
			const destination = parentId ? locate(after, parentId) : null;
			if (parentId && !destination) continue;
			if (parentId && found && containsId(found.node, parentId)) continue;
			const node = found
				? found.siblings.splice(found.index, 1)[0]!
				: { id: documentId, title: titleOf(documentId, operation.title), children: [] };
			const target = destination ? destination.node.children : after;
			target.splice(Math.min(operation.position, target.length), 0, node);
			nowMarks.set(documentId, {
				mark: 'moving',
				note: `→ ${parentId ? titleOf(parentId) : 'Top level'}`
			});
			afterMarks.set(documentId, { mark: 'moved', note: 'moved here' });
			continue;
		}

		// archive_document
		const found = locate(after, operation.documentId);
		const promote = operation.mode === 'promote_children';
		const inside = found && !promote ? countDescendants(found.node) : 0;
		if (found) {
			const [node] = found.siblings.splice(found.index, 1);
			if (promote && node?.children.length) {
				found.siblings.splice(found.index, 0, ...node.children);
				for (const child of node.children) {
					afterMarks.set(child.id, { mark: 'moved', note: 'moved up' });
				}
			}
			if (!promote && node) {
				const sweep = (entry: TreeSourceNode) => {
					archivedIds.add(entry.id);
					entry.children.forEach(sweep);
				};
				sweep(node);
			}
		}
		archivedIds.add(operation.documentId);
		afterMarks.delete(operation.documentId);
		archivedDocuments.push({
			id: operation.documentId,
			title: titleOf(operation.documentId, operation.title),
			insideCount: inside
		});
		const hadChildren = found ? found.node.children.length > 0 : false;
		nowMarks.set(operation.documentId, {
			mark: 'archiving',
			note:
				inside > 0
					? `archive with ${inside} inside`
					: promote && hadChildren
						? 'archive, contents move up'
						: 'archive',
			closed: !promote
		});
	}

	for (const id of options.callDocumentIds ?? []) {
		if (nowMarks.has(id) || archivedIds.has(id)) continue;
		const entry: MarkEntry = { mark: 'call', note: 'your call, above' };
		nowMarks.set(id, entry);
		if (!afterMarks.has(id)) afterMarks.set(id, entry);
	}

	const marks = new Set<TreePreviewMark>();
	for (const entry of [...nowMarks.values(), ...afterMarks.values()]) marks.add(entry.mark);

	return {
		now: visibleNodes(before, nowMarks, true).nodes,
		after: visibleNodes(after, afterMarks, true).nodes,
		archivedDocuments,
		archivedTasks,
		topLevelBefore: before.length,
		topLevelAfter: after.length,
		marks
	};
}

function hasMarkedDescendant(node: TreeSourceNode, marks: Map<string, MarkEntry>): boolean {
	return node.children.some((child) => marks.has(child.id) || hasMarkedDescendant(child, marks));
}

function visibleNodes(
	nodes: TreeSourceNode[],
	marks: Map<string, MarkEntry>,
	topLevel: boolean
): { nodes: TreePreviewNode[]; hidden: number } {
	const out: TreePreviewNode[] = [];
	let hidden = 0;
	for (const node of nodes) {
		const entry = marks.get(node.id) ?? null;
		const openInside = !entry?.closed && hasMarkedDescendant(node, marks);
		if (!topLevel && !entry && !openInside) {
			hidden += 1;
			continue;
		}
		const inner = openInside ? visibleNodes(node.children, marks, false) : null;
		out.push({
			id: node.id,
			title: node.title,
			isFolder: node.children.length > 0,
			mark: entry?.mark ?? null,
			note: entry?.note ?? null,
			children: inner?.nodes ?? [],
			hiddenCount: inner?.hidden ?? 0,
			collapsedCount: inner || entry?.closed ? 0 : countDescendants(node)
		});
	}
	return { nodes: out, hidden };
}
