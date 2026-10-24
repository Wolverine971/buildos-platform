// apps/web/src/lib/components/organize/organize-plan.ts
// Pure, immutable planning. No fetches, persistence, optimistic writes, or model calls.
import {
	collectDocIds,
	findNodeById,
	insertNodeIntoTree,
	removeNodeFromTree
} from '$lib/services/ontology/doc-structure.service';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';
import { effectiveDropPosition } from '$lib/components/ontology/doc-tree/drop-geometry';

export const MAX_ORGANIZE_OPERATIONS = 200;

export interface OrganizeDocument {
	id: string;
	title: string;
	type_key: string;
	updated_at: string;
}

export interface OrganizeTask {
	id: string;
	title: string;
	state_key: string;
	updated_at: string;
	start_at: string | null;
	due_at: string | null;
}

export interface OrganizeProject {
	id: string;
	name: string;
	updated_at: string;
	can_write: boolean;
	shared_folder_document_id: string | null;
	shared_with_count: number | null;
	structure: DocStructure;
	documents: OrganizeDocument[];
	tasks: OrganizeTask[];
}

export interface OrganizeRef {
	kind: 'document' | 'task';
	id: string;
	project_id: string;
}

export interface OrganizeMove extends OrganizeRef {
	destination_project_id: string;
	parent_id: string | null;
	/** Destination index BEFORE removing the source. Tasks use null parent and index 0. */
	position: number;
}

export interface PlannedChange {
	move: OrganizeMove;
	title: string;
	source_name: string;
	destination_name: string;
	moved_ids: string[];
	child_count: number;
	shared_with_count: number | null;
	scheduled: boolean;
}

export interface OrganizePreview {
	projects: OrganizeProject[];
	changes: PlannedChange[];
}

function projectById(projects: OrganizeProject[], id: string): OrganizeProject {
	const project = projects.find((candidate) => candidate.id === id);
	if (!project) throw new Error('Open both projects before planning this move.');
	return project;
}

export function pinnedDocumentReason(project: OrganizeProject, id: string): string | null {
	if (id === project.shared_folder_document_id) return 'The shared folder stays in this project.';
	const doc = project.documents.find((candidate) => candidate.id === id);
	if (doc?.type_key === 'document.context.project') return 'START HERE stays in this project.';
	if (doc?.type_key === 'document.context.thinking_log')
		return 'The thinking log stays in this project.';
	return null;
}

/** Includes unlinked live docs without rewriting the stored baseline tree. */
export function visibleDocumentTree(project: OrganizeProject): DocTreeNode[] {
	const liveIds = new Set(project.documents.map((doc) => doc.id));
	const seen = new Set<string>();
	function filter(nodes: DocTreeNode[]): DocTreeNode[] {
		const result: DocTreeNode[] = [];
		for (const node of nodes) {
			if (seen.has(node.id)) continue;
			seen.add(node.id);
			const children = filter(node.children ?? []);
			// A stale/archived parent must not hide its remaining live children.
			if (liveIds.has(node.id)) result.push({ ...node, children });
			else result.push(...children);
		}
		return result.map((node, order) => ({ ...node, order }));
	}
	const root = filter(project.structure.root);
	const placed = collectDocIds(root);
	return [
		...root,
		...project.documents
			.filter((doc) => !placed.has(doc.id))
			.map((doc, index) => ({
				id: doc.id,
				title: doc.title,
				order: root.length + index
			}))
	];
}

export function flattenDocumentTree(
	project: OrganizeProject
): { node: DocTreeNode; depth: number; parent_id: string | null; index: number }[] {
	const rows: ReturnType<typeof flattenDocumentTree> = [];
	function visit(nodes: DocTreeNode[], depth: number, parent_id: string | null) {
		nodes.forEach((node, index) => {
			rows.push({ node, depth, parent_id, index });
			visit(node.children ?? [], depth + 1, node.id);
		});
	}
	visit(visibleDocumentTree(project), 0, null);
	return rows;
}

function isInSharedFolder(project: OrganizeProject, parentId: string | null): boolean {
	if (!parentId || !project.shared_folder_document_id) return false;
	const shared = findNodeById(visibleDocumentTree(project), project.shared_folder_document_id);
	return !!shared && collectDocIds([shared.node]).has(parentId);
}

/** Replay in order; each operation refers to the preceding staged state. */
export function previewOrganizePlan(
	baseline: OrganizeProject[],
	moves: readonly OrganizeMove[]
): OrganizePreview {
	if (moves.length > MAX_ORGANIZE_OPERATIONS) {
		throw new Error(`A batch can contain at most ${MAX_ORGANIZE_OPERATIONS} moves.`);
	}
	if (new Set(baseline.map((project) => project.id)).size !== baseline.length) {
		throw new Error('Choose two different projects.');
	}
	let projects = baseline.map((project) => ({ ...project }));
	const changes: PlannedChange[] = [];
	for (const move of moves) {
		const source = projectById(projects, move.project_id);
		const destination = projectById(projects, move.destination_project_id);
		if (!source.can_write || !destination.can_write)
			throw new Error('Edit access is required on both projects.');
		if (!Number.isInteger(move.position) || move.position < 0)
			throw new Error('Choose a valid destination position.');
		const sameProject = source.id === destination.id;
		if (move.kind === 'task') {
			if (sameProject) throw new Error('This task is already in that project.');
			if (move.parent_id !== null)
				throw new Error('Tasks belong to projects, not document folders.');
			const task = source.tasks.find((task) => task.id === move.id);
			if (!task) throw new Error('The task is no longer in the source project.');
			if (destination.tasks.some((task) => task.id === move.id))
				throw new Error('The destination already contains this task.');
			projects = projects.map((project) =>
				project.id === source.id
					? { ...project, tasks: project.tasks.filter((task) => task.id !== move.id) }
					: project.id === destination.id
						? { ...project, tasks: [...project.tasks, task] }
						: project
			);
			changes.push({
				move,
				title: task.title,
				source_name: source.name,
				destination_name: destination.name,
				moved_ids: [task.id],
				child_count: 0,
				shared_with_count: null,
				scheduled: !!(task.start_at || task.due_at)
			});
			continue;
		}

		const sourceRoot = visibleDocumentTree(source);
		const destinationRoot = sameProject ? sourceRoot : visibleDocumentTree(destination);
		const found = findNodeById(sourceRoot, move.id);
		if (!found) throw new Error('The document is no longer in the source project.');
		const movedIds = collectDocIds([found.node]);
		for (const id of movedIds) {
			const reason = pinnedDocumentReason(source, id);
			if (reason) throw new Error(reason);
		}
		if (move.parent_id && movedIds.has(move.parent_id))
			throw new Error('Cannot move a document into its own contents.');
		const parent = move.parent_id ? findNodeById(destinationRoot, move.parent_id) : null;
		if (move.parent_id && !parent)
			throw new Error('The destination folder is no longer available.');
		const siblings = parent ? (parent.node.children ?? []) : destinationRoot;
		if (move.position > siblings.length)
			throw new Error('The destination position is no longer available.');
		const sameParent = sameProject && (found.parent?.id ?? null) === move.parent_id;
		const position = effectiveDropPosition(move.position, sameParent, found.index);
		if (sameParent && position === found.index) throw new Error('Already in this position.');
		if (!sameProject && destination.documents.some((doc) => movedIds.has(doc.id))) {
			throw new Error('The destination already contains one of these documents.');
		}
		const reduced = removeNodeFromTree(sourceRoot, move.id);
		const inserted = insertNodeIntoTree(
			sameProject ? reduced : destinationRoot,
			found.node,
			move.parent_id,
			position
		);
		const movedDocs = source.documents.filter((doc) => movedIds.has(doc.id));
		projects = projects.map((project) => {
			if (project.id === destination.id)
				return {
					...project,
					structure: { ...project.structure, root: inserted },
					documents: sameProject
						? project.documents
						: [...project.documents, ...movedDocs]
				};
			if (project.id === source.id)
				return {
					...project,
					structure: { ...project.structure, root: reduced },
					documents: project.documents.filter((doc) => !movedIds.has(doc.id))
				};
			return project;
		});
		const doc = source.documents.find((doc) => doc.id === move.id)!;
		changes.push({
			move,
			title: doc.title,
			source_name: source.name,
			destination_name: `${destination.name}${parent ? ` / ${destination.documents.find((doc) => doc.id === parent.node.id)?.title ?? 'Document'}` : ''}`,
			moved_ids: [...movedIds],
			child_count: movedIds.size - 1,
			shared_with_count: isInSharedFolder(destination, move.parent_id)
				? destination.shared_with_count
				: null,
			scheduled: false
		});
	}
	return { projects, changes };
}
