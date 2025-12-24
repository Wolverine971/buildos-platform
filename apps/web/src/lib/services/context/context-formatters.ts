// apps/web/src/lib/services/context/context-formatters.ts
/**
 * Context Formatters
 *
 * Utilities for formatting ontology context into LLM-friendly strings.
 */

import type {
	OntologyContext,
	ProjectFocus,
	OntologyEntityType
} from '$lib/types/agent-chat-enhancement';
import type { FormattedContextResult } from './types';

/**
 * Format ontology context for inclusion in prompt
 */
export function formatOntologyContext(ontology: OntologyContext): FormattedContextResult {
	let content = `## Context Overview (Internal Reference - ${ontology.type})\n\n`;

	if (ontology.type === 'project') {
		content += formatProjectContext(ontology);
	} else if (ontology.type === 'element') {
		content += formatElementContext(ontology);
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
	focus: ProjectFocus
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
	const elementDue =
		(element as Record<string, any> | undefined)?.due_at ??
		(element as Record<string, any> | undefined)?.target_date ??
		null;
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
	sections.push(`## Project Workspace: ${projectName}
- ID: ${project?.id ?? focus.projectId}
- State: ${projectState}
- Type: ${projectType}`);

	let focusSection = `## Current Focus (${focus.focusType})
- Name: ${elementName}
- ID: ${focus.focusEntityId ?? 'n/a'}
- State: ${elementState}`;
	if (elementDue) {
		focusSection += `\n- Due: ${elementDue}`;
	}
	if (element && element.description) {
		focusSection += `\n\n${String(element.description).slice(0, 400)}`;
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
		'output',
		'milestone',
		'risk',
		'decision',
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
		entity.id ||
		'Unnamed'
	);
}

// ============================================
// PRIVATE FORMATTERS
// ============================================

function formatProjectContext(ontology: OntologyContext): string {
	const project = ontology.entities.project;
	return `### Project Information
- ID: ${project?.id ?? 'unknown'}
- Name: ${project?.name ?? 'No name'}
- Description: ${project?.description || 'No description'}
- State: ${project?.state_key ?? 'n/a'}
- Type: ${project?.type_key ?? 'n/a'}
- Created: ${project?.created_at || 'Unknown'}

### Entity Summary
${
	Object.entries(ontology.metadata?.entity_count || {})
		.map(([type, count]) => `- ${type}s: ${count}`)
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
- Use list_onto_* tools to see entities (tasks, goals, plans, documents, outputs, milestones, risks, decisions, requirements)
- Use get_entity_relationships for full graph
- Use get_onto_project_details for complete information`;
}

function formatElementContext(ontology: OntologyContext): string {
	const elementType = ontology.scope?.focus?.type ?? detectElementType(ontology);
	const elem = getScopedEntity(ontology, elementType);
	const parentProject = ontology.entities.project;

	return `### Element Information
- Type: ${elementType || 'element'}
- ID: ${elem?.id ?? 'unknown'}
- Name: ${getEntityName(elem)}
- Status: ${elem?.status || elem?.state_key || 'Unknown'}

### Element Details
${elem?.description ? `Description: ${(elem.description as string).substring(0, 200)}...` : 'No description'}
${elem?.props ? `Properties: ${Object.keys(elem.props).join(', ')}` : ''}

### Parent Project
${
	parentProject
		? `- ${parentProject.name} (${parentProject.id})
- Project State: ${parentProject.state_key}`
		: '- No parent project found (orphaned element)'
}

### Relationships
${
	ontology.relationships?.edges
		?.map(
			(e) =>
				`- ${e.relation} ${e.relation.startsWith('inverse_') ? 'from' : 'to'} ${e.target_kind} (${e.target_id})`
		)
		.join('\n') || 'No relationships loaded'
}

### Hints
- Use the appropriate onto detail tool (e.g., get_onto_task_details) for complete information
- Use get_onto_project_details for full project context
- Use get_entity_relationships for connected items`;
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
		.map((p: any) => `- ${p.name} (${p.state_key}) - ${p.type_key}`)
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
