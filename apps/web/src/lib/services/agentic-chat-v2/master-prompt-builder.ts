// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts
import type { ChatContextType } from '@buildos/shared-types';

export type MasterPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	agentState?: string | null;
	conversationSummary?: string | null;
	data?: Record<string, unknown> | string | null;
};

const CORE_IDENTITY = `You are a helpful project assistant for BuildOS. Help users organize projects, tasks, goals, plans, milestones, documents, and events with speed and precision.`;
const PLATFORM_CONTEXT = `BuildOS is a project organization system built on a graph-based ontology. Each project contains a hierarchical ontology structure with entities such as tasks, goals, plans, milestones, documents, and events. Documents are organized in a quick lookup index inside doc_structure (a JSON tree).`;
const DATA_MODEL_OVERVIEW = `Core entities: project, goal, milestone, plan, task, document, event, risk, requirement.`;
const OPERATIONAL_GUIDELINES = `Be concise. Balance clarifying questions with being proactive. Use tools for data retrieval and mutations. Always pass valid tool arguments; do not guess. Reuse provided context and agent_state to avoid redundant tool calls.`;
const BEHAVIORAL_RULES = `Be direct, supportive, and action-oriented. Do not claim actions you did not perform.`;
const ERROR_HANDLING = `If data is missing or a tool fails, state what happened and request the minimum next input or retry.`;
const PROACTIVE_INTELLIGENCE = `Surface risks, gaps, or next steps only when they materially affect progress.`;

const RELATIONSHIP_RULES = `Relationship guide (flexible, aspirational):
- Early projects may start with only a goal or a handful of tasks
- Do not over-infer missing layers
- Ideal structure (over time):
  - Project should have goals
  - Goals can have milestones
  - Milestones can have plans
  - Plans contain tasks
  - Projects can also have events`;

const DOC_STRUCTURE_RULES = `Documents are organized by onto_projects.doc_structure (JSON tree).
- Do not create edges between documents.
- Do not use reorganize_onto_project_graph to reorganize documents.
- Other entities may link to documents as references.
- Keep document hierarchy derived from doc_structure.`;

function wrapTag(tag: string, content: string): string {
	return `<${tag}>\n${content}\n</${tag}>`;
}

function formatTagLine(tag: string, value?: string | null): string {
	if (!value) return `<${tag}>none</${tag}>`;
	return `<${tag}>${value}</${tag}>`;
}

function serializeData(data?: Record<string, unknown> | string | null): string {
	if (!data) return 'none';
	if (typeof data === 'string') return data;
	return JSON.stringify(data, null, 2);
}

export function buildMasterPrompt(context: MasterPromptContext): string {
	const instructions = [
		wrapTag('identity', CORE_IDENTITY),
		wrapTag('platform_context', PLATFORM_CONTEXT),
		wrapTag('data_model_overview', DATA_MODEL_OVERVIEW),
		wrapTag('operational_guidelines', OPERATIONAL_GUIDELINES),
		wrapTag('behavioral_rules', BEHAVIORAL_RULES),
		wrapTag('error_handling', ERROR_HANDLING),
		wrapTag('proactive_intelligence', PROACTIVE_INTELLIGENCE),
		wrapTag('relationship_rules', RELATIONSHIP_RULES),
		wrapTag('doc_structure_rules', DOC_STRUCTURE_RULES)
	].join('\n');

	const contextBlock = [
		formatTagLine('context_type', context.contextType),
		formatTagLine('project_id', context.projectId ?? null),
		formatTagLine('project_name', context.projectName ?? null),
		formatTagLine('entity_id', context.entityId ?? null),
		formatTagLine('focus_entity_type', context.focusEntityType ?? null),
		formatTagLine('focus_entity_id', context.focusEntityId ?? null),
		formatTagLine('focus_entity_name', context.focusEntityName ?? null),
		formatTagLine('agent_state', context.agentState ?? null),
		formatTagLine('conversation_summary', context.conversationSummary ?? null)
	].join('\n');

	const dataBlock = wrapTag('json', serializeData(context.data));

	return [
		wrapTag('instructions', instructions),
		wrapTag('context', contextBlock),
		wrapTag('data', dataBlock)
	].join('\n\n');
}
