// apps/web/src/lib/services/context/context-formatters.ts
/**
 * Context Formatters
 *
 * Utilities for formatting ontology context into LLM-friendly strings.
 */

import type {
	OntologyContext,
	ProjectFocus,
	OntologyEntityType,
	ProjectHighlights,
	DocumentTreeContext,
	DocStructureCache
} from '$lib/types/agent-chat-enhancement';
import type { FormattedContextResult } from './types';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';

const truncateText = (value: string | null | undefined, limit: number): string | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length <= limit) return trimmed;
	return `${trimmed.slice(0, limit).trimEnd()}...`;
};

const formatDateShort = (value?: string | null): string | null => {
	if (!value) return null;
	return value.split('T')[0] || value;
};

type DocumentTreeNode = DocumentTreeContext['root'][number];
type DocStructureContext = {
	structure: DocStructure;
	documents: DocStructureCache['documents'];
	unlinked?: string[];
};

function findDocumentNodeWithPath(
	nodes: DocumentTreeNode[],
	targetId: string,
	path: DocumentTreeNode[] = []
): { node: DocumentTreeNode; path: DocumentTreeNode[] } | null {
	for (const node of nodes) {
		if (node.id === targetId) {
			return { node, path };
		}
		if (node.children && node.children.length > 0) {
			const found = findDocumentNodeWithPath(node.children, targetId, [...path, node]);
			if (found) return found;
		}
	}
	return null;
}

function formatDocumentFocusDetails(
	tree: DocumentTreeContext | undefined,
	documentId?: string | null
): string {
	if (!documentId) return '';
	if (!tree) {
		return `### Document Tree Focus
- Document tree not loaded. Use get_document_tree or get_document_path for hierarchy.`;
	}

	const found = findDocumentNodeWithPath(tree.root, documentId);
	if (!found) {
		return `### Document Tree Focus
- Document not found in the current tree preview.
- Use get_document_path or get_document_tree for the complete structure.`;
	}

	const pathTitles = [...found.path, found.node].map((node) => node.title).filter(Boolean);
	const lines: string[] = [];
	lines.push('### Document Tree Focus');
	lines.push(`- Path: ${pathTitles.join(' > ') || 'Unknown path'}`);

	if (found.node.children && found.node.children.length > 0) {
		const preview = found.node.children.slice(0, 6);
		lines.push(`- Children (preview): ${preview.length}`);
		preview.forEach((child) => {
			lines.push(`- ${child.title} [${child.id}]`);
		});
		if (found.node.children.length > preview.length) {
			lines.push(`- ...and ${found.node.children.length - preview.length} more`);
		}
	} else {
		lines.push('- Children: none');
	}

	if (tree.truncated) {
		lines.push('- Note: Tree preview truncated. Use get_document_tree for full child list.');
	}

	return lines.join('\n');
}

/**
 * Format ontology context for inclusion in prompt
 */
export function formatOntologyContext(
	ontology: OntologyContext,
	options?: { docStructureCache?: DocStructureCache }
): FormattedContextResult {
	let content = `## Context Overview (Internal Reference - ${ontology.type})\n\n`;

	if (ontology.type === 'project') {
		content += formatProjectContext(ontology, options?.docStructureCache);
	} else if (ontology.type === 'element') {
		content += formatElementContext(ontology, options?.docStructureCache);
	} else if (ontology.type === 'global') {
		content += formatGlobalContext(ontology);
	}

	return {
		content,
		metadata: ontology.metadata
	};
}

/**
 * Format combined context with project focus
 */
export function formatCombinedContext(
	ontology: OntologyContext,
	focus: ProjectFocus,
	options?: { docStructureCache?: DocStructureCache }
): FormattedContextResult {
	const project = ontology.entities.project;
	const element =
		focus.focusType === 'project-wide' ? undefined : getScopedEntity(ontology, focus.focusType);
	const relationships = ontology.relationships?.edges ?? [];
	const elementName = focus.focusEntityName ?? getEntityName(element) ?? 'Focused entity';
	const elementState =
		(element as Record<string, any> | undefined)?.state_key ??
		(element as Record<string, any> | undefined)?.status ??
		(element as Record<string, any> | undefined)?.type_key ??
		'n/a';
	const projectName = project?.name ?? focus.projectName;
	const projectState = project?.state_key ?? 'n/a';
	const projectType = project?.type_key ?? 'n/a';
	const relationshipSummary = relationships
		.slice(0, 8)
		.map(
			(edge) =>
				`- ${edge.relation} → ${edge.target_kind} (${edge.target_id}${edge.target_name ? ` · ${edge.target_name}` : ''})`
		)
		.join('\n');

	const sections: string[] = [];
	const projectDescription = truncateText(project?.description ?? null, 150);
	const projectStart = formatDateShort(project?.start_at ?? null);
	const projectEnd = formatDateShort(project?.end_at ?? null);
	const projectCreated = formatDateShort(project?.created_at ?? null);
	const projectUpdated = formatDateShort(project?.updated_at ?? null);
	const projectNextStep = project?.next_step_short ?? null;
	const projectNextStepLong = truncateText(project?.next_step_long ?? null, 200);
	const contextDocTitle = ontology.metadata?.context_document_title;
	const contextDocId = ontology.metadata?.context_document_id;
	const contextDocValue = contextDocTitle
		? `${contextDocTitle} [${contextDocId ?? 'unknown'}]`
		: contextDocId || 'None';
	const projectUpdatedLine =
		projectUpdated && projectUpdated !== projectCreated ? `\n- Updated: ${projectUpdated}` : '';

	sections.push(`## Project Workspace: ${projectName}
- ID: ${project?.id ?? focus.projectId}
- State: ${projectState}
- Type: ${projectType}
- Timeline: ${projectStart || 'n/a'} → ${projectEnd || 'n/a'}
- Created: ${projectCreated || 'n/a'}${projectUpdatedLine}
- Facets: context=${project?.facet_context || 'n/a'}, scale=${project?.facet_scale || 'n/a'}, stage=${project?.facet_stage || 'n/a'}
- Description: ${projectDescription || 'No description'}
- Next Step (Short): ${projectNextStep || 'None'}
- Next Step (Long): ${projectNextStepLong || 'None'}
- Context Doc: ${contextDocValue}`);

	const focusDetails = buildEntityDetailLines(focus.focusType, element);
	let focusSection = `## Current Focus (${focus.focusType})
- Name: ${elementName}
- ID: ${focus.focusEntityId ?? 'n/a'}
- State: ${elementState}`;
	if (focusDetails.length > 0) {
		focusSection += `\n${focusDetails.join('\n')}`;
	}
	if (element && element.description) {
		const descriptionSnippet = truncateText(String(element.description), 400);
		if (descriptionSnippet) {
			focusSection += `\n- Description: ${descriptionSnippet}`;
		}
	}

	sections.push(focusSection);

	const elementProps = (element as Record<string, any> | undefined)?.props as
		| Record<string, any>
		| undefined;
	if (elementProps && Object.keys(elementProps).length > 0) {
		const propKeys = Object.keys(elementProps).slice(0, 5);
		sections.push(
			`### Focus Metadata
${propKeys.map((key) => `- ${key}: ${JSON.stringify(elementProps[key])}`).join('\n')}`
		);
	}

	if (relationshipSummary) {
		sections.push(`### Relationships\n${relationshipSummary}`);
	}

	if (ontology.metadata?.graph_snapshot) {
		sections.push(
			`### Graph Snapshot (Light)\n\`\`\`json\n${JSON.stringify(
				ontology.metadata.graph_snapshot,
				null,
				2
			)}\n\`\`\``
		);
	}

	const focusDocDetails =
		focus.focusType === 'document'
			? formatDocumentFocusDetailsFromStructure(
					options?.docStructureCache,
					ontology.metadata?.doc_structure,
					focus.focusEntityId
				)
			: '';
	if (focusDocDetails) {
		sections.push(focusDocDetails);
	}

	const docStructureContext = buildDocStructureContext(ontology, options?.docStructureCache);
	const docStructureSection = formatDocStructurePreview(docStructureContext);
	if (docStructureSection) {
		sections.push(docStructureSection);
	}

	sections.push(
		'---\nFocus is scoped to this entity. Keep project awareness while prioritizing actions for the focus target.'
	);

	return {
		content: sections.filter(Boolean).join('\n\n'),
		metadata: {
			...(ontology.metadata ?? {}),
			focus_summary: {
				type: focus.focusType,
				entityId: focus.focusEntityId,
				entityName: elementName,
				projectId: focus.projectId
			}
		}
	};
}

/**
 * Detect the element type from ontology context
 */
export function detectElementType(
	ontology: OntologyContext
): Exclude<OntologyEntityType, 'project'> | undefined {
	if (ontology.scope?.focus?.type) {
		return ontology.scope.focus.type;
	}

	const candidates: Exclude<OntologyEntityType, 'project'>[] = [
		'task',
		'goal',
		'plan',
		'document',
		'milestone',
		'risk',
		'requirement'
	];

	return candidates.find((type) => !!getScopedEntity(ontology, type));
}

/**
 * Get scoped entity from ontology
 */
export function getScopedEntity(
	ontology: OntologyContext,
	type?: OntologyEntityType | ProjectFocus['focusType']
): Record<string, any> | undefined {
	if (!type || type === 'project-wide') {
		return undefined;
	}
	return (ontology.entities as Record<string, any>)[type];
}

/**
 * Get entity name from various possible fields
 */
export function getEntityName(entity?: Record<string, any> | null): string {
	if (!entity) {
		return 'Unnamed';
	}

	return (
		entity.name ||
		entity.title ||
		entity.summary ||
		entity.display_name ||
		entity.goal ||
		entity.text ||
		entity.id ||
		'Unnamed'
	);
}

function buildEntityDetailLines(
	type?: OntologyEntityType | ProjectFocus['focusType'],
	entity?: Record<string, any>
): string[] {
	if (!type || !entity) return [];

	const lines: string[] = [];
	const addLine = (label: string, value?: string | number | null): void => {
		if (value === null || value === undefined || value === '') return;
		lines.push(`- ${label}: ${value}`);
	};
	const addDate = (label: string, value?: string | null): void => {
		const formatted = formatDateShort(value);
		if (formatted) {
			lines.push(`- ${label}: ${formatted}`);
		}
	};
	const addList = (label: string, values?: string[] | null): void => {
		if (!values || values.length === 0) return;
		const preview = values.slice(0, 3).join(', ');
		const suffix = values.length > 3 ? ` (+${values.length - 3} more)` : '';
		lines.push(`- ${label}: ${preview}${suffix}`);
	};

	switch (type) {
		case 'task':
			addLine('Type', entity.type_key);
			addLine('Priority', entity.priority);
			addLine('Facet Scale', entity.facet_scale);
			addDate('Start', entity.start_at);
			addDate('Due', entity.due_at);
			addDate('Completed', entity.completed_at);
			addList('Plans', entity.plan_ids);
			addList('Goals', entity.goal_ids);
			addLine('Dependencies', entity.dependency_count);
			addLine('Dependents', entity.dependent_count);
			break;
		case 'goal':
			addLine('Type', entity.type_key);
			addLine('Goal', truncateText(entity.goal, 200));
			addDate('Target', entity.target_date);
			addDate('Completed', entity.completed_at);
			if (typeof entity.progress_percent === 'number') {
				addLine('Progress', `${entity.progress_percent}%`);
			}
			if (
				typeof entity.completed_tasks === 'number' &&
				typeof entity.total_tasks === 'number'
			) {
				addLine('Tasks', `${entity.completed_tasks}/${entity.total_tasks}`);
			}
			addLine(
				'Direct Edge',
				entity.direct_edge ? 'yes' : entity.direct_edge === false ? 'no' : null
			);
			break;
		case 'plan':
			addLine('Type', entity.type_key);
			addLine('Facet Context', entity.facet_context);
			addLine('Facet Scale', entity.facet_scale);
			addLine('Facet Stage', entity.facet_stage);
			addLine('Plan', truncateText(entity.plan, 200));
			if (typeof entity.task_count === 'number') {
				addLine('Tasks', entity.task_count);
			}
			if (typeof entity.completed_task_count === 'number') {
				addLine('Completed Tasks', entity.completed_task_count);
			}
			break;
		case 'milestone':
			addLine('Type', entity.type_key);
			addLine('Milestone', truncateText(entity.milestone, 200));
			addDate('Due', entity.due_at);
			addDate('Completed', entity.completed_at);
			break;
		case 'risk':
			addLine('Type', entity.type_key);
			addLine('Impact', entity.impact);
			addLine('Probability', entity.probability);
			addDate('Mitigated', entity.mitigated_at);
			addLine('Summary', truncateText(entity.content, 200));
			break;
		case 'requirement':
			addLine('Type', entity.type_key);
			addLine('Priority', entity.priority);
			addLine('Requirement', truncateText(entity.text, 200));
			break;
		case 'document':
			addLine('Type', entity.type_key);
			addLine(
				'Direct Edge',
				entity.direct_edge ? 'yes' : entity.direct_edge === false ? 'no' : null
			);
			break;
		default:
			addLine('Type', entity.type_key);
	}

	const created = formatDateShort(entity.created_at);
	const updated = formatDateShort(entity.updated_at);
	if (created) {
		lines.push(`- Created: ${created}`);
	}
	if (updated && updated !== created) {
		lines.push(`- Updated: ${updated}`);
	}

	return lines;
}

// ============================================
// PRIVATE FORMATTERS
// ============================================

function formatProjectContext(
	ontology: OntologyContext,
	docStructureCache?: DocStructureCache
): string {
	const project = ontology.entities.project;
	const sections: string[] = [];
	const description = truncateText(project?.description ?? null, 150);
	const nextStepShort = project?.next_step_short || null;
	const nextStepLong = truncateText(project?.next_step_long ?? null, 200);
	const startAt = formatDateShort(project?.start_at ?? null);
	const endAt = formatDateShort(project?.end_at ?? null);
	const createdAt = formatDateShort(project?.created_at ?? null);
	const updatedAt = formatDateShort(project?.updated_at ?? null);
	const contextDocTitle = ontology.metadata?.context_document_title;
	const contextDocId = ontology.metadata?.context_document_id;

	sections.push(`### Project Information
- ID: ${project?.id ?? 'unknown'}
- Name: ${project?.name ?? 'No name'}
- State: ${project?.state_key ?? 'n/a'}
- Type: ${project?.type_key ?? 'n/a'}
- Created: ${createdAt || 'Unknown'}
- Updated: ${updatedAt || 'Unknown'}
- Timeline: ${startAt || 'n/a'} → ${endAt || 'n/a'}
- Facets: context=${project?.facet_context || 'n/a'}, scale=${project?.facet_scale || 'n/a'}, stage=${project?.facet_stage || 'n/a'}
- Description: ${description || 'No description'}
- Next Step (Short): ${nextStepShort || 'None'}
- Next Step (Long): ${nextStepLong || 'None'}
- Context Doc: ${
		contextDocTitle
			? `${contextDocTitle} [${contextDocId ?? 'unknown'}]`
			: contextDocId || 'None'
	}`);

	const highlights = formatProjectHighlights(ontology.metadata?.project_highlights);
	if (highlights) {
		sections.push(highlights);
	}

	if (ontology.metadata?.graph_snapshot) {
		sections.push(
			`### Graph Snapshot (Light)\n\`\`\`json\n${JSON.stringify(
				ontology.metadata.graph_snapshot,
				null,
				2
			)}\n\`\`\``
		);
	}

	const docStructureContext = buildDocStructureContext(ontology, docStructureCache);
	const docStructureSection = formatDocStructurePreview(docStructureContext);
	if (docStructureSection) {
		sections.push(docStructureSection);
	}

	sections.push(`### Entity Summary
${
	ontology.metadata?.graph_snapshot?.coverage
		? Object.entries(ontology.metadata.graph_snapshot.coverage)
				.map(
					([type, stats]) =>
						`- ${type}: total=${stats.total}, direct=${stats.direct}, unlinked=${stats.unlinked}`
				)
				.join('\n')
		: Object.entries(ontology.metadata?.entity_count || {})
				.map(([type, count]) => `- ${type}: ${count}`)
				.join('\n') || 'No entities'
}

### Available Relationships
${ontology.relationships?.edges?.length || 0} relationships loaded
${
	ontology.relationships?.edges
		?.slice(0, 5)
		.map((e) => `- ${e.relation} → ${e.target_kind} (${e.target_id})`)
		.join('\n') || ''
}
${(ontology?.relationships?.edges?.length ?? 0) > 5 ? `... and ${(ontology?.relationships?.edges?.length ?? 0) - 5} more` : ''}

### Hints
- Use list_onto_* tools to see entities (tasks, goals, plans, documents, milestones, risks, requirements)
- Use get_entity_relationships for full graph
- Use get_onto_project_details for complete information`);

	return sections.join('\n\n');
}

function formatElementContext(
	ontology: OntologyContext,
	docStructureCache?: DocStructureCache
): string {
	const elementType = ontology.scope?.focus?.type ?? detectElementType(ontology);
	const elem = getScopedEntity(ontology, elementType);
	const parentProject = ontology.entities.project;
	const detailLines = buildEntityDetailLines(elementType, elem);
	const descriptionSnippet = truncateText(elem?.description ? String(elem.description) : '', 200);
	const propsKeys = elem?.props ? Object.keys(elem.props) : [];
	const propsLine =
		propsKeys.length > 0
			? `- Props: ${propsKeys.slice(0, 5).join(', ')}${propsKeys.length > 5 ? ' ...' : ''}`
			: '';
	const sections: string[] = [];

	sections.push(`### Element Information
- Type: ${elementType || 'element'}
- ID: ${elem?.id ?? 'unknown'}
- Name: ${getEntityName(elem)}
- Status: ${elem?.status || elem?.state_key || 'Unknown'}`);

	sections.push(
		`### Element Details
${detailLines.length > 0 ? detailLines.join('\n') : '- No additional details'}
- Description: ${descriptionSnippet || 'None'}
${propsLine}`.trim()
	);

	sections.push(`### Parent Project
${
	parentProject
		? `- ${parentProject.name} (${parentProject.id})
- Project State: ${parentProject.state_key}`
		: '- No parent project found (orphaned element)'
}`);

	sections.push(`### Relationships
${
	ontology.relationships?.edges
		?.map(
			(e) =>
				`- ${e.relation} ${e.relation.startsWith('inverse_') ? 'from' : 'to'} ${e.target_kind} (${e.target_id})`
		)
		.join('\n') || 'No relationships loaded'
}`);

	const focusDocDetails =
		elementType === 'document'
			? formatDocumentFocusDetailsFromStructure(
					docStructureCache,
					ontology.metadata?.doc_structure,
					elem?.id ?? null
				)
			: '';
	if (focusDocDetails) {
		sections.push(focusDocDetails);
	}

	const docStructureContext = buildDocStructureContext(ontology, docStructureCache);
	const docStructureSection = formatDocStructurePreview(docStructureContext);
	if (docStructureSection) {
		sections.push(docStructureSection);
	}

	sections.push(`### Hints
- Use the appropriate onto detail tool (e.g., get_onto_task_details) for complete information
- Use get_onto_project_details for full project context
- Use get_entity_relationships for connected items
- Use get_document_tree/get_document_path to navigate document hierarchy when relevant`);

	return sections.join('\n\n');
}

function formatGlobalContext(ontology: OntologyContext): string {
	const totalProjects =
		ontology.metadata?.total_projects ?? ontology.entities.projects?.length ?? 0;
	const availableTypes = ontology.metadata?.available_entity_types ?? [];
	const recentProjects = ontology.entities.projects ?? [];

	return `### Global Overview
- Total Projects: ${totalProjects}
- Available Entity Types: ${availableTypes.join(', ') || 'project'}

### Recent Projects
${
	recentProjects
		.slice(0, 5)
		.map((p: any) => {
			const description = truncateText(p.description, 150) || 'No description';
			const startAt = formatDateShort(p.start_at) || 'n/a';
			const endAt = formatDateShort(p.end_at) || 'n/a';
			const nextStep = p.next_step_short || 'None';
			const updatedAt = formatDateShort(p.updated_at) || 'n/a';
			return `- ${p.name} (${p.state_key || 'n/a'} · ${p.type_key || 'n/a'}) - ${description}\n  next: ${nextStep} | dates: ${startAt} → ${endAt} | updated: ${updatedAt}`;
		})
		.join('\n') || 'No recent projects'
}

### Entity Distribution
${
	Object.entries(ontology.metadata?.entity_count || {})
		.map(([type, count]) => `- Total ${type}s: ${count}`)
		.join('\n') || 'No entity counts available'
}

### Hints
- Use list_onto_projects to find specific projects
- Use create_onto_project to start new projects`;
}

function formatDocumentTreePreview(tree?: DocumentTreeContext): string {
	if (!tree) return '';

	const lines: string[] = [];
	lines.push('### Document Tree (Preview)');
	lines.push(`- Nodes in tree: ${tree.total_nodes}`);
	if (tree.unlinked_count && tree.unlinked_count > 0) {
		lines.push(`- Unlinked documents: ${tree.unlinked_count}`);
	}

	const renderNode = (node: DocumentTreeContext['root'][number], depth: number) => {
		const indent = '  '.repeat(depth);
		const description = node.description ? `: ${node.description}` : '';
		lines.push(`- ${indent}${node.title} [${node.id}]${description}`);
		if (node.children && node.children.length > 0) {
			node.children.forEach((child) => renderNode(child, depth + 1));
		}
	};

	if (tree.root.length > 0) {
		lines.push('');
		tree.root.forEach((node) => renderNode(node, 0));
	} else {
		lines.push('- (No documents in the tree yet)');
	}

	if (tree.unlinked && tree.unlinked.length > 0) {
		lines.push('');
		lines.push(
			`Unlinked preview: ${tree.unlinked.map((doc) => `${doc.title} [${doc.id}]`).join(', ')}`
		);
	}

	if (tree.truncated) {
		lines.push('');
		lines.push('Note: Tree preview truncated. Use get_document_tree for full structure.');
	}

	return lines.join('\n');
}

function buildDocStructureContext(
	ontology: OntologyContext,
	cache?: DocStructureCache
): DocStructureContext | null {
	const structure = cache?.structure ?? ontology.metadata?.doc_structure;
	if (!structure) return null;

	const documents =
		cache?.documents ??
		buildDocStructureDocumentMap(
			Array.isArray(ontology.entities.documents) ? ontology.entities.documents : undefined
		);

	return {
		structure,
		documents,
		unlinked: cache?.unlinked
	};
}

function buildDocStructureDocumentMap(
	documents: Array<Record<string, any>> | undefined
): DocStructureCache['documents'] {
	if (!documents || documents.length === 0) return {};

	const map: DocStructureCache['documents'] = {};
	for (const doc of documents) {
		if (!doc?.id) continue;
		const props = (doc.props as Record<string, unknown> | null) ?? null;
		const contentLength =
			typeof doc.content === 'string'
				? doc.content.length
				: typeof props?.content_length === 'number'
					? (props.content_length as number)
					: typeof (props as any)?.contentLength === 'number'
						? ((props as any).contentLength as number)
						: null;

		map[doc.id] = {
			id: doc.id,
			title: doc.title ?? 'Untitled',
			description: doc.description ?? null,
			type_key: doc.type_key ?? null,
			state_key: doc.state_key ?? null,
			updated_at: doc.updated_at ?? null,
			content_length: contentLength
		};
	}

	return map;
}

function formatDocStructurePreview(context?: DocStructureContext | null): string {
	if (!context) return '';
	const { structure, documents } = context;

	const totalNodes = countDocStructureNodes(structure.root ?? []);
	const preview = buildDocStructurePreview(structure, documents);

	const payload = {
		version: preview.version,
		total_nodes: totalNodes,
		truncated: preview.truncated || undefined,
		root: preview.root,
		unlinked:
			context.unlinked && context.unlinked.length > 0
				? context.unlinked
						.map((id) => ({
							id,
							title: documents[id]?.title ?? 'Untitled'
						}))
						.slice(0, 10)
				: undefined
	};

	const lines: string[] = [];
	lines.push('### Doc Structure (JSON)');
	lines.push('```json');
	lines.push(JSON.stringify(payload, null, 2));
	lines.push('```');
	lines.push('- Use doc_structure for hierarchy; load specific docs as needed.');
	return lines.join('\n');
}

function formatDocumentFocusDetailsFromStructure(
	cache: DocStructureCache | undefined,
	docStructure: DocStructure | undefined,
	documentId?: string | null
): string | null {
	if (!documentId) return null;
	const structure = cache?.structure ?? docStructure;
	if (!structure) return null;

	const documents = cache?.documents ?? {};
	const found = findDocNodeWithPath(structure.root ?? [], documentId);
	if (!found) {
		return `### Document Tree Focus
- Document not found in doc_structure.
- Use get_document_path or get_document_tree for the complete structure.`;
	}

	const pathTitles = found.path
		.map((node) => node.title ?? documents[node.id]?.title ?? 'Untitled')
		.concat(found.node.title ?? documents[found.node.id]?.title ?? 'Untitled');

	const lines: string[] = [];
	lines.push('### Document Tree Focus');
	lines.push(`- Path: ${pathTitles.join(' > ') || 'Unknown path'}`);
	lines.push(`- Document ID: ${found.node.id}`);

	const children = found.node.children ?? [];
	if (children.length > 0) {
		lines.push(`- Children (preview): ${Math.min(children.length, 6)}`);
		children.slice(0, 6).forEach((child) => {
			const title = child.title ?? documents[child.id]?.title ?? 'Untitled';
			lines.push(`- ${title} [${child.id}]`);
		});
		if (children.length > 6) {
			lines.push(`- ...and ${children.length - 6} more`);
		}
	} else {
		lines.push('- Children: none');
	}

	return lines.join('\n');
}

function buildDocStructurePreview(
	structure: DocStructure,
	documents: DocStructureCache['documents']
): { version: number; root: Array<Record<string, any>>; truncated: boolean } {
	const maxNodes = 80;
	const maxDepth = 4;
	let rendered = 0;
	let truncated = false;

	const walk = (nodes: DocTreeNode[], depth: number): Array<Record<string, any>> => {
		if (depth > maxDepth) {
			truncated = true;
			return [];
		}

		const sorted = [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		const results: Array<Record<string, any>> = [];

		for (const node of sorted) {
			if (rendered >= maxNodes) {
				truncated = true;
				break;
			}
			rendered += 1;

			const meta = documents[node.id];
			const entry: Record<string, any> = {
				id: node.id,
				order: node.order ?? 0,
				title: node.title ?? meta?.title ?? 'Untitled',
				description: node.description ?? meta?.description ?? null,
				content_length: meta?.content_length ?? null
			};

			if (node.children && node.children.length > 0) {
				const children = walk(node.children, depth + 1);
				if (children.length > 0) {
					entry.children = children;
				} else if (node.children.length > 0) {
					truncated = true;
				}
			}

			results.push(entry);
		}

		return results;
	};

	return {
		version: structure.version ?? 1,
		root: walk(structure.root ?? [], 0),
		truncated
	};
}

function countDocStructureNodes(nodes: DocTreeNode[]): number {
	let count = 0;
	const walk = (list: DocTreeNode[]) => {
		for (const node of list) {
			count += 1;
			if (node.children && node.children.length > 0) {
				walk(node.children);
			}
		}
	};
	walk(nodes);
	return count;
}

function findDocNodeWithPath(
	nodes: DocTreeNode[],
	targetId: string,
	path: DocTreeNode[] = []
): { node: DocTreeNode; path: DocTreeNode[] } | null {
	for (const node of nodes) {
		if (node.id === targetId) {
			return { node, path };
		}
		if (node.children && node.children.length > 0) {
			const found = findDocNodeWithPath(node.children, targetId, [...path, node]);
			if (found) return found;
		}
	}
	return null;
}

function formatProjectHighlights(highlights?: ProjectHighlights): string {
	if (!highlights) return '';

	const sections: string[] = [];

	const formatDate = (value?: string | null): string | null => {
		if (!value) return null;
		return value.split('T')[0] || value;
	};

	const formatCreatedUpdated = (created?: string | null, updated?: string | null): string[] => {
		const parts: string[] = [];
		const createdShort = formatDate(created);
		const updatedShort = formatDate(updated);
		if (createdShort) parts.push(`created: ${createdShort}`);
		if (updatedShort && updatedShort !== createdShort) {
			parts.push(`updated: ${updatedShort}`);
		}
		return parts;
	};

	const formatParts = (parts: Array<string | null | undefined>): string => {
		const filtered = parts.filter(Boolean) as string[];
		return filtered.length ? ` (${filtered.join(', ')})` : '';
	};

	const formatEdge = (direct?: boolean): string | null => {
		if (direct === undefined || direct === null) return null;
		return `edge: ${direct ? 'direct' : 'project_id'}`;
	};

	const formatListCount = (label: string, list?: string[] | null): string | null => {
		if (!list || list.length === 0) return null;
		return `${label}: ${list.length}`;
	};

	const addSection = (title: string, lines: string[], more?: number): void => {
		if (lines.length === 0) return;
		if (more && more > 0) {
			lines.push(`- ... and ${more} more`);
		}
		sections.push(`#### ${title}\n${lines.join('\n')}`);
	};

	addSection(
		'Goals',
		highlights.goals.items.map((goal) => {
			const parts = formatCreatedUpdated(goal.created_at, goal.updated_at);
			if (goal.state_key) parts.unshift(`state: ${goal.state_key}`);
			if (goal.type_key) parts.unshift(`type: ${goal.type_key}`);
			const targetDate = formatDate(goal.target_date);
			if (targetDate) parts.push(`target: ${targetDate}`);
			const completedDate = formatDate(goal.completed_at);
			if (completedDate) parts.push(`completed: ${completedDate}`);
			if (typeof goal.progress_percent === 'number') {
				parts.push(`progress: ${goal.progress_percent}%`);
			}
			if (typeof goal.completed_tasks === 'number' && typeof goal.total_tasks === 'number') {
				parts.push(`tasks: ${goal.completed_tasks}/${goal.total_tasks}`);
			}
			const edge = formatEdge(goal.direct_edge);
			if (edge) parts.push(edge);
			const description = goal.description ? ` — ${goal.description}` : '';
			return `- ${goal.name || 'Untitled goal'} [${goal.id}]${formatParts(parts)}${description}`;
		}),
		highlights.goals.more
	);

	addSection(
		'Risks',
		highlights.risks.items.map((risk) => {
			const parts = formatCreatedUpdated(risk.created_at, risk.updated_at);
			if (risk.state_key) parts.unshift(`state: ${risk.state_key}`);
			if (risk.type_key) parts.unshift(`type: ${risk.type_key}`);
			if (risk.impact) parts.push(`impact: ${risk.impact}`);
			if (risk.probability !== null && risk.probability !== undefined) {
				parts.push(`probability: ${risk.probability}`);
			}
			const mitigated = formatDate(risk.mitigated_at);
			if (mitigated) parts.push(`mitigated: ${mitigated}`);
			const content = risk.content ? ` — ${risk.content}` : '';
			return `- ${risk.title} [${risk.id}]${formatParts(parts)}${content}`;
		}),
		highlights.risks.more
	);

	addSection(
		'Requirements',
		highlights.requirements.items.map((requirement) => {
			const parts = formatCreatedUpdated(requirement.created_at, requirement.updated_at);
			if (requirement.type_key) parts.unshift(`type: ${requirement.type_key}`);
			if (requirement.priority !== null && requirement.priority !== undefined) {
				parts.unshift(`priority: ${requirement.priority}`);
			}
			return `- ${requirement.text} [${requirement.id}]${formatParts(parts)}`;
		}),
		highlights.requirements.more
	);

	addSection(
		'Documents',
		highlights.documents.items.map((doc) => {
			const parts = formatCreatedUpdated(doc.created_at, doc.updated_at);
			if (doc.state_key) parts.unshift(`state: ${doc.state_key}`);
			if (doc.type_key) parts.unshift(`type: ${doc.type_key}`);
			const edge = formatEdge(doc.direct_edge);
			if (edge) parts.push(edge);
			const description = doc.description ? ` — ${doc.description}` : '';
			return `- ${doc.title} [${doc.id}]${formatParts(parts)}${description}`;
		}),
		highlights.documents.more
	);

	addSection(
		'Milestones',
		highlights.milestones.items.map((milestone) => {
			const parts = formatCreatedUpdated(milestone.created_at, milestone.updated_at);
			if (milestone.state_key) parts.unshift(`state: ${milestone.state_key}`);
			if (milestone.type_key) parts.unshift(`type: ${milestone.type_key}`);
			const dueDate = formatDate(milestone.due_at);
			if (dueDate) parts.unshift(`due: ${dueDate}`);
			const completedDate = formatDate(milestone.completed_at);
			if (completedDate) parts.push(`completed: ${completedDate}`);
			const description = milestone.description ? ` — ${milestone.description}` : '';
			return `- ${milestone.title} [${milestone.id}]${formatParts(parts)}${description}`;
		}),
		highlights.milestones.more
	);

	addSection(
		'Plans',
		highlights.plans.items.map((plan) => {
			const parts = formatCreatedUpdated(plan.created_at, plan.updated_at);
			if (plan.state_key) parts.unshift(`state: ${plan.state_key}`);
			if (plan.type_key) parts.unshift(`type: ${plan.type_key}`);
			if (typeof plan.task_count === 'number') {
				const completed =
					typeof plan.completed_task_count === 'number'
						? plan.completed_task_count
						: null;
				parts.push(
					`tasks: ${completed !== null ? `${completed}/${plan.task_count}` : plan.task_count}`
				);
			}
			const description = plan.description ? ` — ${plan.description}` : '';
			return `- ${plan.name} [${plan.id}]${formatParts(parts)}${description}`;
		}),
		highlights.plans.more
	);

	addSection(
		'Signals',
		highlights.signals.items.map((signal) => {
			const tsDate = formatDate(signal.ts);
			const createdDate = formatDate(signal.created_at);
			const parts: string[] = [];
			if (tsDate) parts.push(`ts: ${tsDate}`);
			if (createdDate && createdDate !== tsDate) {
				parts.push(`created: ${createdDate}`);
			}
			const payload = signal.payload_summary ? ` — Payload: ${signal.payload_summary}` : '';
			return `- ${signal.channel} [${signal.id}]${formatParts(parts)}${payload}`;
		}),
		highlights.signals.more
	);

	addSection(
		'Insights',
		highlights.insights.items.map((insight) => {
			const parts = formatCreatedUpdated(insight.created_at, null);
			if (insight.derived_from_signal_id) {
				parts.push(`signal: ${insight.derived_from_signal_id}`);
			}
			const summary = insight.summary ? ` — Summary: ${insight.summary}` : '';
			return `- ${insight.title} [${insight.id}]${formatParts(parts)}${summary}`;
		}),
		highlights.insights.more
	);

	addSection(
		'Tasks (Recent Updates)',
		highlights.tasks.recent.items.map((task) => {
			const parts: string[] = [];
			if (task.state_key) parts.push(`state: ${task.state_key}`);
			if (task.type_key) parts.push(`type: ${task.type_key}`);
			if (task.priority !== null && task.priority !== undefined) {
				parts.push(`priority: ${task.priority}`);
			}
			const updated = formatDate(task.updated_at);
			const created = formatDate(task.created_at);
			if (updated) {
				parts.push(`updated: ${updated}`);
			} else if (created) {
				parts.push(`created: ${created}`);
			}
			const start = formatDate(task.start_at);
			const due = formatDate(task.due_at);
			const completed = formatDate(task.completed_at);
			if (start) parts.push(`start: ${start}`);
			if (due) parts.push(`due: ${due}`);
			if (completed) parts.push(`completed: ${completed}`);
			const planCount = task.plan_ids?.length ?? 0;
			const goalCount = task.goal_ids?.length ?? 0;
			if (planCount > 0) parts.push(`plans: ${planCount}`);
			if (goalCount > 0) parts.push(`goals: ${goalCount}`);
			if (typeof task.dependency_count === 'number') {
				parts.push(`dependencies: ${task.dependency_count}`);
			}
			if (typeof task.dependent_count === 'number') {
				parts.push(`dependents: ${task.dependent_count}`);
			}
			const description = task.description ? ` — ${task.description}` : '';
			return `- ${task.title} [${task.id}]${formatParts(parts)}${description}`;
		}),
		highlights.tasks.recent.more
	);

	addSection(
		'Tasks (Upcoming)',
		highlights.tasks.upcoming.items.map((task) => {
			const parts: string[] = [];
			if (task.state_key) parts.push(`state: ${task.state_key}`);
			if (task.type_key) parts.push(`type: ${task.type_key}`);
			if (task.priority !== null && task.priority !== undefined) {
				parts.push(`priority: ${task.priority}`);
			}
			const start = formatDate(task.start_at);
			const due = formatDate(task.due_at);
			const updated = formatDate(task.updated_at);
			if (start) parts.push(`start: ${start}`);
			if (due) parts.push(`due: ${due}`);
			if (updated) parts.push(`updated: ${updated}`);
			const planCount = task.plan_ids?.length ?? 0;
			const goalCount = task.goal_ids?.length ?? 0;
			if (planCount > 0) parts.push(`plans: ${planCount}`);
			if (goalCount > 0) parts.push(`goals: ${goalCount}`);
			if (typeof task.dependency_count === 'number') {
				parts.push(`dependencies: ${task.dependency_count}`);
			}
			if (typeof task.dependent_count === 'number') {
				parts.push(`dependents: ${task.dependent_count}`);
			}
			const description = task.description ? ` — ${task.description}` : '';
			return `- ${task.title} [${task.id}]${formatParts(parts)}${description}`;
		}),
		highlights.tasks.upcoming.more
	);

	if (sections.length === 0) return '';

	return `### Project Context Highlights\n${sections.join('\n\n')}`;
}
