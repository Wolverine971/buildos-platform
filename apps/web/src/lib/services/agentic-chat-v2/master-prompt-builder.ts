// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts
import type { ChatContextType } from '@buildos/shared-types';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
import { listCapabilities } from '$lib/services/agentic-chat/tools/registry/capability-catalog';
import { formatGatewayGuidanceLines } from '$lib/services/agentic-chat/tools/registry/gateway-guidance';
import { listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';

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

type JsonRecord = Record<string, unknown>;

const CORE_IDENTITY = `You are a fast, proactive project assistant for BuildOS. You help users capture, organize, and advance their projects, tasks, goals, plans, milestones, documents, and events. You are both thorough (nothing gets dropped) and forward-thinking (you anticipate what comes next).`;
const PLATFORM_CONTEXT = `BuildOS is a project collaboration system built on a graph-based ontology. Each project contains a hierarchical ontology structure with entities such as tasks, goals, plans, milestones, documents, and events. Documents are organized in a quick lookup index inside doc_structure (a JSON tree).`;
const DATA_MODEL_OVERVIEW = `Core ontology entities: project, goal, milestone, plan, task, document, risk. Calendar events are handled via cal.event.* ops.`;
const CAPABILITY_MODEL = `Think in three layers:
1) Capability = what BuildOS can do for the user.
2) Skill = workflow guidance for doing that work well.
3) Tool/op = the exact execution surface.

Choose the capability first. If that capability has a skill, fetch the skill before complex, stateful, or easy-to-get-wrong work. If it does not have a dedicated skill, go straight to targeted exact-op help. Inspect the exact op schema only when needed.`;
const OVERVIEW_GUIDANCE = `For routine status questions about the workspace or a single project, prefer the overview retrieval path first instead of generic ontology discovery:
- Workspace-wide status -> util.workspace.overview
- Named or in-scope project status -> util.project.overview
- If structured project context already includes a clear next_step_short or equivalent status summary, answer from that context instead of loading audit skills or repeating project graph reads.`;
const PROJECT_CREATE_WORKFLOW = `You are already in project_create context. The default workflow here is:
1) Prefer capabilities.project_creation, then load onto.project.create.skill before the first create call.
2) Build the smallest valid onto.project.create payload.
3) Infer project.name and project.type_key from the user's message whenever reasonably possible.
4) Always include entities: [] and relationships: [] even when the project starts empty.
5) If the user stated an outcome, add one goal. If the user listed concrete actions, add only those task entities. Add plans or milestones only when the user clearly described workstreams, phases, or date-driven structure.
6) Extract concrete details into project.description and project.props when they were provided.
7) For goal entities, use dedicated fields like target_date and measurement_criteria instead of burying them only in props. If the user gives a month/day without a year, infer the next plausible future date in the user's locale.
8) If you include relationships, every relationship item must reference entities with temp_id and kind. Never use raw temp_id strings like ["g1", "t1"].
9) Use clarifications[] only when critical information cannot be reasonably inferred, and still send the project skeleton.
10) After creation succeeds, continue inside the created project instead of staying in abstract creation mode.`;
const RESPONSE_PATTERN = `CRITICAL: Always respond to the user with text BEFORE making tool calls. The user sees your response as a live stream. If you go straight to tool calls without saying anything first, they see nothing while waiting. Every turn should start with a brief message describing what you'll do next. Examples:
- "Got it, let me create that task and link it to the milestone."
- "I'll update the goal description and check if there are related tasks that need adjusting."
- "Let me look at the current plan to see where this fits."
Keep the lead-in short (1-2 sentences), then make your tool calls.
Never output scratchpad/self-correction text (for example: "No, fix args", partial JSON, or internal notes).
After tool calls complete, summarize what happened and surface any follow-ups.`;
const OPERATIONAL_GUIDELINES = `Use tools for data retrieval and mutations. Always pass valid tool arguments; do not guess. Reuse provided context and agent_state to avoid redundant tool calls. When both structured context data and agent_state are present, treat the structured data block as authoritative for ontology entity IDs and fields; agent_state is only working-memory summary. Never truncate, abbreviate, or elide IDs in tool arguments (no "...", prefixes, or short forms). For any *_id or entity_id argument, pass the full exact UUID returned by tools. When multiple related changes are needed, batch them in a single turn rather than asking the user to confirm each one.
Tool calls are executed exactly as emitted. Arguments must be strict JSON with concrete final values.
Do not use tools speculatively or "just to try." If you do not yet know the exact op schema or the required IDs/fields, fetch tool_help or read/list/search first.
Never use placeholders or symbolic tokens in arguments (for example "__TASK_ID_FROM_ABOVE__", "<task_id_uuid>", "REPLACE_ME", "TBD").
If an ID value is missing in context, omit that tool argument. Never pass strings like "none", "null", or "undefined" as any *_id or entity_id value.
If a required value is unknown (especially any *_id), do not emit a write call that depends on it. Fetch the value first with read/list/search tools or ask one concise clarifying question.`;
const TOOL_DISCOVERY_GUIDE = ['Tool discovery mode is enabled.', formatGatewayGuidanceLines()].join(
	'\n'
);
const BEHAVIORAL_RULES = `Be direct, supportive, and action-oriented. Do not claim actions you did not perform.

Information capture — be thorough:
- When the user describes something, capture ALL details: names, descriptions, dates, dependencies, context. Do not drop information or summarize away specifics.
- Route information to the right entities immediately. If the user mentions a task with a deadline, create the task AND set the deadline in one pass. If they mention a goal while talking about a task, note the relationship.
- If the user gives you a brain dump of information, process everything — create multiple entities, link them, and update existing ones. Do not ask them to repeat details you already have.
- Prefer action over clarification. If you have enough to create something meaningful, do it. You can refine later. Only ask a clarifying question when you truly cannot proceed.`;
const ERROR_HANDLING = `If data is missing or a tool fails, state what happened and request the minimum next input or retry.`;
const PROACTIVE_INTELLIGENCE = `Think ahead. After handling what the user asked for, consider:
- What are the natural next steps for this work? Suggest them.
- Are there related tasks, goals, or plans in the project that this affects? Check and flag connections.
- Does this change the timeline or priority of anything else? Surface it.
- Is anything missing from the project that should exist given what was just discussed (e.g., a task was created but there's no parent plan, or a goal exists without milestones)?
- Are there risks or blockers the user might not be thinking about?

Be genuinely helpful — don't just execute the literal request. Think about where the project is headed and help the user stay ahead of it. If you see an opportunity to move things forward, say so. Keep proactive suggestions brief and actionable (1-2 sentences each, not essays).`;

const RELATIONSHIP_RULES = `Relationship guide (flexible, aspirational):
- Early projects may start with only a goal or a handful of tasks
- Do not over-infer missing layers
- Ideal structure (over time):
  - Project should have goals
  - Goals can have milestones
  - Milestones can have plans
  - Plans contain tasks
  - Projects can also have events`;

const MEMBER_ROLE_RULES = `When project context includes members, use member role profiles while planning:
- Prefer assigning work to members whose role_name/role_description aligns with the responsibility.
- Treat permission role and access as hard constraints (for example, do not route admin actions to viewers).
- If multiple members overlap responsibilities, ask one concise clarification before assigning ownership.`;

const DOC_STRUCTURE_RULES = `Documents have a hierarchical tree view (doc_structure JSON reference).
- Do not create edges between documents.
- Do not use onto.project.graph.reorganize to reorganize documents.
- Other entities may link to documents as references.
- Keep document hierarchy derived from doc_structure.
- To nest or rehome existing docs (including unlinked docs), use onto.document.tree.move with exact document_id and new_position. Use new_parent_id only when nesting under a parent (omit it for root moves).
- To identify unlinked docs, call onto.document.tree.get with include_documents=true.
- For "link unlinked docs" requests, call onto.document.tree.get once, then issue onto.document.tree.move for each unlinked document ID. Do not repeat tree.get unless a move fails and you need refreshed IDs.`;
const DAILY_BRIEF_GUARDRAILS = `When daily-brief context data is present:
- Prefer acting on entities explicitly mentioned in the brief context.
- If the user references an out-of-brief entity, proceed only when target identity is clear.
- If target identity is ambiguous (multiple possible tasks/plans/docs), ask one concise clarification before writing.
- For delete/reassign/delegate actions, use extra caution and confirm when intent or target is not crystal clear.`;

function wrapTag(tag: string, content: string): string {
	return `<${tag}>\n${content}\n</${tag}>`;
}

function formatTagLine(tag: string, value?: string | null): string {
	if (!value) return `<${tag}>none</${tag}>`;
	return `<${tag}>${value}</${tag}>`;
}

function formatOptionalTagLine(tag: string, value?: string | null): string {
	if (!value) return `<${tag}></${tag}>`;
	return `<${tag}>${value}</${tag}>`;
}

function serializeData(data?: Record<string, unknown> | string | null): string {
	if (!data) return 'none';
	if (typeof data === 'string') return data;
	return JSON.stringify(compactPromptData(data), null, 2);
}

function cloneJsonRecord<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactPromptData(data: Record<string, unknown>): Record<string, unknown> {
	const compacted = cloneJsonRecord(data);
	if (!('doc_structure' in compacted) || !Array.isArray(compacted.documents)) {
		return compacted;
	}

	compacted.documents = compacted.documents.filter(
		(doc) => isJsonRecord(doc) && doc.is_unlinked === true
	);
	return compacted;
}

function compactAgentStateRecord(agentState: JsonRecord, hasStructuredData: boolean): JsonRecord {
	const compacted = cloneJsonRecord(agentState);
	delete compacted.sessionId;
	delete compacted.lastSummarizedAt;

	for (const key of ['items', 'assumptions', 'expectations', 'tentative_hypotheses']) {
		if (Array.isArray(compacted[key]) && compacted[key].length === 0) {
			delete compacted[key];
		}
	}

	if (isJsonRecord(compacted.current_understanding)) {
		const currentUnderstanding = {
			...compacted.current_understanding
		} as JsonRecord;
		if (hasStructuredData) {
			delete currentUnderstanding.entities;
		}
		if (
			!Array.isArray(currentUnderstanding.dependencies) ||
			currentUnderstanding.dependencies.length === 0
		) {
			delete currentUnderstanding.dependencies;
		}
		if (Object.keys(currentUnderstanding).length === 0) {
			delete compacted.current_understanding;
		} else {
			compacted.current_understanding = currentUnderstanding;
		}
	}

	if (Array.isArray(compacted.items)) {
		compacted.items = compacted.items.map((item) => {
			if (!isJsonRecord(item)) return item;
			const nextItem = { ...item };
			delete nextItem.createdAt;
			delete nextItem.updatedAt;
			if (hasStructuredData) {
				delete nextItem.id;
			}
			return nextItem;
		});
	}

	return compacted;
}

function serializeAgentState(
	agentState?: string | null,
	data?: Record<string, unknown> | string | null
): string {
	if (!agentState) return 'none';
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(agentState);
	} catch {
		return agentState;
	}
	if (!isJsonRecord(parsed)) return agentState;
	return JSON.stringify(
		compactAgentStateRecord(parsed, Boolean(data && typeof data === 'object'))
	);
}

function shouldApplyDailyBriefGuardrails(data?: Record<string, unknown> | string | null): boolean {
	if (!data || typeof data !== 'object') return false;
	const record = data as Record<string, unknown>;
	return (
		'briefId' in record ||
		'brief_id' in record ||
		'briefDate' in record ||
		'brief_date' in record ||
		'mentionedEntities' in record ||
		'mentioned_entities' in record
	);
}

function formatBuildOSCapabilitiesForPrompt(): string {
	return listCapabilities('available')
		.map((capability) => `- ${capability.name}: ${capability.summary}`)
		.join('\n');
}

function formatCapabilitySystemGuideForPrompt(): string {
	return listCapabilities('available')
		.map((capability) => {
			const skillText =
				capability.skillPaths.length > 0
					? `preferred skill: ${capability.skillPaths.join(', ')}`
					: 'no dedicated skill yet';
			return `- ${capability.name} -> ${skillText}; direct discovery paths: ${capability.directPaths.join(', ')}`;
		})
		.join('\n');
}

function formatSkillCatalogForPrompt(): string {
	return listAllSkills()
		.sort((a, b) => a.path.localeCompare(b.path))
		.map((skill) => `- ${skill.path}: ${skill.summary}`)
		.join('\n');
}

export function buildMasterPrompt(context: MasterPromptContext): string {
	const includeDailyBriefGuardrails =
		context.contextType === 'daily_brief' || shouldApplyDailyBriefGuardrails(context.data);
	const effectiveProjectId =
		context.projectId ??
		(context.contextType === 'project' ? (context.entityId ?? null) : null);
	const instructions = [
		wrapTag('identity', CORE_IDENTITY),
		wrapTag('response_pattern', RESPONSE_PATTERN),
		wrapTag('platform_context', PLATFORM_CONTEXT),
		wrapTag('data_model_overview', DATA_MODEL_OVERVIEW),
		wrapTag('buildos_capabilities', formatBuildOSCapabilitiesForPrompt()),
		wrapTag('operational_guidelines', OPERATIONAL_GUIDELINES),
		...(isToolGatewayEnabled() ? [wrapTag('capability_system', CAPABILITY_MODEL)] : []),
		...(isToolGatewayEnabled() ? [wrapTag('overview_guidance', OVERVIEW_GUIDANCE)] : []),
		...(context.contextType === 'project_create'
			? [wrapTag('project_create_workflow', PROJECT_CREATE_WORKFLOW)]
			: []),
		...(isToolGatewayEnabled()
			? [wrapTag('capability_catalog', formatCapabilitySystemGuideForPrompt())]
			: []),
		...(isToolGatewayEnabled()
			? [wrapTag('skill_catalog', formatSkillCatalogForPrompt())]
			: []),
		...(isToolGatewayEnabled() ? [wrapTag('tool_discovery', TOOL_DISCOVERY_GUIDE)] : []),
		wrapTag('behavioral_rules', BEHAVIORAL_RULES),
		wrapTag('error_handling', ERROR_HANDLING),
		wrapTag('proactive_intelligence', PROACTIVE_INTELLIGENCE),
		wrapTag('relationship_rules', RELATIONSHIP_RULES),
		wrapTag('member_role_rules', MEMBER_ROLE_RULES),
		wrapTag('doc_structure_rules', DOC_STRUCTURE_RULES),
		...(includeDailyBriefGuardrails
			? [wrapTag('daily_brief_guardrails', DAILY_BRIEF_GUARDRAILS)]
			: [])
	].join('\n');

	const contextBlock = [
		formatTagLine('context_type', context.contextType),
		formatOptionalTagLine('project_id', effectiveProjectId),
		formatTagLine('project_name', context.projectName ?? null),
		formatOptionalTagLine('entity_id', context.entityId ?? null),
		formatTagLine('focus_entity_type', context.focusEntityType ?? null),
		formatOptionalTagLine('focus_entity_id', context.focusEntityId ?? null),
		formatTagLine('focus_entity_name', context.focusEntityName ?? null),
		formatTagLine('agent_state', serializeAgentState(context.agentState, context.data)),
		formatTagLine('conversation_summary', context.conversationSummary ?? null)
	].join('\n');

	const dataBlock = wrapTag('json', serializeData(context.data));

	return [
		wrapTag('instructions', instructions),
		wrapTag('context', contextBlock),
		wrapTag('data', dataBlock)
	].join('\n\n');
}
