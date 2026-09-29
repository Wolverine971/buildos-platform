// packages/agentic-chat-runtime/src/tools/ontology-structure-reads.ts
// Phase 4 Slice 18 S3-T9: project graph and document-structure reads.

import { getDocTree } from '@buildos/shared-agent-ops/ontology/doc-structure.service';
import type { GetDocTreeResponse } from '@buildos/shared-agent-ops/ontology/onto-api';
import { loadProjectGraphData } from '@buildos/shared-agent-ops/ontology/project-graph-loader';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { stripInternalPayloadFields } from './ontology-reads';
import { loadReadableOntologyDetailRow } from './ontology-detail-reads';
import { isArchivedOrDeletedRecord, type RecordScopeEntity } from './record-scope';

export interface SharedGetOntoProjectGraphArgs {
	project_id: string;
}

export interface SharedGetDocumentTreeArgs {
	project_id: string;
	include_documents?: boolean;
	include_content?: boolean;
}

export interface SharedGetDocumentPathArgs {
	document_id: string;
	project_id?: string;
}

export type OntoProjectGraphPayload = {
	graph: Record<string, any>;
	metadata: {
		projectId: string;
		queryPattern: 'project-graph-loader';
		generatedAt: string;
	};
};

export type AgentDocumentTreePayload = {
	structure: GetDocTreeResponse['structure'];
	documents: Record<string, any>;
	unlinked: any[];
	message: string;
};

function countDocumentTreeNodes(nodes: unknown): number {
	if (!Array.isArray(nodes)) return 0;

	let count = 0;
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue;
		const record = node as Record<string, unknown>;
		if (typeof record.id !== 'string') continue;
		count += 1;
		count += countDocumentTreeNodes(record.children);
	}
	return count;
}

const GRAPH_RECORD_KINDS: ReadonlyArray<[string, RecordScopeEntity]> = [
	['tasks', 'task'],
	['goals', 'goal'],
	['plans', 'plan'],
	['milestones', 'milestone'],
	['risks', 'risk'],
	['documents', 'document']
];

/**
 * Chat's graph reads the present (tasker 113): archived records and the edges
 * that reach them stay out. The web graph route keeps its own full view.
 */
export function currentGraphOnly(graph: Record<string, any>): Record<string, any> {
	const dropped = new Set<string>();
	const scoped: Record<string, any> = { ...graph };
	for (const [key, entity] of GRAPH_RECORD_KINDS) {
		if (!Array.isArray(graph[key])) continue;
		scoped[key] = graph[key].filter((row: Record<string, any>) => {
			if (!isArchivedOrDeletedRecord(row, entity)) return true;
			dropped.add(row.id);
			return false;
		});
	}
	if (dropped.size > 0 && Array.isArray(graph.edges)) {
		scoped.edges = graph.edges.filter(
			(edge: Record<string, any>) => !dropped.has(edge.src_id) && !dropped.has(edge.dst_id)
		);
	}
	return scoped;
}

// An archived document can still sit in doc_structure (the connector's archive
// never touched the tree). Its live children move up to its place.
function withoutArchivedNodes(nodes: unknown, archivedIds: ReadonlySet<string>): unknown {
	if (!Array.isArray(nodes)) return nodes;
	return nodes.flatMap((node) => {
		if (!node || typeof node !== 'object') return [node];
		const record = node as Record<string, unknown>;
		const children = withoutArchivedNodes(record.children, archivedIds);
		if (typeof record.id === 'string' && archivedIds.has(record.id)) {
			return Array.isArray(children) ? children : [];
		}
		return [record.children === undefined ? record : { ...record, children }];
	});
}

/** Route-compatible graph payload after project access has already been established. */
export async function loadOntoProjectGraphPayload(
	client: AgenticChatSharedReadContextV1['client'],
	projectId: string,
	now: () => Date = () => new Date()
): Promise<OntoProjectGraphPayload> {
	const graph = await loadProjectGraphData(client, projectId, {
		excludeCompletedTasks: true
	});

	return {
		graph: stripInternalPayloadFields(graph) as unknown as Record<string, any>,
		metadata: {
			projectId,
			queryPattern: 'project-graph-loader',
			generatedAt: now().toISOString()
		}
	};
}

export async function getOntoProjectGraph(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoProjectGraphArgs,
	now?: () => Date
): Promise<OntoProjectGraphPayload & { message: string }> {
	if (!args.project_id) throw new Error('project_id is required for get_onto_project_graph');

	await context.access.assertProjectAccess(args.project_id, 'read');
	const payload = await loadOntoProjectGraphPayload(context.client, args.project_id, now);
	return {
		...payload,
		graph: currentGraphOnly(payload.graph),
		message: 'Complete ontology project graph loaded.'
	};
}

/** Route-compatible tree payload after project access has already been established. */
export async function loadDocumentTreePayload(
	client: AgenticChatSharedReadContextV1['client'],
	projectId: string,
	options: { includeDocuments: boolean; includeContent: boolean }
): Promise<GetDocTreeResponse> {
	return getDocTree(client, projectId, options);
}

export async function getDocumentTree(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetDocumentTreeArgs
): Promise<AgentDocumentTreePayload> {
	if (!args.project_id) throw new Error('project_id is required for get_document_tree');

	await context.access.assertProjectAccess(args.project_id, 'read');
	const includeDocuments = args.include_documents === true;
	const includeContent = includeDocuments && args.include_content === true;
	// Document metadata is always read: it is how archived nodes are recognized.
	// Unlike detail reads, this tool forwards the route payload without the
	// internal-field sanitizer.
	const tree = await loadDocumentTreePayload(context.client, args.project_id, {
		includeDocuments: true,
		includeContent
	});

	// Chat reads the present (tasker 113): archived documents leave the tree, the
	// document map and the unlinked list.
	const archivedIds = new Set<string>([
		...(tree.archived ?? []).map((doc: any) => String(doc?.id)),
		...Object.values(tree.documents ?? {})
			.filter((doc: any) => isArchivedOrDeletedRecord(doc ?? {}, 'document'))
			.map((doc: any) => String(doc.id))
	]);
	const structure =
		archivedIds.size > 0 && tree.structure
			? {
					...tree.structure,
					root: withoutArchivedNodes(
						tree.structure.root,
						archivedIds
					) as typeof tree.structure.root
				}
			: tree.structure;
	const documents = includeDocuments
		? Object.fromEntries(
				Object.entries(tree.documents ?? {}).filter(([id]) => !archivedIds.has(id))
			)
		: {};
	const unlinked = includeDocuments
		? (tree.unlinked ?? []).filter((doc: any) => !archivedIds.has(String(doc?.id)))
		: [];

	const documentCount = countDocumentTreeNodes(structure?.root);
	const unlinkedCount = unlinked.length;
	const unlinkedMessage = includeDocuments
		? unlinkedCount > 0
			? `${unlinkedCount} documents are not in the tree structure.`
			: 'All documents are organized in the tree.'
		: 'Unlinked documents not included (set include_documents=true to list them).';
	const archivedMessage =
		archivedIds.size > 0 ? ` ${archivedIds.size} archived documents are hidden.` : '';

	return {
		structure,
		documents,
		unlinked,
		message: `Document tree loaded with ${documentCount} nodes. ${unlinkedMessage}${archivedMessage}`
	};
}

export async function getDocumentPath(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetDocumentPathArgs
): Promise<{
	path: Array<{ id: string; title: string }>;
	document_id: string;
	project_id: string;
	message: string;
}> {
	if (!args.document_id) throw new Error('document_id is required for get_document_path');

	let projectId = args.project_id;
	let fallbackTitle: string | undefined;

	if (!projectId) {
		const document = await loadReadableOntologyDetailRow(context, {
			table: 'onto_documents',
			id: args.document_id,
			selection: 'id, project_id, title'
		});
		if (!document) throw new Error('Document not found');
		projectId = typeof document.project_id === 'string' ? document.project_id : undefined;
		fallbackTitle = typeof document.title === 'string' ? document.title : undefined;
	} else {
		await context.access.assertProjectAccess(projectId, 'read');
	}

	if (!projectId) throw new Error('Document has no project association');

	const tree = await loadDocumentTreePayload(context.client, projectId, {
		includeDocuments: false,
		includeContent: false
	});
	const path: Array<{ id: string; title: string }> = [];
	const resolvedTitle = fallbackTitle || 'Untitled';

	function findPath(
		nodes: unknown,
		targetId: string,
		currentPath: Array<{ id: string; title: string }>
	): boolean {
		if (!Array.isArray(nodes)) return false;
		for (const node of nodes) {
			if (!node || typeof node !== 'object') continue;
			const record = node as Record<string, unknown>;
			if (typeof record.id !== 'string') continue;
			const nodeTitle =
				typeof record.title === 'string' && record.title.trim().length > 0
					? record.title
					: 'Untitled';
			const nodeInfo = { id: record.id, title: nodeTitle };

			if (record.id === targetId) {
				path.push(...currentPath, nodeInfo);
				return true;
			}

			if (findPath(record.children, targetId, [...currentPath, nodeInfo])) return true;
		}
		return false;
	}

	const found = findPath(tree.structure?.root, args.document_id, []);
	const pathText = path.length > 0 ? path.map((item) => item.title).join(' > ') : 'Root level';
	let message = `Document path: ${pathText}`;
	if (!found && fallbackTitle) {
		message = `Document "${resolvedTitle}" is not placed in the tree (unlinked).`;
	} else if (!found) {
		message = `Document "${resolvedTitle}" not found in project ${projectId}.`;
	}

	return {
		path,
		document_id: args.document_id,
		project_id: projectId,
		message
	};
}
