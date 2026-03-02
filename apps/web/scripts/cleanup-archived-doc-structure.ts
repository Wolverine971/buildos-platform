// apps/web/scripts/cleanup-archived-doc-structure.ts
// Remove archived documents from onto_projects.doc_structure.
// Default mode is dry-run. Pass --apply to write changes.

import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
	process.env.PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing required environment variables');
	console.error('  PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
	console.error(
		'  PRIVATE_SUPABASE_SERVICE_KEY:',
		SERVICE_KEY ? 'Set' : 'Missing (also tried PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY)'
	);
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY || process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const TARGET_PROJECT_ID = getArgValue('--project-id');
const BATCH_SIZE = parsePositiveInt(getArgValue('--batch-size') ?? process.env.BATCH_SIZE, 100);
const MAX_PROJECTS = parseNonNegativeInt(
	getArgValue('--max-projects') ?? process.env.MAX_PROJECTS,
	0
);
const REPORT_LIMIT = parsePositiveInt(getArgValue('--report-limit'), 25);

const supabase = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

type DocTreeNode = {
	id: string;
	order: number;
	type?: 'folder' | 'doc';
	title?: string | null;
	description?: string | null;
	children?: DocTreeNode[];
};

type DocStructure = {
	version: number;
	root: DocTreeNode[];
};

type ProjectRow = {
	id: string;
	name: string | null;
	doc_structure: unknown;
	updated_at: string | null;
};

type CleanupStats = {
	archivedNodesRemoved: number;
	promotedNodes: number;
};

type ProjectImpact = {
	projectId: string;
	projectName: string;
	archivedNodeCountInTree: number;
	nodesRemovedFromTree: number;
	nodesPromoted: number;
	oldVersion: number;
	newVersion: number;
};

function getArgValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index === -1) return undefined;
	return process.argv[index + 1];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isFinite(parsed) && parsed >= 0) return parsed;
	return fallback;
}

const DEFAULT_DOC_STRUCTURE: DocStructure = { version: 1, root: [] };

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
		const titleCandidate = record.title ?? record.name;
		const title =
			typeof titleCandidate === 'string'
				? titleCandidate
				: titleCandidate === null
					? null
					: undefined;
		const descriptionCandidate = record.description;
		const description =
			typeof descriptionCandidate === 'string'
				? descriptionCandidate
				: descriptionCandidate === null
					? null
					: undefined;
		const children = normalizeDocTreeNodes(record.children);

		const node: DocTreeNode = {
			id,
			order,
			...(type ? { type } : {}),
			...(title !== undefined ? { title } : {}),
			...(description !== undefined ? { description } : {}),
			...(children.length > 0 ? { children } : {})
		};
		result.push(node);
	}

	return result;
}

function parseDocStructure(value: unknown): DocStructure {
	if (value === null || value === undefined) return { ...DEFAULT_DOC_STRUCTURE, root: [] };

	if (typeof value === 'string') {
		try {
			return parseDocStructure(JSON.parse(value));
		} catch {
			return { ...DEFAULT_DOC_STRUCTURE, root: [] };
		}
	}

	if (Array.isArray(value)) {
		return { version: DEFAULT_DOC_STRUCTURE.version, root: normalizeDocTreeNodes(value) };
	}

	if (typeof value !== 'object') {
		return { ...DEFAULT_DOC_STRUCTURE, root: [] };
	}

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

function normalizeDocumentState(state: unknown): string {
	if (typeof state !== 'string') return 'draft';
	const normalized = state
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return 'draft';
	if (normalized === 'review') return 'in_review';
	if (normalized === 'inreview') return 'in_review';
	if (normalized === 'archive') return 'archived';
	return normalized;
}

function collectDocIds(nodes: DocTreeNode[]): Set<string> {
	const ids = new Set<string>();
	const traverse = (node: DocTreeNode): void => {
		ids.add(node.id);
		if (node.children) {
			for (const child of node.children) traverse(child);
		}
	};
	for (const node of nodes) traverse(node);
	return ids;
}

function reorderNodes(nodes: DocTreeNode[]): DocTreeNode[] {
	return nodes.map((node, index) => ({
		...node,
		order: index,
		...(node.children && node.children.length > 0 ? { children: node.children } : {})
	}));
}

function removeArchivedNodesPromoteChildren(
	nodes: DocTreeNode[],
	archivedDocIds: Set<string>,
	stats: CleanupStats
): DocTreeNode[] {
	const next: DocTreeNode[] = [];

	for (const node of nodes) {
		const cleanedChildren = node.children
			? removeArchivedNodesPromoteChildren(node.children, archivedDocIds, stats)
			: [];

		if (archivedDocIds.has(node.id)) {
			stats.archivedNodesRemoved += 1;
			if (cleanedChildren.length > 0) {
				stats.promotedNodes += cleanedChildren.length;
				next.push(...cleanedChildren);
			}
			continue;
		}

		next.push({
			...node,
			...(cleanedChildren.length > 0
				? { children: cleanedChildren }
				: { children: undefined })
		});
	}

	return reorderNodes(next);
}

function buildChildrenMap(
	structure: DocStructure
): Map<string, Array<{ id: string; order: number }>> {
	const map = new Map<string, Array<{ id: string; order: number }>>();
	const traverse = (nodes: DocTreeNode[]) => {
		for (const node of nodes) {
			const children = (node.children ?? []).map((child, index) => ({
				id: child.id,
				order: index
			}));
			map.set(node.id, children);
			if (node.children && node.children.length > 0) {
				traverse(node.children);
			}
		}
	};
	traverse(structure.root);
	return map;
}

function chunk<T>(items: T[], size: number): T[][] {
	if (items.length === 0) return [];
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

async function getArchivedDocIdsInTree(
	projectId: string,
	treeDocIds: string[]
): Promise<Set<string>> {
	const archived = new Set<string>();
	for (const idChunk of chunk(treeDocIds, 500)) {
		const { data, error } = await supabase
			.from('onto_documents')
			.select('id, state_key')
			.eq('project_id', projectId)
			.in('id', idChunk)
			.is('deleted_at', null);

		if (error) {
			throw new Error(
				`Failed loading document states for project ${projectId}: ${error.message}`
			);
		}

		for (const doc of data ?? []) {
			if (normalizeDocumentState(doc.state_key) === 'archived') {
				archived.add(doc.id);
			}
		}
	}
	return archived;
}

async function syncChildrenColumns(
	projectId: string,
	oldStructure: DocStructure,
	newStructure: DocStructure
): Promise<void> {
	const oldIds = collectDocIds(oldStructure.root);
	const newChildrenMap = buildChildrenMap(newStructure);
	const idsToUpdate = new Set<string>([...oldIds, ...newChildrenMap.keys()]);

	for (const docId of idsToUpdate) {
		const children = newChildrenMap.get(docId) ?? [];
		const { error } = await supabase
			.from('onto_documents')
			.update({
				children: {
					children
				}
			})
			.eq('id', docId)
			.eq('project_id', projectId)
			.is('deleted_at', null);

		if (error) {
			throw new Error(
				`Failed updating children for doc ${docId} in project ${projectId}: ${error.message}`
			);
		}
	}
}

async function insertStructureHistory(projectId: string, structure: DocStructure): Promise<void> {
	const { error } = await supabase.from('onto_project_structure_history').insert({
		project_id: projectId,
		doc_structure: structure,
		version: structure.version,
		changed_by: null,
		change_type: 'reorganize'
	});
	if (error) {
		throw new Error(
			`Failed inserting structure history for project ${projectId}: ${error.message}`
		);
	}
}

async function loadProjectBatch(offset: number, limit: number): Promise<ProjectRow[]> {
	let query = supabase
		.from('onto_projects')
		.select('id, name, doc_structure, updated_at')
		.is('deleted_at', null)
		.order('id', { ascending: true })
		.range(offset, offset + limit - 1);

	if (TARGET_PROJECT_ID) {
		query = query.eq('id', TARGET_PROJECT_ID);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(`Failed loading projects: ${error.message}`);
	}

	return (data ?? []) as ProjectRow[];
}

async function run(): Promise<void> {
	console.log('Archived doc_structure cleanup');
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
	if (!DRY_RUN) {
		console.log('Writes enabled: will update onto_projects.doc_structure + children + history');
	}
	if (TARGET_PROJECT_ID) {
		console.log(`Target project: ${TARGET_PROJECT_ID}`);
	}
	if (MAX_PROJECTS > 0) {
		console.log(`Max projects: ${MAX_PROJECTS}`);
	}
	console.log(`Batch size: ${BATCH_SIZE}`);

	let offset = 0;
	let scannedProjects = 0;
	let projectsWithArchivedInTree = 0;
	let projectsNeedingChange = 0;
	let projectsUpdated = 0;
	let projectConflicts = 0;
	let totalArchivedNodesRemoved = 0;
	let totalPromotedNodes = 0;
	let totalNodesRemovedFromTree = 0;
	let errorCount = 0;
	const impacts: ProjectImpact[] = [];

	for (;;) {
		if (MAX_PROJECTS > 0 && scannedProjects >= MAX_PROJECTS) break;

		const batchLimit =
			MAX_PROJECTS > 0
				? Math.min(BATCH_SIZE, Math.max(0, MAX_PROJECTS - scannedProjects))
				: BATCH_SIZE;
		if (batchLimit <= 0) break;

		const projects = await loadProjectBatch(offset, batchLimit);
		if (projects.length === 0) break;

		for (const project of projects) {
			scannedProjects += 1;
			if (MAX_PROJECTS > 0 && scannedProjects > MAX_PROJECTS) break;

			try {
				const structure = parseDocStructure(project.doc_structure);
				const treeDocIds = [...collectDocIds(structure.root)];
				if (treeDocIds.length === 0) continue;

				const archivedDocIds = await getArchivedDocIdsInTree(project.id, treeDocIds);
				if (archivedDocIds.size === 0) continue;
				projectsWithArchivedInTree += 1;

				const stats: CleanupStats = { archivedNodesRemoved: 0, promotedNodes: 0 };
				const nextRoot = removeArchivedNodesPromoteChildren(
					structure.root,
					archivedDocIds,
					stats
				);
				const nextStructure: DocStructure = {
					version: structure.version + 1,
					root: nextRoot
				};

				const oldIds = collectDocIds(structure.root);
				const newIds = collectDocIds(nextRoot);
				const nodesRemovedFromTree = [...oldIds].filter((id) => !newIds.has(id)).length;
				const changed = JSON.stringify(structure.root) !== JSON.stringify(nextRoot);

				if (!changed) {
					continue;
				}

				projectsNeedingChange += 1;
				totalArchivedNodesRemoved += stats.archivedNodesRemoved;
				totalPromotedNodes += stats.promotedNodes;
				totalNodesRemovedFromTree += nodesRemovedFromTree;

				const impact: ProjectImpact = {
					projectId: project.id,
					projectName: project.name ?? 'Untitled Project',
					archivedNodeCountInTree: archivedDocIds.size,
					nodesRemovedFromTree,
					nodesPromoted: stats.promotedNodes,
					oldVersion: structure.version,
					newVersion: nextStructure.version
				};
				impacts.push(impact);

				if (VERBOSE || DRY_RUN) {
					console.log(
						`[${DRY_RUN ? 'DRY-RUN' : 'APPLY'}] ${project.id} "${impact.projectName}" archivedInTree=${impact.archivedNodeCountInTree} removed=${impact.nodesRemovedFromTree} promoted=${impact.nodesPromoted} v${impact.oldVersion}->v${impact.newVersion}`
					);
				}

				if (DRY_RUN) {
					continue;
				}

				const { data: updatedRows, error: updateError } = await supabase
					.from('onto_projects')
					.update({ doc_structure: nextStructure })
					.eq('id', project.id)
					.eq('updated_at', project.updated_at)
					.select('id');

				if (updateError) {
					throw new Error(
						`Failed updating project ${project.id}: ${updateError.message}`
					);
				}

				if (!updatedRows || updatedRows.length === 0) {
					projectConflicts += 1;
					console.warn(
						`[CONFLICT] Project ${project.id} was modified during migration; skipped this project`
					);
					continue;
				}

				await insertStructureHistory(project.id, nextStructure);
				await syncChildrenColumns(project.id, structure, nextStructure);

				projectsUpdated += 1;
			} catch (error) {
				errorCount += 1;
				console.error(
					`[ERROR] Project ${project.id}:`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}

		offset += projects.length;
		if (TARGET_PROJECT_ID) break;
		if (projects.length < batchLimit) break;
	}

	const topImpacts = [...impacts]
		.sort((a, b) => b.nodesRemovedFromTree - a.nodesRemovedFromTree)
		.slice(0, REPORT_LIMIT);

	console.log('\nSummary');
	console.log(`  Scanned projects: ${scannedProjects}`);
	console.log(`  Projects with archived docs in tree: ${projectsWithArchivedInTree}`);
	console.log(`  Projects needing change: ${projectsNeedingChange}`);
	if (!DRY_RUN) {
		console.log(`  Projects updated: ${projectsUpdated}`);
		console.log(`  Update conflicts (skipped): ${projectConflicts}`);
	}
	console.log(`  Archived nodes removed: ${totalArchivedNodesRemoved}`);
	console.log(`  Total nodes removed from tree: ${totalNodesRemovedFromTree}`);
	console.log(`  Nodes promoted: ${totalPromotedNodes}`);
	console.log(`  Errors: ${errorCount}`);

	if (topImpacts.length > 0) {
		console.log(`\nTop impacted projects (max ${REPORT_LIMIT})`);
		for (const impact of topImpacts) {
			console.log(
				`  ${impact.projectId} | ${impact.projectName} | removed=${impact.nodesRemovedFromTree}, promoted=${impact.nodesPromoted}, archivedInTree=${impact.archivedNodeCountInTree}, version=${impact.oldVersion}->${impact.newVersion}`
			);
		}
	}

	if (DRY_RUN) {
		console.log('\nNo changes were written (dry-run mode).');
		console.log(
			'Run with --apply after reviewing output, e.g. node --import tsx scripts/cleanup-archived-doc-structure.ts --apply'
		);
	}
}

run().catch((error) => {
	console.error('Cleanup failed:', error);
	process.exit(1);
});
