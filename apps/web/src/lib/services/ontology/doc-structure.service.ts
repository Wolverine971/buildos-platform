// apps/web/src/lib/services/ontology/doc-structure.service.ts
/**
 * Document Structure Service
 *
 * Manages the hierarchical document tree structure for projects.
 * Documents are organized in a tree stored as JSONB in onto_projects.doc_structure.
 *
 * Key responsibilities:
 * - Get/update document tree structure
 * - Add/remove/move documents in the tree
 * - Sync document children columns
 * - Maintain structure history for undo/redo
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	DocStructure,
	DocTreeNode,
	EnrichedDocTreeNode,
	GetDocTreeResponse,
	OntoDocument,
	DocStructureHistoryEntry
} from '$lib/types/onto-api';

// ============================================
// TYPES
// ============================================

export type ChangeType = 'create' | 'move' | 'delete' | 'reorder' | 'reorganize';

export interface AddDocumentOptions {
	parentId?: string | null;
	position?: number;
}

export interface MoveDocumentOptions {
	newParentId: string | null;
	newPosition: number;
}

export interface RemoveDocumentOptions {
	/** 'cascade' = remove node + descendants, 'promote' = lift children to parent */
	mode?: 'cascade' | 'promote';
}

// ============================================
// STRUCTURE NORMALIZATION
// ============================================

const DEFAULT_DOC_STRUCTURE: DocStructure = { version: 1, root: [] };

function getDefaultDocStructure(): DocStructure {
	return { version: DEFAULT_DOC_STRUCTURE.version, root: [] };
}

function normalizeDocTreeNodes(nodes: unknown): DocTreeNode[] {
	if (!Array.isArray(nodes)) return [];

	const result: DocTreeNode[] = [];

	for (const raw of nodes) {
		if (!raw || typeof raw !== 'object') continue;

		const record = raw as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : null;
		if (!id) continue;

		const order =
			typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0;
		const type = record.type === 'folder' || record.type === 'doc' ? record.type : undefined;
		const children = normalizeDocTreeNodes(record.children);

		const node: DocTreeNode = {
			id,
			order,
			...(type ? { type } : {}),
			...(children.length > 0 ? { children } : {})
		};

		result.push(node);
	}

	return result;
}

function parseDocStructure(value: unknown): DocStructure {
	if (value === null || value === undefined) return getDefaultDocStructure();

	if (typeof value === 'string') {
		try {
			return parseDocStructure(JSON.parse(value));
		} catch {
			return getDefaultDocStructure();
		}
	}

	if (Array.isArray(value)) {
		return {
			version: DEFAULT_DOC_STRUCTURE.version,
			root: normalizeDocTreeNodes(value)
		};
	}

	if (typeof value !== 'object') return getDefaultDocStructure();

	const record = value as Record<string, unknown>;
	const versionRaw = record.version;
	const version =
		typeof versionRaw === 'number' && Number.isFinite(versionRaw)
			? versionRaw
			: DEFAULT_DOC_STRUCTURE.version;

	return {
		version,
		root: normalizeDocTreeNodes(record.root)
	};
}

// ============================================
// TREE TRAVERSAL UTILITIES
// ============================================

/**
 * Collect all document IDs from a tree structure
 */
export function collectDocIds(nodes: DocTreeNode[]): Set<string> {
	const ids = new Set<string>();

	function traverse(node: DocTreeNode) {
		ids.add(node.id);
		if (node.children) {
			node.children.forEach(traverse);
		}
	}

	nodes.forEach(traverse);
	return ids;
}

/**
 * Find a node by ID in the tree
 */
export function findNodeById(
	nodes: DocTreeNode[],
	id: string
): { node: DocTreeNode; parent: DocTreeNode | null; index: number } | null {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node) continue;
		if (node.id === id) {
			return { node, parent: null, index: i };
		}
		if (node.children) {
			const found = findNodeInChildren(node, id);
			if (found) return found;
		}
	}
	return null;
}

function findNodeInChildren(
	parent: DocTreeNode,
	id: string
): { node: DocTreeNode; parent: DocTreeNode; index: number } | null {
	if (!parent.children) return null;

	for (let i = 0; i < parent.children.length; i++) {
		const child = parent.children[i];
		if (!child) continue;
		if (child.id === id) {
			return { node: child, parent, index: i };
		}
		const found = findNodeInChildren(child, id);
		if (found) return found;
	}
	return null;
}

/**
 * Get the path to a node (array of ancestor IDs)
 */
export function getNodePath(nodes: DocTreeNode[], id: string): string[] {
	const path: string[] = [];

	function traverse(currentNodes: DocTreeNode[], currentPath: string[]): boolean {
		for (const node of currentNodes) {
			if (node.id === id) {
				path.push(...currentPath, node.id);
				return true;
			}
			if (node.children) {
				if (traverse(node.children, [...currentPath, node.id])) {
					return true;
				}
			}
		}
		return false;
	}

	traverse(nodes, []);
	return path;
}

/**
 * Check if moving a node would create a cycle
 */
export function wouldCreateCycle(
	nodes: DocTreeNode[],
	nodeId: string,
	newParentId: string | null
): boolean {
	if (!newParentId) return false;
	if (newParentId === nodeId) return true;

	// Get all descendants of the node being moved
	const findResult = findNodeById(nodes, nodeId);
	if (!findResult) return false;

	const descendants = collectDocIds(findResult.node.children || []);

	// Check if new parent is a descendant
	return descendants.has(newParentId);
}

/**
 * Remove a node from the tree (returns new tree)
 */
export function removeNodeFromTree(nodes: DocTreeNode[], id: string): DocTreeNode[] {
	const filtered = nodes
		.filter((node) => node.id !== id)
		.map((node) => ({
			...node,
			children: node.children ? removeNodeFromTree(node.children, id) : undefined
		}));
	return reorderNodes(filtered);
}

/**
 * Remove a node but promote its children to the removed node's parent level.
 * This preserves subtrees while removing the parent container.
 */
export function removeNodeFromTreePromoteChildren(nodes: DocTreeNode[], id: string): DocTreeNode[] {
	const next: DocTreeNode[] = [];

	for (const node of nodes) {
		if (node.id === id) {
			if (node.children && node.children.length > 0) {
				next.push(...node.children);
			}
			continue;
		}

		const updatedNode = node.children
			? { ...node, children: removeNodeFromTreePromoteChildren(node.children, id) }
			: node;
		next.push(updatedNode);
	}

	return reorderNodes(next);
}

/**
 * Insert a node into the tree at a specific location
 */
export function insertNodeIntoTree(
	nodes: DocTreeNode[],
	newNode: DocTreeNode,
	parentId: string | null,
	position: number
): DocTreeNode[] {
	if (parentId === null) {
		// Insert at root level
		const result = [...nodes];
		const insertPos = Math.min(position, result.length);
		result.splice(insertPos, 0, newNode);
		return reorderNodes(result);
	}

	return nodes.map((node) => {
		if (node.id === parentId) {
			const children = node.children || [];
			const insertPos = Math.min(position, children.length);
			const newChildren = [...children];
			newChildren.splice(insertPos, 0, newNode);
			return {
				...node,
				children: reorderNodes(newChildren)
			};
		}
		if (node.children) {
			return {
				...node,
				children: insertNodeIntoTree(node.children, newNode, parentId, position)
			};
		}
		return node;
	});
}

/**
 * Reorder nodes to have sequential order values
 */
export function reorderNodes(nodes: DocTreeNode[]): DocTreeNode[] {
	return nodes.map((node, index) => ({
		...node,
		order: index
	}));
}

/**
 * Prune nodes that no longer exist in the document set
 */
export function pruneDeletedNodes(nodes: DocTreeNode[], activeDocIds: Set<string>): DocTreeNode[] {
	return nodes
		.filter((node) => activeDocIds.has(node.id))
		.map((node) => ({
			...node,
			children: node.children ? pruneDeletedNodes(node.children, activeDocIds) : undefined
		}));
}

// ============================================
// ENRICHMENT
// ============================================

/**
 * Enrich tree nodes with document metadata
 */
export function enrichTreeNodes(
	nodes: DocTreeNode[],
	documents: Record<string, OntoDocument>,
	depth: number = 0,
	parentPath: string[] = []
): EnrichedDocTreeNode[] {
	return nodes.map((node) => {
		const doc = documents[node.id];
		const path = [...parentPath, node.id];
		const resolvedType: EnrichedDocTreeNode['type'] =
			node.children && node.children.length > 0 ? 'folder' : 'doc';

		const enriched: EnrichedDocTreeNode = {
			id: node.id,
			type: resolvedType,
			order: node.order,
			title: doc?.title || 'Untitled',
			description: doc?.description || null,
			state_key: doc?.state_key || 'draft',
			type_key: doc?.type_key || 'document',
			has_content: !!(doc?.content && doc.content.trim().length > 0),
			created_at: doc?.created_at || new Date().toISOString(),
			updated_at: doc?.updated_at || new Date().toISOString(),
			depth,
			path
		};

		if (node.children && node.children.length > 0) {
			enriched.children = enrichTreeNodes(node.children, documents, depth + 1, path);
		}

		return enriched;
	});
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Get the document tree for a project
 */
export async function getDocTree(
	supabase: SupabaseClient<Database>,
	projectId: string,
	options: { includeContent?: boolean } = {}
): Promise<GetDocTreeResponse> {
	const includeContent = options.includeContent ?? true;
	// Fetch project with doc_structure
	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.single();

	if (projectError) {
		throw new Error(`Failed to fetch project: ${projectError.message}`);
	}

	const structure = parseDocStructure(project?.doc_structure);

	const documentSelect = includeContent
		? '*'
		: 'id, project_id, title, type_key, state_key, description, props, children, created_at, updated_at';

	// Fetch all active documents for this project
	const { data: docs, error: docsError } = await supabase
		.from('onto_documents')
		.select(documentSelect)
		.eq('project_id', projectId)
		.is('deleted_at', null);

	if (docsError) {
		throw new Error(`Failed to fetch documents: ${docsError.message}`);
	}

	// Build document lookup
	const documents: Record<string, OntoDocument> = {};
	for (const doc of docs || []) {
		documents[doc.id] = doc as OntoDocument;
	}

	// Find unlinked documents (in DB but not in structure)
	const structureDocIds = collectDocIds(structure.root);
	const unlinked = (docs || [])
		.filter((doc) => !structureDocIds.has(doc.id))
		.map((doc) => doc as OntoDocument);

	return { structure, documents, unlinked };
}

/**
 * Update the document tree structure
 * Includes optimistic locking via version check
 */
export async function updateDocStructure(
	supabase: SupabaseClient<Database>,
	projectId: string,
	newStructure: DocStructure,
	changeType: ChangeType,
	actorId?: string
): Promise<DocStructure> {
	// Fetch current structure to check version
	const { data: current, error: fetchError } = await supabase
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.single();

	if (fetchError) {
		throw new Error(`Failed to fetch current structure: ${fetchError.message}`);
	}

	const currentStructure = parseDocStructure(current?.doc_structure);
	const currentVersion = currentStructure.version;

	if (newStructure.version !== currentVersion) {
		throw new Error(
			`Structure version conflict: expected ${currentVersion}, got ${newStructure.version}`
		);
	}

	// Increment version
	const updatedStructure: DocStructure = {
		...newStructure,
		version: currentVersion + 1
	};

	// Update the project
	const { error: updateError } = await supabase
		.from('onto_projects')
		.update({
			doc_structure:
				updatedStructure as unknown as Database['public']['Tables']['onto_projects']['Update']['doc_structure']
		})
		.eq('id', projectId);

	if (updateError) {
		throw new Error(`Failed to update structure: ${updateError.message}`);
	}

	// Save to history
	await saveStructureHistory(supabase, projectId, updatedStructure, changeType, actorId);

	// Update document children columns
	await syncDocumentChildren(supabase, projectId, updatedStructure);

	return updatedStructure;
}

/**
 * Save structure to history table
 */
async function saveStructureHistory(
	supabase: SupabaseClient<Database>,
	projectId: string,
	structure: DocStructure,
	changeType: ChangeType,
	actorId?: string
): Promise<void> {
	const { error } = await supabase.from('onto_project_structure_history').insert({
		project_id: projectId,
		doc_structure:
			structure as unknown as Database['public']['Tables']['onto_project_structure_history']['Insert']['doc_structure'],
		version: structure.version,
		changed_by: actorId || null,
		change_type: changeType
	});

	if (error) {
		// Log but don't fail - history is for undo, not critical path
		console.error('Failed to save structure history:', error);
	}
}

/**
 * Sync document children columns based on current structure
 */
async function syncDocumentChildren(
	supabase: SupabaseClient<Database>,
	projectId: string,
	structure: DocStructure
): Promise<void> {
	// Build a map of document ID -> children
	const childrenMap = new Map<string, Array<{ id: string; order: number }>>();

	function traverse(nodes: DocTreeNode[]) {
		for (const node of nodes) {
			if (node.children && node.children.length > 0) {
				childrenMap.set(
					node.id,
					node.children.map((c) => ({ id: c.id, order: c.order }))
				);
				traverse(node.children);
			} else {
				// Document has no children - set empty array
				childrenMap.set(node.id, []);
			}
		}
	}

	traverse(structure.root);

	// Update each document's children column
	for (const [docId, children] of childrenMap) {
		const { error } = await supabase
			.from('onto_documents')
			.update({
				children: {
					children
				} as unknown as Database['public']['Tables']['onto_documents']['Update']['children']
			})
			.eq('id', docId)
			.eq('project_id', projectId);

		if (error) {
			console.error(`Failed to update children for doc ${docId}:`, error);
		}
	}
}

/**
 * Add a document to the tree
 */
export async function addDocumentToTree(
	supabase: SupabaseClient<Database>,
	projectId: string,
	docId: string,
	options: AddDocumentOptions = {},
	actorId?: string
): Promise<DocStructure> {
	const { parentId = null, position } = options;

	// Get current structure
	const { structure } = await getDocTree(supabase, projectId);

	// Check if document already exists in tree
	if (collectDocIds(structure.root).has(docId)) {
		throw new Error('Document already exists in tree');
	}

	let resolvedParentId = parentId === docId ? null : parentId;
	if (resolvedParentId && !findNodeById(structure.root, resolvedParentId)) {
		resolvedParentId = null;
	}

	// Create new node
	const newNode: DocTreeNode = {
		id: docId,
		order: 0 // Will be set by insertNodeIntoTree
	};

	// Determine position
	let insertPosition = position;
	if (insertPosition === undefined) {
		// Default to end
		if (resolvedParentId === null) {
			insertPosition = structure.root.length;
		} else {
			const parent = findNodeById(structure.root, resolvedParentId);
			insertPosition = parent?.node.children?.length || 0;
		}
	}

	// Insert into tree
	const newRoot = insertNodeIntoTree(structure.root, newNode, resolvedParentId, insertPosition);

	const newStructure: DocStructure = {
		version: structure.version,
		root: newRoot
	};

	return updateDocStructure(supabase, projectId, newStructure, 'create', actorId);
}

/**
 * Remove a document from the tree (does not delete the document itself)
 * mode='cascade' removes the subtree, mode='promote' lifts children to the parent.
 */
export async function removeDocumentFromTree(
	supabase: SupabaseClient<Database>,
	projectId: string,
	docId: string,
	options: RemoveDocumentOptions = {},
	actorId?: string
): Promise<DocStructure> {
	const { structure } = await getDocTree(supabase, projectId);

	const mode = options.mode ?? 'cascade';
	const newRoot =
		mode === 'promote'
			? removeNodeFromTreePromoteChildren(structure.root, docId)
			: removeNodeFromTree(structure.root, docId);

	const newStructure: DocStructure = {
		version: structure.version,
		root: newRoot
	};

	return updateDocStructure(supabase, projectId, newStructure, 'delete', actorId);
}

/**
 * Move a document to a new location in the tree
 */
export async function moveDocument(
	supabase: SupabaseClient<Database>,
	projectId: string,
	docId: string,
	options: MoveDocumentOptions,
	actorId?: string
): Promise<DocStructure> {
	const { newParentId, newPosition } = options;
	const { structure } = await getDocTree(supabase, projectId);

	let resolvedParentId = newParentId === docId ? null : newParentId;
	if (resolvedParentId && !findNodeById(structure.root, resolvedParentId)) {
		resolvedParentId = null;
	}

	// Check for cycle
	if (wouldCreateCycle(structure.root, docId, resolvedParentId)) {
		throw new Error('Cannot move a folder into its own descendant');
	}

	// Find the node to move (may be unlinked and not yet in the tree)
	const findResult = findNodeById(structure.root, docId);

	// Remove from current location if it exists
	let newRoot = findResult ? removeNodeFromTree(structure.root, docId) : structure.root;

	// Create node to insert (preserve children if present)
	const nodeToMove: DocTreeNode = {
		id: docId,
		order: 0,
		children: findResult?.node.children
	};

	// Insert at new location
	newRoot = insertNodeIntoTree(newRoot, nodeToMove, resolvedParentId, newPosition);

	const newStructure: DocStructure = {
		version: structure.version,
		root: newRoot
	};

	return updateDocStructure(supabase, projectId, newStructure, 'move', actorId);
}

/**
 * Recompute the document structure from scratch
 * Useful for fixing inconsistencies or after bulk operations
 */
export async function recomputeDocStructure(
	supabase: SupabaseClient<Database>,
	projectId: string,
	actorId?: string
): Promise<DocStructure> {
	// Get current state
	const { structure } = await getDocTree(supabase, projectId);

	// Fetch all active documents to verify
	const { data: docs, error } = await supabase
		.from('onto_documents')
		.select('id')
		.eq('project_id', projectId)
		.is('deleted_at', null);

	if (error) {
		throw new Error(`Failed to fetch documents: ${error.message}`);
	}

	const activeDocIds = new Set((docs || []).map((d) => d.id));

	// Prune deleted docs from structure
	const prunedRoot = pruneDeletedNodes(structure.root, activeDocIds);

	// Add orphaned docs to root
	const structureDocIds = collectDocIds(prunedRoot);
	const orphanedDocs = [...activeDocIds].filter((id) => !structureDocIds.has(id));

	const maxOrder = prunedRoot.length > 0 ? Math.max(...prunedRoot.map((n) => n.order)) : -1;

	const orphanNodes: DocTreeNode[] = orphanedDocs.map((id, i) => ({
		id,
		type: 'doc' as const,
		order: maxOrder + 1 + i
	}));

	const newStructure: DocStructure = {
		version: structure.version,
		root: reorderNodes([...prunedRoot, ...orphanNodes])
	};

	return updateDocStructure(supabase, projectId, newStructure, 'reorganize', actorId);
}

/**
 * Get structure history for undo/redo
 */
export async function getStructureHistory(
	supabase: SupabaseClient<Database>,
	projectId: string,
	limit: number = 50
): Promise<DocStructureHistoryEntry[]> {
	const { data, error } = await supabase
		.from('onto_project_structure_history')
		.select('*')
		.eq('project_id', projectId)
		.order('version', { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(`Failed to fetch structure history: ${error.message}`);
	}

	return (data || []).map((entry) => ({
		id: entry.id,
		project_id: entry.project_id,
		doc_structure: parseDocStructure(entry.doc_structure),
		version: entry.version,
		changed_by: entry.changed_by,
		changed_at: entry.changed_at ?? new Date().toISOString(),
		change_type: entry.change_type as ChangeType
	}));
}

/**
 * Restore a previous structure version
 */
export async function restoreStructureVersion(
	supabase: SupabaseClient<Database>,
	projectId: string,
	historyId: string,
	actorId?: string
): Promise<DocStructure> {
	// Fetch current structure for version check
	const { data: current, error: currentError } = await supabase
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.single();

	if (currentError) {
		throw new Error(`Failed to fetch current structure: ${currentError.message}`);
	}

	const currentStructure = parseDocStructure(current?.doc_structure);
	const currentVersion = currentStructure.version;

	// Fetch the history entry
	const { data: entry, error } = await supabase
		.from('onto_project_structure_history')
		.select('doc_structure')
		.eq('id', historyId)
		.eq('project_id', projectId)
		.single();

	if (error || !entry) {
		throw new Error('History entry not found');
	}

	const restoredStructure = parseDocStructure(entry.doc_structure);

	// Recompute to prune any deleted docs
	const { data: docs } = await supabase
		.from('onto_documents')
		.select('id')
		.eq('project_id', projectId)
		.is('deleted_at', null);

	const activeDocIds = new Set((docs || []).map((d) => d.id));
	const prunedRoot = pruneDeletedNodes(restoredStructure.root, activeDocIds);

	const newStructure: DocStructure = {
		version: currentVersion,
		root: prunedRoot
	};

	return updateDocStructure(supabase, projectId, newStructure, 'reorganize', actorId);
}
