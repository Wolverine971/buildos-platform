// apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { extractToolNamesFromDefinitions } from '$lib/services/agentic-chat/tools/core/tools.config';
import { listCapabilities } from '$lib/services/agentic-chat/tools/registry/capability-catalog';
import { listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';
import {
	LITE_PROMPT_VARIANT,
	type LitePromptContextInventory,
	type LitePromptDataSummary,
	type LitePromptEnvelope,
	type LitePromptFocus,
	type LitePromptInput,
	type LitePromptRetrievalMap,
	type LitePromptSection,
	type LitePromptSectionId,
	type LitePromptTimelineSummary,
	type LitePromptToolsSummary
} from './types';

const DISCOVERY_TOOL_NAMES = new Set(['skill_load', 'tool_search', 'tool_schema']);
const DEFAULT_TIMEZONE = 'UTC';

export const LITE_PROMPT_SECTION_ORDER: LitePromptSectionId[] = [
	'identity_mission',
	'focus_purpose',
	'location_loaded_context',
	'timeline_recent_activity',
	'operating_strategy',
	'capabilities_skills_tools',
	'context_inventory_retrieval',
	'safety_data_rules'
];

type SectionDraft = Omit<LitePromptSection, 'chars' | 'estimatedTokens'>;

export function buildLitePromptEnvelope(input: LitePromptInput): LitePromptEnvelope {
	const focus = buildFocus(input);
	const dataSummary = summarizeData(input.data);
	const timeline = buildTimelineSummary(input, focus, dataSummary);
	const retrievalMap = buildRetrievalMap(input.retrievalMap ?? null, focus, dataSummary);
	const toolsSummary = buildToolsSummary(input.contextType, input.tools ?? null);
	const contextInventory: LitePromptContextInventory = {
		focus,
		dataSummary,
		timeline,
		retrievalMap
	};

	const sections = [
		buildIdentityMissionSection(),
		buildFocusPurposeSection(focus),
		buildLocationLoadedContextSection(focus, input.data),
		buildTimelineRecentActivitySection(timeline),
		buildOperatingStrategySection(),
		buildCapabilitiesSkillsToolsSection(toolsSummary),
		buildContextInventoryRetrievalSection(contextInventory),
		buildSafetyDataRulesSection()
	];

	return {
		promptVariant: LITE_PROMPT_VARIANT,
		systemPrompt: renderSystemPrompt(sections),
		sections,
		contextInventory,
		toolsSummary
	};
}

function buildIdentityMissionSection(): LitePromptSection {
	return makeSection({
		id: 'identity_mission',
		title: 'Identity and Mission',
		kind: 'static',
		source: 'lite.static_frame',
		content: [
			'Who:',
			'- You are BuildOS, a helpful project assistant for the signed-in user.',
			'- BuildOS works inside a graph-based project collaboration system with projects, goals, milestones, plans, tasks, documents, risks, events, members, and relationships.',
			'',
			'Mission:',
			'- Help users capture, organize, understand, and advance their project work.',
			'- Preserve concrete user details, ground answers in available context, and use tools when the answer or action requires current project data.',
			'- Keep the conversation useful for whatever the user says next; do not overfit the seed prompt to one expected request.'
		].join('\n')
	});
}

function buildFocusPurposeSection(focus: LitePromptFocus): LitePromptSection {
	return makeSection({
		id: 'focus_purpose',
		title: 'Current Focus and Purpose',
		kind: 'dynamic',
		source: 'lite.focus_context',
		slots: {
			contextType: focus.contextType,
			projectId: focus.projectId,
			projectName: focus.projectName,
			entityId: focus.entityId,
			focusEntityType: focus.focusEntityType,
			focusEntityId: focus.focusEntityId,
			focusEntityName: focus.focusEntityName
		},
		content: [
			'What is in focus:',
			`- Context type: ${focus.contextType}`,
			`- Project: ${formatNullableLabel(focus.projectName, focus.projectId)}`,
			`- Focus entity: ${formatFocusEntity(focus)}`,
			'',
			'Why this context exists:',
			`- ${describePurpose(focus)}`
		].join('\n')
	});
}

function buildLocationLoadedContextSection(
	focus: LitePromptFocus,
	data: LitePromptInput['data']
): LitePromptSection {
	return makeSection({
		id: 'location_loaded_context',
		title: 'Location and Loaded Context',
		kind: 'dynamic',
		source: 'lite.loaded_context',
		slots: {
			productSurface: focus.productSurface,
			conversationPosition: focus.conversationPosition,
			contextType: focus.contextType
		},
		content: [
			'Where the agent is:',
			`- Product surface: ${focus.productSurface}`,
			`- Conversation position: ${focus.conversationPosition}`,
			`- Scope location: ${describeScopeLocation(focus)}`,
			'',
			serializeLoadedContext(data)
		].join('\n')
	});
}

function buildTimelineRecentActivitySection(
	timeline: LitePromptTimelineSummary
): LitePromptSection {
	return makeSection({
		id: 'timeline_recent_activity',
		title: 'Timeline and Recent Activity',
		kind: 'dynamic',
		source: 'lite.timeline_context',
		slots: {
			generatedAt: timeline.generatedAt,
			timezone: timeline.timezone,
			scope: timeline.scope,
			factCount: timeline.facts.length
		},
		content: [
			'When this chat turn is being seeded:',
			`- Current time: ${timeline.generatedAt}`,
			`- Timezone: ${timeline.timezone}`,
			`- Timeline scope: ${timeline.scope}`,
			'',
			'Timeline and recent activity facts:',
			formatBullets(timeline.facts, 'No timeline facts were loaded in the seed context.')
		].join('\n')
	});
}

function buildOperatingStrategySection(): LitePromptSection {
	return makeSection({
		id: 'operating_strategy',
		title: 'Operating Strategy',
		kind: 'static',
		source: 'lite.strategy',
		content: [
			'How to act:',
			'- Start with the loaded context. If the loaded context is enough, answer without extra tool calls.',
			'- Use direct tools first when they fit. Use discovery tools only when the exact operation or schema is missing.',
			'- Load a skill when the workflow is multi-step, stateful, or easy to get wrong; do not load full skill playbooks for simple answers.',
			'- Ask one concise clarification only when the missing detail blocks a safe answer or write.',
			'- After a tool call, anchor the next step in what the tool actually returned: what changed, where the runtime is now, and what should happen next.',
			'- Keep scratch reasoning private and make user-facing responses direct.'
		].join('\n')
	});
}

function buildCapabilitiesSkillsToolsSection(
	toolsSummary: LitePromptToolsSummary
): LitePromptSection {
	const capabilities = listCapabilities('available').map(
		(capability) => `${capability.name}: ${capability.summary}`
	);
	const skills = listAllSkills()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((skill) => `${skill.id}: ${skill.summary}`);

	return makeSection({
		id: 'capabilities_skills_tools',
		title: 'Capabilities, Skills, and Tools',
		kind: 'mixed',
		source: 'lite.capability_tool_surface',
		slots: {
			contextType: toolsSummary.contextType,
			discoveryTools: toolsSummary.discoveryTools,
			directTools: toolsSummary.directTools,
			totalTools: toolsSummary.totalTools
		},
		content: [
			'Capabilities available at seed time:',
			formatBullets(capabilities, 'No capabilities are registered.'),
			'',
			'Skill metadata available at seed time:',
			formatBullets(skills, 'No skills are registered.'),
			'',
			'Tool surface for this context:',
			'- Tool schemas are supplied through model tool definitions, not duplicated in this prompt text.',
			'',
			'Discovery tools:',
			formatBullets(toolsSummary.discoveryTools, 'No discovery tools are preloaded.'),
			'',
			'Preloaded direct tools:',
			formatBullets(toolsSummary.directTools, 'No direct tools are preloaded.')
		].join('\n')
	});
}

function buildContextInventoryRetrievalSection(
	inventory: LitePromptContextInventory
): LitePromptSection {
	const { dataSummary, retrievalMap } = inventory;
	const arrayCountLines = Object.entries(dataSummary.arrayCounts).map(
		([key, count]) => `${key}: ${count}`
	);

	return makeSection({
		id: 'context_inventory_retrieval',
		title: 'Context Inventory and Retrieval Map',
		kind: 'dynamic',
		source: 'lite.context_inventory',
		slots: {
			dataKind: dataSummary.kind,
			topLevelKeys: dataSummary.topLevelKeys,
			arrayCounts: dataSummary.arrayCounts,
			loaded: retrievalMap.loaded,
			omitted: retrievalMap.omitted,
			fetchWhenNeeded: retrievalMap.fetchWhenNeeded
		},
		content: [
			'Context inventory:',
			`- Data kind: ${dataSummary.kind}`,
			`- Has structured data: ${dataSummary.hasData ? 'yes' : 'no'}`,
			`- Top-level keys: ${formatInlineList(dataSummary.topLevelKeys)}`,
			`- Object keys: ${formatInlineList(dataSummary.objectKeys)}`,
			'- Array counts:',
			formatBullets(arrayCountLines, 'No top-level arrays were loaded.'),
			'',
			'Retrieval map:',
			'Loaded:',
			formatBullets(retrievalMap.loaded, 'Nothing explicit was marked as loaded.'),
			'',
			'Omitted by default:',
			formatBullets(retrievalMap.omitted, 'Nothing explicit was marked as omitted.'),
			'',
			'Fetch only when needed:',
			formatBullets(retrievalMap.fetchWhenNeeded, 'No follow-up fetch rules were provided.'),
			'',
			'Notes:',
			formatBullets(retrievalMap.notes, 'No retrieval notes were provided.')
		].join('\n')
	});
}

function buildSafetyDataRulesSection(): LitePromptSection {
	return makeSection({
		id: 'safety_data_rules',
		title: 'Safety and Data Rules',
		kind: 'static',
		source: 'lite.safety',
		content: [
			'- Do not claim a tool ran unless the runtime supplied a successful tool result.',
			'- Do not invent project, task, document, calendar, member, or Libri data that is not in loaded context or tool results.',
			'- For writes, use exact IDs from context or tool results. If the target is ambiguous, ask before mutating state.',
			'- Treat permissions, member roles, and access as hard constraints.',
			'- Preserve document hierarchy rules: documents live in the document tree, not graph edges.',
			'- When context is incomplete, state the limit and use the narrowest tool that can fill the gap.'
		].join('\n')
	});
}

function buildFocus(input: LitePromptInput): LitePromptFocus {
	const effectiveProjectId =
		input.projectId ?? (isProjectScoped(input.contextType) ? (input.entityId ?? null) : null);

	return {
		contextType: input.contextType,
		productSurface: input.productSurface ?? defaultProductSurface(input.contextType),
		conversationPosition:
			input.conversationPosition ?? 'initial seed context for the current chat',
		projectId: effectiveProjectId,
		projectName: input.projectName ?? null,
		entityId: input.entityId ?? null,
		focusEntityType: input.focusEntityType ?? null,
		focusEntityId: input.focusEntityId ?? null,
		focusEntityName: input.focusEntityName ?? null
	};
}

function buildToolsSummary(
	contextType: ChatContextType,
	tools: ChatToolDefinition[] | null
): LitePromptToolsSummary {
	const selectedTools = tools ?? getGatewaySurfaceForContextType(contextType);
	const toolNames = extractToolNamesFromDefinitions(selectedTools);
	const discoveryTools = toolNames.filter((name) => DISCOVERY_TOOL_NAMES.has(name));
	const directTools = toolNames.filter((name) => !DISCOVERY_TOOL_NAMES.has(name));

	return {
		contextType,
		discoveryTools,
		directTools,
		totalTools: toolNames.length
	};
}

function summarizeData(data: LitePromptInput['data']): LitePromptDataSummary {
	if (!data) {
		return {
			kind: 'empty',
			hasData: false,
			topLevelKeys: [],
			arrayCounts: {},
			objectKeys: [],
			contextMeta: null
		};
	}

	if (typeof data === 'string') {
		return {
			kind: 'text',
			hasData: data.trim().length > 0,
			topLevelKeys: [],
			arrayCounts: {},
			objectKeys: [],
			textChars: data.length,
			contextMeta: null
		};
	}

	const topLevelKeys = Object.keys(data).sort();
	const arrayCounts = Object.fromEntries(
		topLevelKeys
			.filter((key) => Array.isArray(data[key]))
			.map((key) => [key, (data[key] as unknown[]).length])
	);
	const objectKeys = topLevelKeys.filter((key) => isRecord(data[key]));

	return {
		kind: 'json',
		hasData: true,
		topLevelKeys,
		arrayCounts,
		objectKeys,
		contextMeta: isRecord(data.context_meta) ? data.context_meta : null
	};
}

function buildTimelineSummary(
	input: LitePromptInput,
	focus: LitePromptFocus,
	dataSummary: LitePromptDataSummary
): LitePromptTimelineSummary {
	const generatedAt = normalizeTime(input.now);
	const timezone = input.timezone ?? DEFAULT_TIMEZONE;
	const facts: string[] = [];
	const data = isRecord(input.data) ? input.data : null;

	if (dataSummary.contextMeta?.generated_at) {
		facts.push(`Context generated at ${String(dataSummary.contextMeta.generated_at)}.`);
	}

	const eventWindow = data && isRecord(data.events_window) ? data.events_window : null;
	if (eventWindow) {
		facts.push(
			`Event window: ${String(eventWindow.start_at ?? 'unknown')} to ${String(eventWindow.end_at ?? 'unknown')}.`
		);
	}

	const recentActivityCount = countRecentActivity(data);
	if (recentActivityCount > 0) {
		facts.push(`Recent activity items loaded: ${recentActivityCount}.`);
	}

	for (const fact of collectDateFacts(data).slice(0, 8)) {
		facts.push(fact);
	}

	if (facts.length === 0) {
		facts.push('No project timeline or recent activity details were loaded in this seed.');
	}

	return {
		generatedAt,
		timezone,
		scope: describeTimelineScope(focus),
		facts
	};
}

function buildRetrievalMap(
	input: LitePromptInput['retrievalMap'],
	focus: LitePromptFocus,
	dataSummary: LitePromptDataSummary
): LitePromptRetrievalMap {
	const defaults = defaultRetrievalMap(focus, dataSummary);
	return {
		loaded: mergeList(defaults.loaded, input?.loaded),
		omitted: mergeList(defaults.omitted, input?.omitted),
		fetchWhenNeeded: mergeList(defaults.fetchWhenNeeded, input?.fetchWhenNeeded),
		notes: mergeList(defaults.notes, input?.notes)
	};
}

function defaultRetrievalMap(
	focus: LitePromptFocus,
	dataSummary: LitePromptDataSummary
): LitePromptRetrievalMap {
	const loaded = dataSummary.hasData
		? ['seed context payload', `${focus.contextType} scope metadata`]
		: [`${focus.contextType} scope metadata only`];
	const notes = [
		'Prefer loaded context first.',
		'Use direct tools for missing current data or actions.',
		'Use skill_load only for workflows that need the full playbook.'
	];

	switch (focus.contextType) {
		case 'global':
		case 'general':
		case 'daily_brief':
		case 'brain_dump':
			return {
				loaded,
				omitted: [
					'full per-project task graphs',
					'full document bodies',
					'unbounded calendar history'
				],
				fetchWhenNeeded: [
					'named project details',
					'specific task/document details',
					'exact calendar window'
				],
				notes
			};
		case 'project':
		case 'ontology':
			return {
				loaded,
				omitted: [
					'unrelated projects',
					'full document bodies unless focused',
					'unbounded history'
				],
				fetchWhenNeeded: [
					'details for an entity not present in context',
					'document body by exact document id',
					'calendar details outside the loaded event window'
				],
				notes
			};
		case 'project_create':
			return {
				loaded,
				omitted: ['existing project graph unless explicitly provided'],
				fetchWhenNeeded: ['schema details for uncertain create payload fields'],
				notes
			};
		case 'calendar':
			return {
				loaded,
				omitted: ['non-calendar project graph details unless explicitly loaded'],
				fetchWhenNeeded: [
					'project details for calendar mapping',
					'event details by exact event id'
				],
				notes
			};
		default:
			return {
				loaded,
				omitted: ['unbounded workspace data'],
				fetchWhenNeeded: ['specific missing entity details'],
				notes
			};
	}
}

function serializeLoadedContext(data: LitePromptInput['data']): string {
	if (!data) {
		return 'Loaded context: no structured context payload was loaded for this seed.';
	}

	if (typeof data === 'string') {
		const trimmed = data.trim();
		return trimmed
			? ['Loaded context payload:', '```text', trimmed, '```'].join('\n')
			: 'Loaded context: empty text payload.';
	}

	return [
		'Loaded context payload (source of truth):',
		'```json',
		JSON.stringify(compactPromptData(data), null, 2),
		'```'
	].join('\n');
}

function compactPromptData(data: Record<string, unknown>): Record<string, unknown> {
	const compacted = cloneJsonRecord(data);
	if (!('doc_structure' in compacted) || !Array.isArray(compacted.documents)) {
		return compacted;
	}

	compacted.documents = compacted.documents.filter(
		(doc) => isRecord(doc) && doc.is_unlinked === true
	);
	return compacted;
}

function renderSystemPrompt(sections: LitePromptSection[]): string {
	return [
		'# BuildOS Lite Agentic Chat Prompt',
		'',
		`Prompt variant: ${LITE_PROMPT_VARIANT}`,
		'',
		...sections.map((section) => [`## ${section.title}`, '', section.content].join('\n'))
	].join('\n\n');
}

function makeSection(draft: SectionDraft): LitePromptSection {
	return {
		...draft,
		chars: draft.content.length,
		estimatedTokens: estimateTokensFromText(draft.content)
	};
}

function isProjectScoped(contextType: ChatContextType): boolean {
	return ['project', 'ontology'].includes(contextType);
}

function defaultProductSurface(contextType: ChatContextType): string {
	switch (contextType) {
		case 'global':
		case 'general':
			return 'global workspace chat';
		case 'project':
			return 'project chat';
		case 'project_create':
			return 'project creation chat';
		case 'calendar':
			return 'calendar chat';
		case 'daily_brief':
		case 'daily_brief_update':
			return 'daily brief chat';
		case 'ontology':
			return 'ontology entity chat';
		case 'brain_dump':
			return 'brain dump capture chat';
		default:
			return 'BuildOS agentic chat';
	}
}

function describePurpose(focus: LitePromptFocus): string {
	switch (focus.contextType) {
		case 'global':
		case 'general':
			return 'Seed a workspace-level assistant that can orient across projects and narrow scope when the user asks.';
		case 'project':
			return 'Seed a project-scoped assistant that understands the current project and can help move its work forward.';
		case 'project_create':
			return 'Seed a project creation assistant that can turn a rough idea into the smallest valid project structure.';
		case 'calendar':
			return 'Seed a calendar-aware assistant that can reason about time, events, and scheduling constraints.';
		case 'daily_brief':
			return 'Seed an assistant around the daily brief as the default working set.';
		case 'daily_brief_update':
			return 'Seed an assistant for adjusting daily brief preferences, rules, or generation behavior.';
		case 'ontology':
			return 'Seed an ontology-aware assistant that can reason about entities, fields, and relationships.';
		case 'brain_dump':
			return 'Seed a capture assistant that can preserve details and organize them into the right project entities.';
		default:
			return 'Seed the assistant with enough landscape context to respond safely to the next user message.';
	}
}

function describeScopeLocation(focus: LitePromptFocus): string {
	if (focus.focusEntityType || focus.focusEntityId) {
		return `inside ${formatNullableLabel(focus.projectName, focus.projectId)}, focused on ${formatFocusEntity(focus)}`;
	}
	if (focus.projectName || focus.projectId) {
		return `inside ${formatNullableLabel(focus.projectName, focus.projectId)}`;
	}
	return 'workspace-level context across accessible projects';
}

function describeTimelineScope(focus: LitePromptFocus): string {
	if (focus.focusEntityType || focus.focusEntityId) {
		return `focused entity timeline inside ${formatNullableLabel(focus.projectName, focus.projectId)}`;
	}
	if (focus.projectName || focus.projectId) {
		return `project timeline for ${formatNullableLabel(focus.projectName, focus.projectId)}`;
	}
	if (focus.contextType === 'calendar') {
		return 'calendar timeline and scheduling window';
	}
	return 'workspace timeline across accessible projects';
}

function collectDateFacts(data: Record<string, unknown> | null): string[] {
	if (!data) return [];
	const facts: string[] = [];
	const arraySpecs: Array<[string, string[]]> = [
		['goals', ['target_date', 'completed_at', 'updated_at']],
		['milestones', ['due_at', 'completed_at', 'updated_at']],
		['plans', ['updated_at']],
		['tasks', ['start_at', 'due_at', 'completed_at', 'updated_at']],
		['events', ['start_at', 'end_at', 'updated_at']],
		['documents', ['updated_at']],
		['recent_activity', ['updated_at']]
	];

	for (const [key, dateKeys] of arraySpecs) {
		const value = data[key];
		if (Array.isArray(value)) {
			const count = value.filter(
				(item) => isRecord(item) && dateKeys.some((dateKey) => Boolean(item[dateKey]))
			).length;
			if (count > 0) facts.push(`${key}: ${count} item(s) include timeline dates.`);
		}
	}

	const projects = data.projects;
	if (Array.isArray(projects)) {
		let nestedRecentActivity = 0;
		for (const bundle of projects) {
			if (!isRecord(bundle)) continue;
			if (Array.isArray(bundle.recent_activity)) {
				nestedRecentActivity += bundle.recent_activity.length;
			}
		}
		if (nestedRecentActivity > 0) {
			facts.push(`projects.recent_activity: ${nestedRecentActivity} item(s) loaded.`);
		}
	}

	return facts;
}

function countRecentActivity(data: Record<string, unknown> | null): number {
	if (!data) return 0;
	if (Array.isArray(data.recent_activity)) return data.recent_activity.length;
	const projects = data.projects;
	if (!Array.isArray(projects)) return 0;
	return projects.reduce((total, projectBundle) => {
		if (!isRecord(projectBundle) || !Array.isArray(projectBundle.recent_activity)) return total;
		return total + projectBundle.recent_activity.length;
	}, 0);
}

function normalizeTime(value: Date | string | null | undefined): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
	}
	return new Date().toISOString();
}

function formatFocusEntity(focus: LitePromptFocus): string {
	const label = focus.focusEntityName ?? focus.focusEntityId;
	if (!label && !focus.focusEntityType) return 'none';
	return [focus.focusEntityType ?? 'entity', label ?? 'unknown id'].join(' ');
}

function formatNullableLabel(name: string | null, id: string | null): string {
	if (name && id) return `${name} (${id})`;
	if (name) return name;
	if (id) return id;
	return 'none';
}

function formatInlineList(items: string[]): string {
	return items.length > 0 ? items.join(', ') : 'none';
}

function formatBullets(items: string[], fallback: string): string {
	if (items.length === 0) return `- ${fallback}`;
	return items.map((item) => `- ${item}`).join('\n');
}

function mergeList(defaults: string[], overrides?: string[] | null): string[] {
	return Array.from(new Set([...defaults, ...(overrides ?? [])].filter(Boolean)));
}

function cloneJsonRecord<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
