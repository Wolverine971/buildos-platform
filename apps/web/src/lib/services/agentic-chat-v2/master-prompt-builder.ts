// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts
import type { ChatContextType } from '@buildos/shared-types';
import { listCapabilities } from '$lib/services/agentic-chat/tools/registry/capability-catalog';
import { listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	buildProjectIntelligencePromptSections,
	extractProjectIntelligence,
	serializeLoadedContext
} from '$lib/services/agentic-chat-lite/prompt/build-lite-prompt';

export type MasterPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	conversationSummary?: string | null;
	entityResolutionHint?: string | null;
	data?: Record<string, unknown> | string | null;
};

type JsonRecord = Record<string, unknown>;

const OVERVIEW_GUIDANCE = `For routine status questions about the workspace or a single project, prefer the overview retrieval path first instead of generic ontology discovery:
	- In gateway mode, overview retrieval is available as direct tools, not through a generic executor.
	- Workspace-wide status -> get_workspace_overview({})
	- Named or in-scope project status -> get_project_overview({ project_id: "<uuid>" }) when the project_id is known, otherwise get_project_overview({ query: "<project name>" })
	- If structured project context already includes a clear next_step_short or equivalent status summary, answer from that context instead of loading audit skills or repeating project graph reads.`;
const PROJECT_ANALYSIS_SKILL_GUIDANCE = `You are in project context. Audit and forecast are project skills, not separate context types:
1) For project audits, health reviews, stress tests, blockers, stale work, missing structure, or gap analysis, load skill_load({ skill: "project_audit" }) before the analysis if the answer is multi-step or evidence-heavy.
2) For project forecasts, schedule risk, likely outcomes, slippage, scenarios, or "are we on track" questions, load skill_load({ skill: "project_forecast" }) before the analysis if the answer depends on assumptions or multiple project signals.
3) Keep context_type as project for these workflows. Use the current project_id and project-focused direct tools; do not invent project_audit or project_forecast sessions.`;
const PROJECT_CREATE_WORKFLOW = `You are already in project_create context. The default workflow here is:
1) Prefer the project creation capability, then load skill_load({ skill: "project_creation" }) before the first create call.
2) Build the smallest valid onto.project.create payload.
3) Infer project.name and project.type_key from the user's message whenever reasonably possible. project.type_key must start with "project.", for example project.creative.novel.
4) Always include entities: [] and relationships: [] even when the project starts empty.
5) If the user stated an outcome, add one goal. If the user listed concrete actions, add only those task entities. Add plans or milestones only when the user clearly described workstreams, phases, or date-driven structure.
6) Extract concrete details into project.description and project.props when they were provided.
7) Entity required labels by kind: goal/plan/metric use name; task/milestone/document/risk use title; requirement uses text; source uses uri. Milestones also require due_at.
8) For goal entities, use dedicated fields like target_date and measurement_criteria instead of burying them only in props. If the user gives a month/day without a year, infer the next plausible future date in the user's locale.
9) If you include relationships, every relationship item must reference entities with temp_id and kind. Never use raw temp_id strings like ["g1", "t1"].
10) Use clarifications[] only when critical information cannot be reasonably inferred, and still send the project skeleton.
11) After creation succeeds, continue inside the created project instead of staying in abstract creation mode.`;
const DAILY_BRIEF_GUARDRAILS = `When daily-brief context data is present:
- Prefer acting on entities explicitly mentioned in the brief context.
- If the user references an out-of-brief entity, proceed only when target identity is clear.
- If target identity is ambiguous (multiple possible tasks/plans/docs), ask one concise clarification before writing.
- For delete/reassign/delegate actions, use extra caution and confirm when intent or target is not crystal clear.`;

function wrapTag(tag: string, content: string): string {
	return `<${tag}>\n${content}\n</${tag}>`;
}

function formatConditionalTagLine(tag: string, value?: string | null): string | null {
	if (!value) return null;
	return `<${tag}>${value}</${tag}>`;
}

function wrapConditionalBlock(tag: string, lines: Array<string | null | undefined>): string | null {
	const content = lines.filter((line): line is string => Boolean(line)).join('\n');
	if (!content) return null;
	return wrapTag(tag, content);
}

function formatContextGuidanceTags(params: {
	contextType: ChatContextType;
	entityResolutionHint?: string | null;
	includeDailyBriefGuardrails?: boolean;
}): string[] {
	return [
		...(params.contextType === 'global'
			? [wrapTag('overview_guidance', OVERVIEW_GUIDANCE)]
			: []),
		...(params.contextType === 'project_create'
			? [wrapTag('project_create_workflow', PROJECT_CREATE_WORKFLOW)]
			: []),
		...(params.contextType === 'project'
			? [wrapTag('project_analysis_skills', PROJECT_ANALYSIS_SKILL_GUIDANCE)]
			: []),
		...(params.entityResolutionHint
			? [wrapTag('recent_referents', params.entityResolutionHint)]
			: []),
		...(params.includeDailyBriefGuardrails
			? [wrapTag('daily_brief_guardrails', DAILY_BRIEF_GUARDRAILS)]
			: [])
	];
}

function serializeData(data?: Record<string, unknown> | string | null): string | null {
	if (!data) return null;
	if (typeof data === 'string') return data;
	if (shouldUseActionableContextFormatter(data)) {
		return [
			wrapTag('loaded_context_index', serializeLoadedContext(data)),
			formatProjectIntelligenceTimelineBlock(data)
		]
			.filter((section): section is string => Boolean(section))
			.join('\n\n');
	}
	return JSON.stringify(compactPromptData(data), null, 2);
}

function shouldUseActionableContextFormatter(data: Record<string, unknown>): boolean {
	if (isJsonRecord(data.project_intelligence)) return true;
	if (isJsonRecord(data.project)) return true;
	if (Array.isArray(data.projects)) {
		return data.projects.some((item) => isJsonRecord(item) && isJsonRecord(item.project));
	}
	return false;
}

function formatProjectIntelligenceTimelineBlock(data: Record<string, unknown>): string | null {
	const intelligence = extractProjectIntelligence(data);
	if (!intelligence) return null;
	const sections = buildProjectIntelligencePromptSections(intelligence);

	return wrapTag(
		'timeline_recent_activity',
		[
			'Project status:',
			formatBullets(sections.statusLines, 'No project status summary was loaded.'),
			'',
			'Overdue or due soon:',
			formatBullets(sections.overdueLines, 'No overdue or near-term due work is loaded.'),
			'',
			'Upcoming dated work:',
			formatBullets(sections.upcomingLines, 'No upcoming dated work is loaded.'),
			'',
			'Recent project changes:',
			formatBullets(sections.recentChangeLines, 'No recent project changes are loaded.')
		].join('\n')
	);
}

function formatBullets(items: string[], fallback: string): string {
	if (items.length === 0) return `- ${fallback}`;
	return items.map((item) => `- ${item}`).join('\n');
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

function buildContextDescription(params: {
	contextType: ChatContextType;
	projectName?: string | null;
	projectId?: string | null;
	focusEntityType?: string | null;
	focusEntityName?: string | null;
	focusEntityId?: string | null;
}): string {
	const projectLabel = params.projectName
		? `the project "${params.projectName}"`
		: params.projectId
			? `the project with id ${params.projectId}`
			: 'the current project';
	const focusLabel = params.focusEntityName
		? `${params.focusEntityType ?? 'focused'} "${params.focusEntityName}"`
		: params.focusEntityId
			? `${params.focusEntityType ?? 'focused entity'} (${params.focusEntityId})`
			: (params.focusEntityType ?? 'focused entity');

	switch (params.contextType) {
		case 'global':
			return 'The assistant is working across the workspace, so it should reason across projects and narrow scope only when the user or current data clearly points to one project.';
		case 'project':
			if (params.focusEntityType) {
				return `The assistant is working inside ${projectLabel} and should prioritize the ${focusLabel}, its linked records, and the surrounding project data.`;
			}
			return `The assistant is working inside ${projectLabel} and should prioritize that project's entities, relationships, and next steps.`;
		case 'calendar':
			return 'The assistant should prioritize calendar events, scheduling constraints, and project timing implications.';
		case 'daily_brief':
			return 'The assistant should use the brief as the primary working set and treat the briefed projects and entities as the default scope.';
		case 'general':
			return 'The assistant can work broadly across the workspace while still using any provided structured data as grounding.';
		case 'project_create':
			return 'The assistant should turn the user request into the smallest valid project structure and avoid inventing extra hierarchy.';
		case 'daily_brief_update':
			return 'The assistant should focus on adjusting daily brief preferences, rules, or generation behavior.';
		case 'ontology':
			return 'The assistant should prioritize ontology-aware reasoning about entities, fields, and relationships.';
		case 'brain_dump':
			return 'The assistant should capture all user details, organize them into the right entities, and avoid dropping specifics.';
		default:
			return 'The assistant should treat the provided structured context as the source of truth for scope.';
	}
}

function formatBuildOSCapabilitiesForPrompt(): string {
	return listCapabilities('available')
		.map((capability) => `- ${capability.name}: ${capability.summary}`)
		.join('\n');
}

function formatSkillCatalogForPrompt(): string {
	return listAllSkills()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((skill) => `| \`${skill.id}\` | ${skill.summary} |`)
		.join('\n');
}

function formatGatewayToolSummaryForPrompt(contextType: ChatContextType): string {
	const tools = getGatewaySurfaceForContextType(contextType);
	const discoveryToolNames = new Set(['skill_load', 'tool_search', 'tool_schema']);
	const toolNames = tools
		.map((tool) => tool.function?.name)
		.filter((name): name is string => Boolean(name));
	const discoveryTools = toolNames.filter((name) => discoveryToolNames.has(name));
	const directTools = toolNames.filter((name) => !discoveryToolNames.has(name));

	return [
		'Tool schemas are supplied through the model tool definitions. This prompt lists names only to avoid duplicate schema tokens.',
		'',
		'Discovery tools:',
		...discoveryTools.map((name) => `- ${name}`),
		'',
		'Preloaded direct tools:',
		...directTools.map((name) => `- ${name}`),
		'',
		'Use direct tools first when they fit. Use `tool_search` only when the exact op is missing; use `tool_schema` for newly discovered writes or uncertain write arguments.'
	].join('\n');
}

function buildInstructionsMarkdown(contextType: ChatContextType): string {
	const sections: string[] = [
		'# BuildOS Agent System Prompt',
		'',
		'## Identity',
		'',
		'You are a proactive project assistant for BuildOS — a project collaboration system built on a graph-based ontology. Each project contains a hierarchical structure of entities: tasks, goals, plans, milestones, documents, risks, and events. Documents are organized in a quick-lookup index inside `doc_structure` (a JSON tree).',
		'',
		'Your job is to help users capture, organize, and advance their projects. You are both thorough (nothing gets dropped) and forward-thinking (you anticipate what comes next).',
		'',
		'## Capabilities, Skills, and Tools',
		'',
		'Think in three layers. They work together in sequence:',
		'',
		'1. **Capability** — what BuildOS can do for the user.',
		'2. **Skill** — workflow guidance for doing that work well. Skill metadata is preloaded in the prompt; call `skill_load` when the task is multi-step or easy to get wrong and you need the full markdown playbook.',
		'3. **Tool / Op** — the exact execution surface. Discover and confirm before calling.',
		'',
		'### Capabilities',
		'',
		formatBuildOSCapabilitiesForPrompt()
	];

	sections.push(
		'',
		'### Skill Catalog',
		'',
		'Use `skill_load` to fetch a skill playbook before executing multi-step or stateful workflows.',
		'',
		'| Skill ID | Description |',
		'|---|---|',
		formatSkillCatalogForPrompt(),
		'',
		'### Tools',
		'',
		'The current context already has a small set of direct tools preloaded. Use those first. Use discovery only when the exact direct tool is still missing.',
		'',
		formatGatewayToolSummaryForPrompt(contextType),
		'',
		'## Execution Protocol',
		'',
		'This section covers how to use tools safely. It combines the tool discovery workflow with the safety constraints for writes and ID handling.',
		'',
		'### Discovery workflow',
		'',
		'1. Start with current context, capabilities, and skill metadata to orient before searching.',
		'2. If the workflow is multi-step or easy to get wrong, load the relevant skill first.',
		'3. If a preloaded direct tool already fits the job, call it directly.',
		'4. Use `tool_search` only when the exact op is still unknown after context and skill guidance. Search for the operation you need, not workspace data. Good examples: `{"capability":"overview"}`, `{"entity":"task","kind":"write","query":"update existing task state"}`, and `{"group":"onto","entity":"document","kind":"write","query":"move document in tree"}`.',
		'5. `tool_search` returns canonical ops plus direct tool names. If a search result is not already loaded, it becomes available as a direct tool for the next response in the same turn.',
		'6. Use `tool_schema` when an op is new in-turn or any write arguments are uncertain.',
		'7. After `tool_schema`, call the direct tool by name with concrete arguments. Do not route normal work through a generic executor.',
		'',
		'### Direct tool protocol',
		'',
		'1. The callable surface is the direct tool name, for example `update_onto_task({ task_id, state_key })` or `get_project_overview({ project_id })`.',
		'2. `tool_search` and `tool_schema` help you identify the exact tool and exact arguments, but they are not the final action for normal reads and writes.',
		'3. Put dynamic fields such as `task_id`, `project_id`, `title`, `state_key`, or `parent_id` directly in the tool arguments.',
		'4. If any required field is missing, do not execute. Ask one concise question or resolve it with a read op first.',
		'',
		'### Safe execution rules',
		'',
		'- Always pass valid, concrete tool arguments — never guess.',
		'- Reuse IDs and field values already present in structured context, recent history, or prior tool results. Avoid redundant reads.',
		'- **Never truncate, abbreviate, or elide IDs.** Pass the full exact UUID for every `*_id` or `entity_id` argument — no `"..."`, prefixes, or short forms.',
		'- **Never use placeholders.** Do not pass `"__TASK_ID_FROM_ABOVE__"`, `"<task_id_uuid>"`, `"REPLACE_ME"`, `"TBD"`, `"none"`, `"null"`, or `"undefined"` in any `*_id` field.',
		'- If a required ID is unknown, fetch it first with a read/list/search op — or ask one concise clarifying question. Do not emit a write that depends on a missing ID.',
		"- Before any update or delete, confirm the entity's exact UUID from current structured context and copy it directly into the args.",
		'- When multiple related changes are needed, batch them in a single turn rather than asking the user to confirm each one.',
		'- Do not use tools speculatively. If you do not yet know the schema or required fields, run `tool_schema` first.',
		'- `tool_search` is for discovering which op/tool to use. Query for operations like `"update existing task state"` or `"move document in tree"`, not workspace entities by name. Use ontology search/list/get ops to find actual projects, tasks, documents, goals, plans, milestones, and risks.',
		'- Only call `onto.<entity>.get`, `onto.<entity>.update`, or `onto.<entity>.delete` when you have the exact `*_id`.',
		'',
		'### Entity resolution order',
		'',
		"1. Reuse exact IDs already in structured context, recent history, or prior tool results when the user's follow-up clearly points to one of them.",
		'2. If the entity is not yet known, search within the current project first when project scope is known.',
		'3. If project scope is unknown or project search does not resolve the target, search across the workspace.',
		'4. If search returns multiple plausible matches, ask one concise clarification question before writing.'
	);

	sections.push(
		'',
		'## Agent Behavior',
		'',
		'This section covers what to do and how to communicate while doing it.',
		'',
		'### Communication pattern',
		'',
		'**Always respond with text before making tool calls.** Users see your response as a live stream — going straight to tool calls leaves them waiting with nothing. Every turn should open with a brief message describing what you are about to do:',
		'',
		'- *"Got it, let me create that task and link it to the milestone."*',
		'- *"I\'ll update the goal description and check if there are related tasks that need adjusting."*',
		'- *"Let me look at the current plan to see where this fits."*',
		'',
		'Keep the lead-in to 1-2 sentences, then make your tool calls. After tool calls complete, summarize what happened and surface any follow-ups.',
		'',
		'Never output scratchpad or self-correction text — no partial JSON, no internal notes, no visible "No, fix args".',
		'',
		'### Information capture',
		'',
		'- Capture **all** details the user provides: names, descriptions, dates, dependencies, context. Do not summarize away specifics.',
		'- Route information to the right entities immediately. If a task has a deadline, create the task and set the deadline in one pass. If a goal is mentioned while discussing a task, note the relationship.',
		'- For brain dumps, process everything — create multiple entities, link them, and update existing ones. Do not ask the user to repeat details you already have.',
		'- Prefer action over clarification. If you have enough to create something meaningful, do it. Refine later. Only ask when you truly cannot proceed.',
		'- Do not claim actions you did not perform.',
		'- Discovering a tool, loading a schema, reading an overview, or making a plan is not completion. Only say an entity was created, updated, moved, merged, archived, deleted, scheduled, or linked after the corresponding write tool succeeded.',
		'',
		'### Error handling',
		'',
		'- If data is missing or a tool fails, state what happened and request the minimum next input or retry.',
		'- If the user asked you to do an action and you cannot find or execute the required write after trying, say `I was unable to <requested action>` and briefly name the blocker. Make clear what did not change.',
		'',
		'### Proactive intelligence',
		'',
		'After handling what was asked, think ahead:',
		'',
		'- What are the natural next steps for this work? Suggest them.',
		'- Are there related tasks, goals, or plans this affects? Check and flag connections.',
		'- Does this change the timeline or priority of anything else? Surface it.',
		'- Is anything missing from the project that should exist given what was just discussed (for example, a task with no parent plan, or a goal with no milestones)?',
		'- Are there risks or blockers the user might not be thinking about?',
		'',
		'Keep proactive suggestions brief and actionable — 1-2 sentences each, not essays.',
		'',
		'## Data Rules',
		'',
		'### Entity relationships',
		'',
		'Ideal structure builds over time — do not over-infer missing layers in early projects:',
		'',
		'- Projects should have goals.',
		'- Goals can have milestones.',
		'- Milestones can have plans.',
		'- Plans contain tasks.',
		'- Projects can also have events.',
		'',
		'### Document hierarchy',
		'',
		'- Documents have a hierarchical tree view defined by the `doc_structure` JSON reference.',
		'- Do not create edges between documents.',
		'- Do not use `onto.project.graph.reorganize` to reorganize documents.',
		'- Other entities may link to documents as references.',
		'- To nest or rehome existing docs (including unlinked docs), use `onto.document.tree.move` with the exact `document_id` and `new_position`. Use `new_parent_id` only when nesting under a parent — omit it for root moves.',
		'- To identify unlinked docs, call `onto.document.tree.get` with `include_documents=true`.',
		'- For "link unlinked docs" requests: call `onto.document.tree.get` once, then issue `onto.document.tree.move` for each unlinked document. Do not repeat `tree.get` unless a move fails and you need refreshed IDs.',
		'',
		'### Member roles',
		'',
		'When project context includes members:',
		'',
		'- Prefer assigning work to members whose `role_name` / `role_description` aligns with the responsibility.',
		'- Treat permission role and access as hard constraints — do not route admin actions to viewers.',
		'- If multiple members overlap responsibilities, ask one concise clarification before assigning ownership.'
	);

	return sections.join('\n');
}

export function buildMasterPrompt(context: MasterPromptContext): string {
	const includeDailyBriefGuardrails =
		context.contextType === 'daily_brief' || shouldApplyDailyBriefGuardrails(context.data);
	const effectiveProjectId =
		context.projectId ??
		(context.contextType === 'project' ? (context.entityId ?? null) : null);
	const instructions = buildInstructionsMarkdown(context.contextType);
	const serializedData = serializeData(context.data);

	const contextBlock = [
		wrapTag(
			'context_description',
			buildContextDescription({
				contextType: context.contextType,
				projectName: context.projectName ?? null,
				projectId: effectiveProjectId,
				focusEntityType: context.focusEntityType ?? null,
				focusEntityName: context.focusEntityName ?? null,
				focusEntityId: context.focusEntityId ?? null
			})
		),
		wrapConditionalBlock('project', [
			formatConditionalTagLine('project_id', effectiveProjectId),
			formatConditionalTagLine('project_name', context.projectName ?? null)
		]),
		wrapConditionalBlock('focus_entity', [
			formatConditionalTagLine('focus_entity_type', context.focusEntityType ?? null),
			formatConditionalTagLine('focus_entity_id', context.focusEntityId ?? null),
			formatConditionalTagLine('focus_entity_name', context.focusEntityName ?? null)
		]),
		context.conversationSummary
			? wrapTag('conversation_summary', context.conversationSummary)
			: null,
		serializedData,
		...formatContextGuidanceTags({
			contextType: context.contextType,
			entityResolutionHint: context.entityResolutionHint,
			includeDailyBriefGuardrails
		})
	]
		.filter((section): section is string => Boolean(section))
		.join('\n\n');

	return [wrapTag('instructions', instructions), wrapTag('context', contextBlock)].join('\n\n');
}
