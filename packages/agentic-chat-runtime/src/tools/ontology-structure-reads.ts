// packages/agentic-chat-runtime/src/tools/ontology-structure-reads.ts
// Phase 4 Slice 18 S3-T9: project graph and document-structure reads.

import { getDocTree } from '@buildos/shared-agent-ops/ontology/doc-structure.service';
import type { GetDocTreeResponse } from '@buildos/shared-agent-ops/ontology/onto-api';
import { loadProjectGraphData } from '@buildos/shared-agent-ops/ontology/project-graph-loader';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { stripInternalPayloadFields } from './ontology-reads';
import { loadReadableOntologyDetailRow } from './ontology-detail-reads';

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
	const rawTree = await loadDocumentTreePayload(context.client, args.project_id, {
		includeDocuments,
		includeContent
	});
	// Preserve the legacy doc-tree agent payload byte-for-byte. Unlike detail
	// reads, this tool historically forwarded the route payload without applying
	// the internal-field sanitizer.
	const tree = rawTree;

	const documentCount = countDocumentTreeNodes(tree.structure?.root);
	const unlinkedCount = tree.unlinked.length;
	const unlinkedMessage = includeDocuments
		? unlinkedCount > 0
			? `${unlinkedCount} documents are not in the tree structure.`
			: 'All documents are organized in the tree.'
		: 'Unlinked documents not included (set include_documents=true to list them).';

	return {
		structure: tree.structure,
		documents: tree.documents ?? {},
		unlinked: tree.unlinked ?? [],
		message: `Document tree loaded with ${documentCount} nodes. ${unlinkedMessage}`
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
