// apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { extractToolNamesFromDefinitions } from '$lib/services/agentic-chat/tools/core/tools.config';
import { listCapabilities } from '$lib/services/agentic-chat/tools/registry/capability-catalog';
import { listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';
import type {
	FastChatProjectIntelligence,
	FastChatRecentChange,
	FastChatWorkSignal
} from '$lib/services/agentic-chat-v2/context-models';
import {
	LITE_PROMPT_VARIANT,
	type LitePromptContextInventory,
	type LitePromptDataSummary,
	type LitePromptEnvelope,
	type LitePromptFocus,
	type LitePromptInput,
	type LitePromptProjectDigest,
	type LitePromptRetrievalMap,
	type LitePromptSection,
	type LitePromptSectionId,
	type LitePromptTimelineItem,
	type LitePromptTimelineSummary,
	type LitePromptToolsSummary
} from './types';

const DISCOVERY_TOOL_NAMES = new Set(['skill_load', 'tool_search', 'tool_schema']);
const DEFAULT_TIMEZONE = 'UTC';
const LOADED_CONTEXT_PROJECT_REF_LIMIT = 5;
const LOADED_CONTEXT_ENTITY_REF_LIMIT = 6;
const LOADED_CONTEXT_SIGNAL_REF_LIMIT = 4;
const LOADED_CONTEXT_RECENT_REF_LIMIT = 5;
const LOADED_CONTEXT_TEXT_MAX_CHARS = 2000;
const PROMPT_DUE_SOON_SIGNAL_LIMIT = 5;
const PROMPT_OVERDUE_SIGNAL_LIMIT = 3;
const PROMPT_UPCOMING_SIGNAL_LIMIT = 6;
const PROMPT_RECENT_CHANGE_LIMIT = 6;
const PROMPT_RECENT_OVERDUE_DAYS = 45;
const PROMPT_STALE_OVERDUE_DAYS = 90;
const VISIBLE_ASSISTANT_CONTENT_CONTRACT =
	'Every token you put in assistant content is streamed directly to the user and stored in chat history; use assistant content only for final user-visible prose, never reasoning, scratchpad, prompt analysis, rubric checks, or tool-result bookkeeping.';

// Section order rationale (2026-04-17): describe what the agent can do
// (capabilities + skills + tools) BEFORE telling it how to use them
// (operating_strategy + safety). Keeps the static prefix cacheable and reads
// naturally: what → how → where/when.
export const LITE_PROMPT_SECTION_ORDER: LitePromptSectionId[] = [
	'identity_mission',
	'capabilities_skills_tools',
	'tool_surface_dynamic',
	'operating_strategy',
	'safety_data_rules',
	'focus_purpose',
	'location_loaded_context',
	'timeline_recent_activity',
	'context_inventory_retrieval'
];

const OVERVIEW_GUIDANCE_LITE = [
	'Workflow hints for workspace-level chat:',
	'- For routine status questions about the workspace or a named project, prefer overview retrieval first instead of generic ontology discovery.',
	'- Workspace-wide status -> get_workspace_overview({}).',
	'- Named or in-scope project status -> get_project_overview({ project_id }) when the ID is known, otherwise get_project_overview({ query }).',
	'- If structured context already has a clear next_step_short or equivalent summary, answer from context instead of loading audit skills or repeating project graph reads.'
].join('\n');

const PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE = [
	'Workflow hints for project chat:',
	'- Audit and forecast are project skills, not separate context types. Stay in project.',
	"- For audits, health reviews, stress tests, blockers, stale work, or gap analysis -> load skill_load({ skill: 'project_audit' }) before the analysis if the answer is multi-step or evidence-heavy.",
	'- For forecasts, schedule risk, slippage, scenarios, or "are we on track" -> load skill_load({ skill: \'project_forecast\' }) before the analysis if the answer depends on assumptions or multiple signals.',
	'- Use the current project_id and project-focused direct tools; do not invent project_audit or project_forecast sessions.'
].join('\n');

const PROJECT_CREATE_WORKFLOW_LITE = [
	'Project creation workflow:',
	'- Turn a rough idea into the smallest valid project structure with a clear name, type_key, description / props, and only the entities and relationships the user actually described.',
	'- project.type_key must start with "project.", for example project.creative.novel.',
	'- Always include entities: [] and relationships: [] arrays even when empty.',
	'- If the user stated an outcome, add one goal. If they listed concrete actions, add only those task entities. Add plans or milestones only when they clearly described workstreams, phases, or date-driven structure.',
	'- Entity labels: goal / plan / metric use `name`; task / milestone / document / risk use `title`; requirement uses `text`; source uses `uri`. Milestones also require `due_at`.',
	"- For goal entities, use dedicated fields like target_date and measurement_criteria instead of burying them only in props. If the user gives a month/day without a year, infer the next plausible future date in the user's locale.",
	'- **Connect the graph.** When the user has both a goal and tasks, emit containment relationships linking every task (child) to that goal (parent). A project with 1 goal + N tasks should produce exactly N goal-task containment edges; leaving tasks unlinked defeats the graph model.',
	'- The project itself is implicit and must NOT appear as a relationship endpoint. Never use `kind: "project"` or `temp_id: "project"`; relationship endpoints must reference entities you defined in the entities array.',
	'- Relationship item shape: every entry must reference entities by `{ temp_id, kind }` where `kind` is one of `goal | milestone | plan | task | document | risk | requirement | metric | source`. Use the form `{ from: { temp_id, kind }, to: { temp_id, kind }, rel: "contains" }` (or the array form `[{ temp_id, kind }, { temp_id, kind }]`). The relationship type goes in the `rel` field, not `type`. Never pass raw temp_id strings like `["g1", "t1"]`.',
	'- Use clarifications[] only when critical information cannot be reasonably inferred; still send the project skeleton.',
	'- Ask one concise clarification only when a required detail blocks a safe create payload.',
	'- After creation succeeds, continue inside the created project instead of staying in abstract creation mode.'
].join('\n');

const DAILY_BRIEF_GUARDRAILS_LITE = [
	'Workflow hints when daily-brief context is loaded:',
	'- Prefer acting on entities explicitly mentioned in the brief.',
	'- For out-of-brief entities, proceed only when target identity is clear.',
	'- If target identity is ambiguous, ask one concise clarification before writing.',
	'- For delete / reassign / delegate actions, confirm target unless intent is crystal clear.'
].join('\n');

const FOCUS_WORKFLOW_GUIDANCE: Partial<Record<ChatContextType, string>> = {
	global: OVERVIEW_GUIDANCE_LITE,
	general: OVERVIEW_GUIDANCE_LITE,
	project: PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE,
	ontology: PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE,
	project_create: PROJECT_CREATE_WORKFLOW_LITE,
	daily_brief: DAILY_BRIEF_GUARDRAILS_LITE,
	daily_brief_update: DAILY_BRIEF_GUARDRAILS_LITE
};

type SectionDraft = Omit<LitePromptSection, 'chars' | 'estimatedTokens'>;

export function buildLitePromptEnvelope(input: LitePromptInput): LitePromptEnvelope {
	const focus = buildFocus(input);
	const dataSummary = summarizeData(input.data);
	const projectDigest = buildProjectDigest(input.data, focus, normalizeTime(input.now));
	const timeline = buildTimelineSummary(input, focus, dataSummary, projectDigest);
	const retrievalMap = buildRetrievalMap(input.retrievalMap ?? null, focus, dataSummary);
	const toolsSummary = buildToolsSummary(input.contextType, input.tools ?? null);
	const contextInventory: LitePromptContextInventory = {
		focus,
		dataSummary,
		timeline,
		retrievalMap,
		projectDigest
	};

	const timelineSection = shouldRenderTimelineSection(focus)
		? buildTimelineRecentActivitySection(timeline, focus, projectDigest)
		: null;

	const sections: LitePromptSection[] = [
		buildIdentityMissionSection(),
		buildCapabilitiesSkillsToolsSection(),
		buildToolSurfaceDynamicSection(toolsSummary),
		buildOperatingStrategySection(),
		buildSafetyDataRulesSection(input.data ?? null),
		buildFocusPurposeSection(focus, projectDigest, input.data ?? null),
		buildLocationLoadedContextSection(focus, input.data),
		...(timelineSection ? [timelineSection] : []),
		buildContextInventoryRetrievalSection(contextInventory)
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
			'- You are a proactive project assistant for BuildOS, working for the signed-in user.',
			'- BuildOS is a graph-based project collaboration system. Projects can contain goals, milestones, plans, tasks, documents, risks, events, members, and relationships.',
			'',
			'Mission:',
			'- Help users capture, organize, understand, and advance their project work.',
			'- Preserve concrete user details, ground answers in available context, and use tools when the answer or action requires current project data.',
			'- Keep the conversation useful for whatever the user says next; do not overfit the seed prompt to one expected request.'
		].join('\n')
	});
}

function buildFocusPurposeSection(
	focus: LitePromptFocus,
	projectDigest: LitePromptProjectDigest | null,
	data: LitePromptInput['data']
): LitePromptSection {
	const workflowBlock = FOCUS_WORKFLOW_GUIDANCE[focus.contextType] ?? null;
	const isBriefContext =
		focus.contextType === 'daily_brief' || focus.contextType === 'daily_brief_update';
	const appendBriefBlock =
		!isBriefContext && shouldApplyDailyBriefGuardrails(data)
			? DAILY_BRIEF_GUARDRAILS_LITE
			: null;
	const extraWorkflow = [workflowBlock, appendBriefBlock].filter((section): section is string =>
		Boolean(section)
	);

	if (focus.contextType === 'project_create') {
		const coreContent = [
			'Current focus:',
			'- The user is trying to create a new BuildOS project right now.',
			'- No existing project or focus entity exists yet; treat the user message as the source of truth for the initial project.',
			'',
			'Use this seed for:',
			`- ${describePurpose(focus)}`
		].join('\n');

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
				focusEntityName: focus.focusEntityName,
				workflowBlockId: workflowBlock ? focus.contextType : null,
				briefAppended: Boolean(appendBriefBlock)
			},
			content: [coreContent, ...extraWorkflow].join('\n\n')
		});
	}

	const focusLines = projectDigest
		? [
				`- Project: ${formatNullableLabel(projectDigest.projectName, focus.projectId)}${
					projectDigest.projectState ? ` (${projectDigest.projectState})` : ''
				}`,
				projectDigest.projectDescription
					? `- Project summary: ${projectDigest.projectDescription}`
					: null,
				projectDigest.primaryGoal ? `- Primary goal: ${projectDigest.primaryGoal}` : null,
				projectDigest.activePlan ? `- Active plan: ${projectDigest.activePlan}` : null,
				projectDigest.nextStep ? `- Current next step: ${projectDigest.nextStep}` : null,
				`- Focus entity: ${formatFocusEntity(focus)}`
			].filter(Boolean)
		: [
				`- Context type: ${focus.contextType}`,
				`- Project: ${formatNullableLabel(focus.projectName, focus.projectId)}`,
				`- Focus entity: ${formatFocusEntity(focus)}`
			];

	const coreContent = [
		projectDigest ? 'Current project focus:' : 'Current focus:',
		...focusLines,
		'',
		'Use this seed for:',
		`- ${describePurpose(focus)}`
	].join('\n');

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
			focusEntityName: focus.focusEntityName,
			workflowBlockId: workflowBlock ? focus.contextType : null,
			briefAppended: Boolean(appendBriefBlock)
		},
		content: [coreContent, ...extraWorkflow].join('\n\n')
	});
}

function buildLocationLoadedContextSection(
	focus: LitePromptFocus,
	data: LitePromptInput['data']
): LitePromptSection {
	if (focus.contextType === 'project_create') {
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
				'Project creation scope:',
				'- This chat is in project_create mode before a project exists.',
				'- No existing project graph or focus entity is preloaded by default.',
				'- Use the user message as the source of truth for the new project; fetch schema guidance only if a create field is uncertain.',
				data ? ['', serializeLoadedContext(data)].join('\n') : null
			]
				.filter(Boolean)
				.join('\n')
		});
	}

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
			'Loaded scope:',
			`- ${describeScopeLocation(focus)}`,
			'- The bounded index below is for orientation and exact IDs only; it is not the full cache.',
			'- Fetch full entity details before non-obvious writes or when the user asks for complete lists.',
			'- Product surface and stream turn IDs are captured in dump metadata, not as project facts.',
			'',
			serializeLoadedContext(data)
		].join('\n')
	});
}

function buildTimelineRecentActivitySection(
	timeline: LitePromptTimelineSummary,
	focus: LitePromptFocus,
	projectDigest: LitePromptProjectDigest | null
): LitePromptSection {
	const frameLines = [
		'Timeline frame:',
		`- Current time: ${timeline.generatedAt}`,
		`- Timezone: ${timeline.timezone}`,
		`- Scope: ${timeline.scope}`
	];

	const mode = resolveTimelineRenderMode(focus, timeline, projectDigest);

	const content =
		mode === 'full'
			? [
					...frameLines,
					'',
					'Project status:',
					formatBullets(timeline.statusLines, 'No project status summary was loaded.'),
					'',
					'Overdue or due soon:',
					formatBullets(
						timeline.overdueLines,
						'No overdue or near-term due work is loaded.'
					),
					'',
					'Upcoming dated work:',
					formatBullets(timeline.upcomingLines, 'No upcoming dated work is loaded.'),
					'',
					'Recent project changes:',
					formatBullets(
						timeline.recentChangeLines,
						'No recent project changes are loaded.'
					)
				].join('\n')
			: frameLines.join('\n');

	return makeSection({
		id: 'timeline_recent_activity',
		title: 'Timeline and Recent Activity',
		kind: 'dynamic',
		source: 'lite.timeline_context',
		slots: {
			generatedAt: timeline.generatedAt,
			timezone: timeline.timezone,
			scope: timeline.scope,
			factCount: timeline.facts.length,
			renderMode: mode
		},
		content
	});
}

/**
 * Whether to render the Timeline section at all for this context.
 *
 * Design note: the earlier consolidation forced a `frame_only` render for
 * `project_create` to extend the cacheable prefix. Benchmarking showed the
 * prefix already breaks at `focus_purpose` (position 6) because the per-context
 * workflow block varies, so the frame-only render in project_create costs
 * ~100 tokens without any cache benefit. Revert to skipping the section
 * entirely for project_create, where no project data exists and time-relative
 * queries are rare. Non-project_create contexts still render (full when data
 * is loaded, frame_only fallback otherwise) because "what is today" queries
 * can be useful even without project data.
 */
function shouldRenderTimelineSection(focus: LitePromptFocus): boolean {
	return focus.contextType !== 'project_create';
}

function resolveTimelineRenderMode(
	focus: LitePromptFocus,
	timeline: LitePromptTimelineSummary,
	projectDigest: LitePromptProjectDigest | null
): 'frame_only' | 'full' {
	const hasTimelineSignal =
		timeline.statusLines.length > 0 ||
		timeline.overdueLines.length > 0 ||
		timeline.upcomingLines.length > 0 ||
		timeline.recentChangeLines.length > 0;
	const hasProjectDigestSignal = Boolean(
		projectDigest &&
			(projectDigest.statusLines.length > 0 ||
				projectDigest.priorityTasks.length > 0 ||
				projectDigest.overdueItems.length > 0 ||
				projectDigest.upcomingItems.length > 0 ||
				projectDigest.recentChanges.length > 0)
	);
	return hasTimelineSignal || hasProjectDigestSignal ? 'full' : 'frame_only';
}

function buildOperatingStrategySection(): LitePromptSection {
	// NOTE: all strategy guidance is kept as a single flat bullet list under one
	// heading. Earlier versions used sub-sections ("Communication pattern:",
	// "Entity resolution order:", "How to pick a skill:"), but model replays
	// showed Grok-4.1-fast mirroring those sub-headings verbatim as its own
	// planning doc before the final response. Inline prose avoids the
	// mirror-my-section-headers failure mode.
	return makeSection({
		id: 'operating_strategy',
		title: 'Operating Strategy',
		kind: 'static',
		source: 'lite.strategy',
		content: [
			'How to act:',
			'- Start with the loaded context. If the loaded context is enough, answer without extra tool calls.',
			'- Before any tool call, open the turn with a 1-2 sentence lead-in describing what you are about to do. Lead-ins are intent only; do not claim outcomes until tool results are back.',
			'- Use direct tools first when they fit. Use discovery tools (tool_search, tool_schema) only when the exact operation or schema is missing.',
			"- Load a skill with skill_load only when the workflow is two or more related writes or required fields are uncertain; default to format: short and request include_examples: true only after a prior failure on the same op. Skill choice follows from the capability that matches the user's intent.",
			'- Resolve entity targets in this order: reuse exact IDs from loaded context or prior tool results; search within the current project when project scope is known; search the workspace when project scope is unknown; ask one concise clarification when multiple plausible matches remain.',
			'- Ask one concise clarification only when the missing detail blocks a safe answer or write.',
			'- Treat context zooming as durable state movement. Use change_chat_context early when the latest request should zoom into one resolved project or back out to the workspace. Do not bounce contexts for ambiguous project names, multi-project comparisons, or brief side mentions.',
			'- After a tool call, anchor the next step in what the tool actually returned: what changed, where the runtime is now, and what should happen next.',
			'- Keep scratch reasoning private. Your user-facing response must be direct prose for the user — never a plan, checklist, or paraphrase of these instructions.'
		].join('\n')
	});
}

function buildCapabilitiesSkillsToolsSection(): LitePromptSection {
	const capabilities = listCapabilities('available').map(
		(capability) => `${capability.name}: ${capability.summary}`
	);
	const skillRows = listAllSkills()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((skill) => `| \`${skill.id}\` | ${skill.summary} |`);

	const skillTable =
		skillRows.length > 0
			? ['| Skill ID | Description |', '|---|---|', ...skillRows].join('\n')
			: 'No skills are registered.';

	return makeSection({
		id: 'capabilities_skills_tools',
		title: 'Capabilities, Skills, and Tools',
		kind: 'static',
		source: 'lite.static_capability_skill_catalog',
		content: [
			'Think in three layers. They work together in sequence:',
			'',
			'1. Capability - what BuildOS can do for the user.',
			'2. Skill - workflow guidance for doing that work well. Skill metadata is preloaded in this prompt; call skill_load when the task is multi-step or easy to get wrong and you need the full markdown playbook.',
			'3. Tool / Op - the exact execution surface. The current tool names are listed in Current Tool Surface below.',
			'',
			'Capabilities:',
			formatBullets(capabilities, 'No capabilities are registered.'),
			'',
			'Skill catalog (use `skill_load` to fetch the playbook):',
			'',
			skillTable,
			'',
			'See Operating Strategy for when to call `skill_load`. Tool names live in the tool surface section below.'
		].join('\n')
	});
}

function buildToolSurfaceDynamicSection(toolsSummary: LitePromptToolsSummary): LitePromptSection {
	return makeSection({
		id: 'tool_surface_dynamic',
		title: 'Current Tool Surface',
		kind: 'dynamic',
		source: 'lite.context_tool_surface',
		slots: {
			contextType: toolsSummary.contextType,
			discoveryTools: toolsSummary.discoveryTools,
			directTools: toolsSummary.directTools,
			totalTools: toolsSummary.totalTools
		},
		content: [
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
	if (inventory.focus.contextType === 'project_create') {
		return makeSection({
			id: 'context_inventory_retrieval',
			title: 'Project Creation Boundaries',
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
				'Creation boundaries:',
				'- Use the user idea and project_create mode state as the working context.',
				'- Do not load existing workspace/project data just to begin project creation.',
				'- Prefer the project_creation skill for multi-step creation, then call the direct create tool once the payload is ready.'
			].join('\n')
		});
	}

	const arrayCountLines = Object.entries(dataSummary.arrayCounts).map(
		([key, count]) => `${key}: ${count}`
	);

	return makeSection({
		id: 'context_inventory_retrieval',
		title: 'Loaded Data and Retrieval Boundaries',
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
		// Trimmed 2026-04-17: the old "Structured context loaded:", "Source:",
		// "Empty loaded sets:", plus the full Loaded / Not preloaded / Fetch
		// when needed / Notes lists, were either boilerplate or redundant with
		// rules the agent already has in operating_strategy + safety. Keep the
		// counts line (genuinely useful) and a one-line fetch rule.
		content: [
			`Loaded counts: ${arrayCountLines.length > 0 ? arrayCountLines.join(', ') : 'no top-level arrays loaded'}.`,
			'Fetch an entity directly when it is not already in the loaded counts above and the user asks about it; otherwise answer from loaded context.'
		].join('\n')
	});
}

function buildSafetyDataRulesSection(data: LitePromptInput['data']): LitePromptSection {
	const renderMemberRoleBullet = hasMultiPersonScope(data);
	const lines: string[] = [
		// Anti-echo rule intentionally first so it stays salient at the top of
		// the block. Some providers (notably Grok-4.1-fast) will otherwise restate
		// prompt section headers verbatim as their "plan" before answering.
		'- Never echo prompt section headers ("Safety and Data Rules", "Operating Strategy", "Final-response rules", "Communication pattern", etc.), rule labels, write-ledger labels, or planning commentary in your user-facing response. Write directly to the user in natural prose. If you find yourself about to paraphrase these instructions, answer the user instead.',
		'- Do not claim a tool ran unless the runtime supplied a successful tool result.',
		'- Discovering a tool, loading a schema, reading context, or planning is not completion. Only say an entity was created, updated, moved, merged, archived, deleted, scheduled, or linked after the corresponding write tool succeeded.',
		'- Pre-tool lead-ins are intent only: say what you will attempt, not that it already happened. Do not state the final outcome, success, or persisted update until all tool calls for that turn have completed.',
		'- After tool calls complete, ground the final user-facing summary in the actual tool results: what succeeded, what failed, and what did not change. Do not carry optimistic lead-in language into the outcome.',
		'- If any write fails and no later retry repairs the same target, state what did not persist and keep the partial-success summary precise. When you cannot execute the requested write at all, say "I was unable to <requested action>" and briefly name the blocker so the user knows exactly what did not change.',
		'- Final responses must match the actual write set: mention every successful write that materially matters, and do not claim task progress, document type, tree placement, or linking when the corresponding tool call did not run or did not succeed.',
		'- Task state coverage: when a task has visibly advanced (started, in progress, blocked, or finished), include `state_key` in `update_onto_task` alongside any description change. See the task_management skill for the full playbook.',
		'- Record user-reported inconsistencies (for example "Chapter 1 says 16, Chapter 2 says 17") as open questions or fix tasks. Do not pick a canonical value unless the user stated which one is canonical.',
		'- Do not claim a requested document type, tree placement, link, or cross-link unless the successful tool result confirms the actual type or operation.',
		'- User-visible durable fields (titles, descriptions, document content, project descriptions, props) must contain only final user-visible content. Never let tool-control syntax or argument framing leak into those strings; put control parameters in their own tool arguments, not inside text fields.',
		'- Do not invent project, task, document, calendar, member, or Libri data that is not in loaded context or tool results.',
		'- For writes, use exact IDs from context or tool results. Full UUIDs only; never truncate, abbreviate, or use placeholders like `"..."`, `"REPLACE_ME"`, `"<task_id>"`, `"TBD"`, `"none"`, or `"null"`. If the target is ambiguous, resolve it with a read op or ask one concise question before writing.',
		'- Treat permissions and access as hard constraints.',
		'- Document placement can happen on create via `parent_id` and optional `position`. See the document_workspace skill for placement, hierarchy, reorganization, and append rules.',
		'- Document append/merge writes require non-empty content. merge_instructions alone is not enough.',
		'- When context is incomplete, state the limit and use the narrowest tool that can fill the gap.'
	];

	if (renderMemberRoleBullet) {
		lines.push(
			'- Member-role routing: prefer assigning work to members whose role_name / role_description aligns with the responsibility. Treat role and access as hard constraints. Ask once if multiple members overlap.'
		);
	}

	return makeSection({
		id: 'safety_data_rules',
		title: 'Safety and Data Rules',
		// mostly static invariants, with one conditional bullet (member-role) gated
		// on whether loaded context contains a multi-person project in scope.
		kind: 'mixed',
		source: 'lite.safety',
		slots: {
			memberRoleBulletRendered: renderMemberRoleBullet
		},
		content: lines.join('\n')
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

function buildProjectDigest(
	dataInput: LitePromptInput['data'],
	focus: LitePromptFocus,
	nowIso: string
): LitePromptProjectDigest | null {
	const data = isRecord(dataInput) ? dataInput : null;
	if (!data) return null;

	const directProject = isRecord(data.project) ? data.project : null;
	if (!directProject && !isProjectScoped(focus.contextType)) return null;
	const project = directProject ?? extractProjectRecord(data);

	const now = parseDate(nowIso) ?? new Date();
	const goals = recordsForKey(data, 'goals');
	const milestones = recordsForKey(data, 'milestones');
	const plans = recordsForKey(data, 'plans');
	const tasks = recordsForKey(data, 'tasks');
	const documents = recordsForKey(data, 'documents');
	const events = recordsForKey(data, 'events');
	const primaryGoal = selectPrimaryGoal(goals);
	const activePlan = selectActivePlan(plans);
	const counts = {
		goals: goals.length,
		milestones: milestones.length,
		plans: plans.length,
		tasks: tasks.length,
		documents: documents.length,
		events: events.length,
		openTasks: tasks.filter(isOpenRecord).length,
		completedTasks: tasks.filter(isCompletedRecord).length,
		openMilestones: milestones.filter(isOpenRecord).length
	};
	const datedItems = collectDatedWorkItems(data, now);
	const recentChanges = collectRecentChangeItems(data, now);
	const overdueItems = datedItems
		.filter((item) => item.date && parseDate(item.date) && (parseDate(item.date) as Date) < now)
		.slice(0, 6);
	const futureItems = datedItems
		.filter(
			(item) => item.date && parseDate(item.date) && (parseDate(item.date) as Date) >= now
		)
		.slice(0, 8);
	const dueSoonItems = futureItems.filter((item) => {
		const date = item.date ? parseDate(item.date) : null;
		if (!date) return false;
		return dayDelta(now, date) <= 14;
	});
	const projectName = stringValue(project?.name) ?? focus.projectName;
	const projectState = stringValue(project?.state_key);
	const projectDescription = truncateText(stringValue(project?.description), 280);
	const nextStep = truncateText(stringValue(project?.next_step_short), 220);
	const primaryGoalLine = primaryGoal ? formatDigestEntity(primaryGoal, 'goal') : null;
	const activePlanLine = activePlan ? formatDigestEntity(activePlan, 'plan') : null;
	const priorityTasks = tasks
		.filter(isOpenRecord)
		.sort(comparePriorityWork(now))
		.slice(0, 5)
		.map((task) => formatDigestEntity(task, 'task'));

	const statusLines = [
		projectName
			? `${projectName}${projectState ? ` is ${projectState}` : ''}.`
			: projectState
				? `Project state: ${projectState}.`
				: null,
		projectDescription ? `Project summary: ${projectDescription}` : null,
		primaryGoalLine ? `Primary goal: ${primaryGoalLine}` : null,
		activePlanLine ? `Active plan: ${activePlanLine}` : null,
		nextStep ? `Current next step: ${nextStep}` : null,
		`Loaded work: ${counts.openTasks} open tasks, ${counts.completedTasks} completed tasks, ${counts.openMilestones} open milestones, ${counts.plans} plans, ${counts.documents} documents, ${counts.events} events.`,
		priorityTasks.length > 0
			? `Top open tasks: ${priorityTasks.join('; ')}.`
			: 'No open tasks are loaded.'
	].filter(Boolean) as string[];

	return {
		projectName,
		projectState,
		projectDescription,
		nextStep,
		primaryGoal: primaryGoalLine,
		activePlan: activePlanLine,
		counts,
		priorityTasks,
		overdueItems,
		dueSoonItems,
		upcomingItems: futureItems,
		recentChanges,
		statusLines
	};
}

function buildTimelineSummary(
	input: LitePromptInput,
	focus: LitePromptFocus,
	dataSummary: LitePromptDataSummary,
	projectDigest: LitePromptProjectDigest | null
): LitePromptTimelineSummary {
	const generatedAt = normalizeTime(input.now);
	const timezone = input.timezone ?? DEFAULT_TIMEZONE;
	const facts: string[] = [];
	const data = isRecord(input.data) ? input.data : null;
	const projectIntelligence = extractProjectIntelligence(data);
	const projectIntelligencePrompt = projectIntelligence
		? buildProjectIntelligencePromptSections(projectIntelligence)
		: null;

	if (dataSummary.contextMeta?.generated_at) {
		facts.push(`Context generated at ${String(dataSummary.contextMeta.generated_at)}.`);
	}

	if (projectIntelligence) {
		facts.push(
			`Project intelligence loaded: ${projectIntelligence.counts.overdue_total} overdue, ${projectIntelligence.counts.due_soon_total} due soon, ${projectIntelligence.counts.upcoming_total} upcoming, ${projectIntelligence.counts.recent_change_total} recent changes.`
		);
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
		facts,
		statusLines: projectIntelligencePrompt
			? projectIntelligencePrompt.statusLines
			: projectDigest?.statusLines.length
				? projectDigest.statusLines
				: facts.slice(0, 4),
		overdueLines: projectIntelligencePrompt
			? projectIntelligencePrompt.overdueLines
			: buildOverdueDueSoonLines(projectDigest),
		upcomingLines: projectIntelligencePrompt
			? projectIntelligencePrompt.upcomingLines
			: formatTimelineItems(projectDigest?.upcomingItems ?? []),
		recentChangeLines: projectIntelligencePrompt
			? projectIntelligencePrompt.recentChangeLines
			: formatTimelineItems(
					projectDigest?.recentChanges.length
						? projectDigest.recentChanges
						: collectNestedRecentActivityItems(data, generatedAt)
				)
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
				loaded: ['project_create mode before a project exists'],
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

export function serializeLoadedContext(data: LitePromptInput['data']): string {
	if (!data) {
		return 'Loaded context index: no structured context payload was loaded for this seed.';
	}

	if (typeof data === 'string') {
		const trimmed = data.trim();
		return trimmed
			? [
					'Loaded context text excerpt:',
					'```text',
					truncateText(trimmed, LOADED_CONTEXT_TEXT_MAX_CHARS),
					'```'
				].join('\n')
			: 'Loaded context index: empty text payload.';
	}

	if (!isRecord(data)) {
		return 'Loaded context index: non-object context payload omitted from the seed prompt.';
	}

	return [
		'Actionable loaded context index (bounded):',
		'```json',
		JSON.stringify(buildActionableLoadedContextIndex(data)),
		'```'
	].join('\n');
}

function buildActionableLoadedContextIndex(data: Record<string, unknown>): Record<string, unknown> {
	const contextMeta = isRecord(data.context_meta) ? data.context_meta : null;
	const intelligence = extractProjectIntelligence(data);
	const projectRefs = collectProjectRefs(data);
	const entityRefs = collectLoadedEntityRefs(data);
	const linkedEntityRefs = collectLinkedEntityRefs(data);

	return dropNullish({
		context_meta: contextMeta ? summarizeContextMeta(contextMeta) : null,
		loaded_counts: summarizeLoadedCounts(data),
		project_refs: intelligence ? null : projectRefs.slice(0, LOADED_CONTEXT_PROJECT_REF_LIMIT),
		project_refs_omitted:
			!intelligence && projectRefs.length > LOADED_CONTEXT_PROJECT_REF_LIMIT
				? projectRefs.length - LOADED_CONTEXT_PROJECT_REF_LIMIT
				: 0,
		project_intelligence: intelligence ? summarizeProjectIntelligenceIndex(intelligence) : null,
		entity_refs: Object.keys(entityRefs).length > 0 ? entityRefs : null,
		linked_entity_refs: Object.keys(linkedEntityRefs).length > 0 ? linkedEntityRefs : null,
		focus_entity: summarizeFocusEntityIndex(data),
		retrieval_note:
			'Full cached context is intentionally not pasted. Use direct overview/search tools for complete lists, full entity fields, document bodies, or stale backlog details.'
	});
}

function summarizeContextMeta(contextMeta: Record<string, unknown>): Record<string, unknown> {
	const allowedKeys = [
		'source',
		'generated_at',
		'cache_age_seconds',
		'project_count',
		'projects_returned',
		'project_limit',
		'includes_doc_structure'
	];
	const summary: Record<string, unknown> = {};
	for (const key of allowedKeys) {
		if (contextMeta[key] !== undefined && contextMeta[key] !== null) {
			summary[key] = contextMeta[key];
		}
	}
	return summary;
}

function summarizeLoadedCounts(data: Record<string, unknown>): Record<string, unknown> {
	const topLevelArrays: Record<string, number> = {};
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) topLevelArrays[key] = value.length;
	}

	const projects = Array.isArray(data.projects) ? data.projects.filter(isRecord) : [];
	const nestedProjectArrays: Record<string, number> = {};
	for (const bundle of projects) {
		for (const key of ['goals', 'milestones', 'plans', 'recent_activity']) {
			const value = bundle[key];
			if (Array.isArray(value)) {
				nestedProjectArrays[key] = (nestedProjectArrays[key] ?? 0) + value.length;
			}
		}
	}

	return dropNullish({
		top_level_arrays: Object.keys(topLevelArrays).length > 0 ? topLevelArrays : null,
		project_bundle_arrays:
			Object.keys(nestedProjectArrays).length > 0 ? nestedProjectArrays : null
	});
}

function collectProjectRefs(data: Record<string, unknown>): Array<Record<string, unknown>> {
	const refs = new Map<string, Record<string, unknown>>();
	const addRef = (
		project: Record<string, unknown> | null,
		bundle?: Record<string, unknown>
	): void => {
		if (!project) return;
		const id = stringValue(project.id);
		if (!id || refs.has(id)) return;
		refs.set(
			id,
			dropNullish({
				id,
				name: stringValue(project.name),
				state_key: stringValue(project.state_key),
				next_step_short: truncateText(stringValue(project.next_step_short), 160),
				updated_at: stringValue(project.updated_at),
				loaded_counts: bundle ? summarizeBundleCounts(bundle) : undefined
			})
		);
	};

	addRef(isRecord(data.project) ? data.project : null);
	if (Array.isArray(data.projects)) {
		for (const bundle of data.projects) {
			if (!isRecord(bundle)) continue;
			addRef(isRecord(bundle.project) ? bundle.project : null, bundle);
		}
	}

	return Array.from(refs.values());
}

function summarizeBundleCounts(
	bundle: Record<string, unknown>
): Record<string, number> | undefined {
	const counts: Record<string, number> = {};
	for (const key of ['goals', 'milestones', 'plans', 'recent_activity']) {
		const value = bundle[key];
		if (Array.isArray(value) && value.length > 0) counts[key] = value.length;
	}
	return Object.keys(counts).length > 0 ? counts : undefined;
}

function summarizeProjectIntelligenceIndex(
	intelligence: FastChatProjectIntelligence
): Record<string, unknown> {
	return dropNullish({
		generated_at: intelligence.generated_at,
		scope: intelligence.scope,
		project_id: intelligence.project_id,
		project_name: intelligence.project_name,
		counts: dropNullish(intelligence.counts as unknown as Record<string, unknown>),
		more_available: summarizeTrueFlags(intelligence.maybe_more),
		attention_projects: intelligence.project_summaries
			.slice(0, LOADED_CONTEXT_PROJECT_REF_LIMIT)
			.map((summary) =>
				dropNullish({
					project_id: summary.project_id,
					project_name: summary.project_name,
					state_key: summary.state_key,
					next_step_short: truncateText(summary.next_step_short, 120),
					counts: summary.counts
				})
			),
		selected_refs: {
			overdue_or_due_soon: selectPromptAttentionSignals(intelligence.overdue_or_due_soon)
				.slice(0, LOADED_CONTEXT_SIGNAL_REF_LIMIT)
				.map(summarizeWorkSignalRef),
			upcoming_work: selectPromptUpcomingSignals(intelligence.upcoming_work)
				.slice(0, LOADED_CONTEXT_SIGNAL_REF_LIMIT)
				.map(summarizeWorkSignalRef),
			recent_changes: dedupeRecentChanges(intelligence.recent_changes)
				.slice(0, LOADED_CONTEXT_RECENT_REF_LIMIT)
				.map(summarizeRecentChangeRef)
		}
	});
}

function collectLoadedEntityRefs(
	data: Record<string, unknown>
): Record<string, Array<Record<string, unknown>>> {
	const refs: Record<string, Array<Record<string, unknown>>> = {};
	for (const key of ['goals', 'milestones', 'plans', 'tasks', 'documents', 'events', 'members']) {
		const records = recordsForKey(data, key)
			.slice(0, LOADED_CONTEXT_ENTITY_REF_LIMIT)
			.map((record) => summarizeEntityRef(record, key));
		if (records.length > 0) refs[key] = records;
	}
	return refs;
}

function collectLinkedEntityRefs(
	data: Record<string, unknown>
): Record<string, Array<Record<string, unknown>>> {
	const linked = isRecord(data.linked_entities) ? data.linked_entities : null;
	if (!linked) return {};
	const refs: Record<string, Array<Record<string, unknown>>> = {};
	for (const [key, value] of Object.entries(linked)) {
		if (!Array.isArray(value)) continue;
		const records = value
			.filter(isRecord)
			.slice(0, LOADED_CONTEXT_ENTITY_REF_LIMIT)
			.map((record) => summarizeEntityRef(record, key));
		if (records.length > 0) refs[key] = records;
	}
	return refs;
}

function summarizeFocusEntityIndex(data: Record<string, unknown>): Record<string, unknown> | null {
	const focusType = stringValue(data.focus_entity_type);
	const focusId = stringValue(data.focus_entity_id);
	const focusFull = isRecord(data.focus_entity_full) ? data.focus_entity_full : null;
	if (!focusType && !focusId && !focusFull) return null;
	return dropNullish({
		type: focusType,
		id: focusId ?? stringValue(focusFull?.id),
		title: focusFull ? titleForRecord(focusFull, focusType ?? 'focus entity') : null,
		state_key: focusFull ? stringValue(focusFull.state_key) : null
	});
}

function summarizeEntityRef(
	record: Record<string, unknown>,
	kindFallback: string
): Record<string, unknown> {
	const date =
		stringValue(record.due_at) ??
		stringValue(record.target_date) ??
		stringValue(record.start_at) ??
		stringValue(record.updated_at) ??
		stringValue(record.created_at);
	return dropNullish({
		id: stringValue(record.id) ?? stringValue(record.entity_id),
		project_id: stringValue(record.project_id),
		title: truncateText(titleForRecord(record, kindFallback), 160),
		state_key: stringValue(record.state_key),
		date,
		priority: numberValue(record.priority),
		in_doc_structure:
			typeof record.in_doc_structure === 'boolean' ? record.in_doc_structure : undefined,
		is_unlinked: typeof record.is_unlinked === 'boolean' ? record.is_unlinked : undefined
	});
}

function summarizeWorkSignalRef(signal: FastChatWorkSignal): Record<string, unknown> {
	return dropNullish({
		id: signal.id,
		kind: signal.kind,
		project_id: signal.project_id,
		project_name: signal.project_name,
		title: truncateText(signal.title, 120),
		state_key: signal.state_key,
		date: signal.date,
		bucket: signal.bucket,
		days_delta: signal.days_delta,
		priority: signal.priority
	});
}

function summarizeRecentChangeRef(change: FastChatRecentChange): Record<string, unknown> {
	return dropNullish({
		id: change.id,
		kind: change.kind,
		project_id: change.project_id,
		project_name: change.project_name,
		title: truncateText(change.title, 120),
		action: change.action,
		changed_at: change.changed_at
	});
}

function renderSystemPrompt(sections: LitePromptSection[]): string {
	return [
		'# BuildOS Lite Agentic Chat Prompt',
		'',
		`Prompt variant: ${LITE_PROMPT_VARIANT}`,
		'',
		VISIBLE_ASSISTANT_CONTENT_CONTRACT,
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

/**
 * Detect whether the loaded data exposes a project with more than one member in scope.
 * Today only project / ontology contexts load `members` in the seed payload
 * (see context-loader.ts project branch). Global / brief contexts do not expose
 * per-project member counts today; spec §9.6 tracks the loader change that
 * unblocks multi-context detection without touching the prompt.
 */
function hasMultiPersonScope(data: LitePromptInput['data']): boolean {
	if (!isRecord(data)) return false;
	const members = data.members;
	if (!Array.isArray(members)) return false;
	const actorIds = new Set<string>();
	for (const entry of members) {
		if (!isRecord(entry)) continue;
		const actorId = stringValue(entry.actor_id) ?? stringValue(entry.id);
		if (actorId) actorIds.add(actorId);
	}
	return actorIds.size > 1;
}

/**
 * Detect whether daily-brief guardrails should render in focus_purpose for a
 * non-brief context. Mirrors the check from the legacy master-prompt-builder.
 */
function shouldApplyDailyBriefGuardrails(data: LitePromptInput['data']): boolean {
	if (!isRecord(data)) return false;
	return (
		'briefId' in data ||
		'brief_id' in data ||
		'briefDate' in data ||
		'brief_date' in data ||
		'mentionedEntities' in data ||
		'mentioned_entities' in data
	);
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

export function extractProjectIntelligence(
	data: Record<string, unknown> | null
): FastChatProjectIntelligence | null {
	if (!data || !isRecord(data.project_intelligence)) return null;
	const intelligence = data.project_intelligence as unknown as FastChatProjectIntelligence;
	if (!intelligence.generated_at || !intelligence.counts) return null;
	if (!Array.isArray(intelligence.overdue_or_due_soon)) return null;
	if (!Array.isArray(intelligence.upcoming_work)) return null;
	if (!Array.isArray(intelligence.recent_changes)) return null;
	if (!Array.isArray(intelligence.project_summaries)) return null;
	if (!isRecord(intelligence.maybe_more)) return null;
	return intelligence;
}

function buildProjectIntelligenceStatusLines(intelligence: FastChatProjectIntelligence): string[] {
	const lines = [
		`Loaded project intelligence: ${intelligence.counts.overdue_total} overdue, ${intelligence.counts.due_soon_total} due soon, ${intelligence.counts.upcoming_total} upcoming, ${intelligence.counts.recent_change_total} recent changes.`,
		intelligence.scope === 'global' &&
		typeof intelligence.counts.accessible_projects === 'number'
			? `Workspace scope: ${intelligence.counts.accessible_projects} accessible projects considered.`
			: intelligence.project_name
				? `Project scope: ${intelligence.project_name}.`
				: null
	].filter(Boolean) as string[];

	for (const summary of intelligence.project_summaries.slice(0, 6)) {
		const countParts = [
			summary.counts.overdue > 0 ? `${summary.counts.overdue} overdue` : null,
			summary.counts.due_soon > 0 ? `${summary.counts.due_soon} due soon` : null,
			summary.counts.upcoming > 0 ? `${summary.counts.upcoming} upcoming` : null,
			summary.counts.recent_changes > 0
				? `${summary.counts.recent_changes} recent changes`
				: null
		].filter(Boolean);
		const counts = countParts.length > 0 ? countParts.join(', ') : 'no active signals loaded';
		const nextStep = summary.next_step_short ? ` Next step: ${summary.next_step_short}` : '';
		lines.push(`${summary.project_name}: ${counts}.${nextStep}`);
	}

	if (intelligence.maybe_more.project_summaries) {
		lines.push('More project summaries exist than fit in the seed snapshot.');
	}

	return lines;
}

export function buildProjectIntelligencePromptSections(
	intelligence: FastChatProjectIntelligence
): Pick<
	LitePromptTimelineSummary,
	'statusLines' | 'overdueLines' | 'upcomingLines' | 'recentChangeLines'
> {
	return {
		statusLines: buildProjectIntelligenceStatusLines(intelligence),
		overdueLines: formatAttentionWorkLines(intelligence),
		upcomingLines: formatWorkSignalLines(
			selectPromptUpcomingSignals(intelligence.upcoming_work),
			{ includeBucket: false }
		),
		recentChangeLines: formatRecentChangeLines(
			dedupeRecentChanges(intelligence.recent_changes).slice(0, PROMPT_RECENT_CHANGE_LIMIT)
		)
	};
}

function formatAttentionWorkLines(intelligence: FastChatProjectIntelligence): string[] {
	const selected = selectPromptAttentionSignals(intelligence.overdue_or_due_soon);
	const lines = formatWorkSignalLines(selected);
	const badDateCount = intelligence.overdue_or_due_soon.filter(isBadPromptDateSignal).length;
	const staleOverdueCount = intelligence.overdue_or_due_soon.filter(
		(signal) =>
			!isBadPromptDateSignal(signal) &&
			signal.bucket === 'overdue' &&
			signal.days_delta < -PROMPT_STALE_OVERDUE_DAYS
	).length;
	const hiddenCount = Math.max(
		intelligence.counts.overdue_total + intelligence.counts.due_soon_total - selected.length,
		0
	);

	if (staleOverdueCount > 0 || badDateCount > 0 || hiddenCount > 0) {
		const notes = [
			hiddenCount > 0 ? `${hiddenCount} additional overdue/due-soon items not listed` : null,
			staleOverdueCount > 0 ? `${staleOverdueCount} stale overdue items suppressed` : null,
			badDateCount > 0 ? `${badDateCount} invalid-date items suppressed` : null
		].filter(Boolean);
		lines.push(
			`Backlog note: ${notes.join('; ')}. Use get_workspace_overview or get_project_overview for the full backlog.`
		);
	}

	return lines;
}

function selectPromptAttentionSignals(signals: FastChatWorkSignal[]): FastChatWorkSignal[] {
	const valid = signals.filter((signal) => !isBadPromptDateSignal(signal));
	const dueSoon = valid
		.filter((signal) => signal.bucket === 'due_soon')
		.slice(0, PROMPT_DUE_SOON_SIGNAL_LIMIT);
	const recentOverdue = valid
		.filter(
			(signal) =>
				signal.bucket === 'overdue' && signal.days_delta >= -PROMPT_RECENT_OVERDUE_DAYS
		)
		.slice(0, PROMPT_OVERDUE_SIGNAL_LIMIT);

	if (dueSoon.length + recentOverdue.length > 0) {
		return [...dueSoon, ...recentOverdue];
	}

	return [];
}

function selectPromptUpcomingSignals(signals: FastChatWorkSignal[]): FastChatWorkSignal[] {
	return signals
		.filter((signal) => !isBadPromptDateSignal(signal))
		.slice(0, PROMPT_UPCOMING_SIGNAL_LIMIT);
}

function isBadPromptDateSignal(signal: FastChatWorkSignal): boolean {
	const date = parseDate(signal.date);
	if (!date) return true;
	const year = date.getUTCFullYear();
	return year < 2020 || year > 2100;
}

function dedupeRecentChanges(changes: FastChatRecentChange[]): FastChatRecentChange[] {
	const seen = new Set<string>();
	const deduped: FastChatRecentChange[] = [];
	for (const change of changes) {
		const key = [
			change.kind,
			change.id,
			change.project_id,
			change.action,
			change.title ?? ''
		].join(':');
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(change);
	}
	return deduped;
}

function summarizeTrueFlags(
	flags: FastChatProjectIntelligence['maybe_more']
): Record<string, boolean> | null {
	const enabled = Object.fromEntries(Object.entries(flags).filter(([, value]) => value));
	return Object.keys(enabled).length > 0 ? enabled : null;
}

function formatSignalRelative(daysDelta: number): string {
	if (daysDelta === 0) return 'today';
	if (daysDelta === 1) return 'tomorrow';
	if (daysDelta === -1) return 'yesterday';
	if (daysDelta > 1) return `in ${daysDelta} days`;
	return `${Math.abs(daysDelta)} days ago`;
}

function formatWorkSignalLines(
	signals: FastChatWorkSignal[],
	options: { includeBucket?: boolean } = {}
): string[] {
	const includeBucket = options.includeBucket ?? true;
	return signals.map((signal) => {
		const date = parseDate(signal.date);
		const dateText = date ? formatDate(date) : signal.date;
		const bucketLabel =
			signal.bucket === 'overdue'
				? 'Overdue'
				: signal.bucket === 'due_soon'
					? 'Due soon'
					: 'Upcoming';
		const project = signal.project_name ? ` in ${signal.project_name}` : '';
		const idLabel = `${signal.kind}_id`;
		const details = [
			includeBucket ? bucketLabel.toLowerCase() : null,
			signal.state_key,
			formatSignalRelative(signal.days_delta)
		].filter(Boolean);
		return `${dateText}: ${signal.kind} (${idLabel}: ${signal.id}) "${signal.title}"${project}${details.length > 0 ? `, ${details.join(', ')}` : ''}.`;
	});
}

function formatRecentChangeLines(changes: FastChatRecentChange[]): string[] {
	return changes.map((change) => {
		const date = parseDate(change.changed_at);
		const dateText = date ? formatDate(date) : change.changed_at;
		const title = change.title ? `"${change.title}"` : change.kind;
		const project = change.project_name ? ` in ${change.project_name}` : '';
		const idLabel = `${change.kind}_id`;
		return `${dateText}: ${change.kind} (${idLabel}: ${change.id}) ${title} ${change.action}${project}.`;
	});
}

function collectNestedRecentActivityItems(
	data: Record<string, unknown> | null,
	nowIso: string
): LitePromptTimelineItem[] {
	if (!data || !Array.isArray(data.projects)) return [];
	const now = parseDate(nowIso) ?? new Date();
	const items: LitePromptTimelineItem[] = [];

	for (const bundle of data.projects) {
		if (!isRecord(bundle) || !Array.isArray(bundle.recent_activity)) continue;
		const project = isRecord(bundle.project) ? bundle.project : null;
		const projectName = stringValue(project?.name);
		for (const activity of bundle.recent_activity) {
			if (!isRecord(activity)) continue;
			const date = parseDate(activity.updated_at ?? activity.created_at);
			if (!date) continue;
			const title = truncateText(titleForRecord(activity, 'activity'), 160) ?? 'activity';
			items.push({
				kind: stringValue(activity.entity_type) ?? 'activity',
				id: stringValue(activity.entity_id) ?? stringValue(activity.id),
				title: projectName ? `${title} (${projectName})` : title,
				state: stringValue(activity.action),
				date: date.toISOString(),
				relative: describeRelativeDate(now, date)
			});
		}
	}

	return items
		.sort((left, right) => {
			const leftDate = parseDate(left.date)?.getTime() ?? 0;
			const rightDate = parseDate(right.date)?.getTime() ?? 0;
			return rightDate - leftDate;
		})
		.slice(0, 8);
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

function extractProjectRecord(data: Record<string, unknown>): Record<string, unknown> | null {
	if (isRecord(data.project)) return data.project;
	const projects = data.projects;
	if (!Array.isArray(projects)) return null;
	for (const projectBundle of projects) {
		if (!isRecord(projectBundle)) continue;
		if (isRecord(projectBundle.project)) return projectBundle.project;
	}
	return null;
}

function recordsForKey(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
	const value = data[key];
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function parseDate(value: unknown): Date | null {
	const text = stringValue(value);
	if (!text) return null;
	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isCompletedRecord(record: Record<string, unknown>): boolean {
	if (record.completed_at) return true;
	const state = stringValue(record.state_key)?.toLowerCase() ?? '';
	return ['done', 'complete', 'completed', 'closed', 'archived', 'cancelled'].includes(state);
}

function isOpenRecord(record: Record<string, unknown>): boolean {
	return !isCompletedRecord(record);
}

function titleForRecord(record: Record<string, unknown>, fallback: string): string {
	return (
		stringValue(record.title) ??
		stringValue(record.name) ??
		stringValue(record.summary) ??
		stringValue(record.id) ??
		fallback
	);
}

function selectPrimaryGoal(goals: Record<string, unknown>[]): Record<string, unknown> | null {
	return goals.find(isOpenRecord) ?? goals[0] ?? null;
}

function selectActivePlan(plans: Record<string, unknown>[]): Record<string, unknown> | null {
	return (
		plans.find((plan) =>
			['active', 'in_progress'].includes(stringValue(plan.state_key) ?? '')
		) ??
		plans.find(isOpenRecord) ??
		plans[0] ??
		null
	);
}

function comparePriorityWork(now: Date) {
	return (left: Record<string, unknown>, right: Record<string, unknown>): number => {
		const leftPriority = numberValue(left.priority) ?? -1;
		const rightPriority = numberValue(right.priority) ?? -1;
		if (leftPriority !== rightPriority) return rightPriority - leftPriority;
		const leftDue = parseDate(left.due_at);
		const rightDue = parseDate(right.due_at);
		if (leftDue && rightDue && leftDue.getTime() !== rightDue.getTime()) {
			return (
				Math.abs(leftDue.getTime() - now.getTime()) -
				Math.abs(rightDue.getTime() - now.getTime())
			);
		}
		if (leftDue && !rightDue) return -1;
		if (!leftDue && rightDue) return 1;
		return (stringValue(right.updated_at) ?? '').localeCompare(
			stringValue(left.updated_at) ?? ''
		);
	};
}

function formatDigestEntity(record: Record<string, unknown>, kind: string): string {
	const title = truncateText(titleForRecord(record, kind), 140) ?? kind;
	const state = stringValue(record.state_key);
	const dueDate = parseDate(
		record.due_at ?? record.target_date ?? record.end_at ?? record.start_at
	);
	const due = dueDate ? `, dated ${formatDate(dueDate)}` : '';
	const priority = numberValue(record.priority);
	const priorityText = priority !== null ? `, priority ${priority}` : '';
	const details = state
		? [state, priorityText.replace(/^, /, ''), due.replace(/^, /, '')]
		: [priorityText.replace(/^, /, ''), due.replace(/^, /, '')];
	const detailText = details.filter(Boolean).join(', ');
	return `"${title}"${detailText ? ` (${detailText})` : ''}`;
}

function collectDatedWorkItems(data: Record<string, unknown>, now: Date): LitePromptTimelineItem[] {
	const specs: Array<[string, string, string[]]> = [
		['goal', 'goals', ['target_date']],
		['milestone', 'milestones', ['due_at']],
		['task', 'tasks', ['due_at', 'start_at']],
		['event', 'events', ['start_at', 'end_at']],
		['project', 'project', ['end_at', 'start_at']]
	];
	const items: LitePromptTimelineItem[] = [];

	for (const [kind, key, dateKeys] of specs) {
		const records =
			key === 'project' && isRecord(data.project) ? [data.project] : recordsForKey(data, key);
		for (const record of records) {
			if (!isOpenRecord(record)) continue;
			const dateValue = dateKeys
				.map((dateKey) => record[dateKey])
				.find((value) => parseDate(value));
			const date = parseDate(dateValue);
			if (!date) continue;
			items.push({
				kind,
				id: stringValue(record.id),
				title: truncateText(titleForRecord(record, kind), 160) ?? kind,
				state: stringValue(record.state_key),
				date: date.toISOString(),
				relative: describeRelativeDate(now, date)
			});
		}
	}

	return items.sort((left, right) => {
		const leftDate = parseDate(left.date)?.getTime() ?? 0;
		const rightDate = parseDate(right.date)?.getTime() ?? 0;
		return leftDate - rightDate;
	});
}

function collectRecentChangeItems(
	data: Record<string, unknown>,
	now: Date
): LitePromptTimelineItem[] {
	const items: LitePromptTimelineItem[] = [];
	const specs: Array<[string, string]> = [
		['goal', 'goals'],
		['milestone', 'milestones'],
		['plan', 'plans'],
		['task', 'tasks'],
		['document', 'documents'],
		['event', 'events']
	];

	for (const [kind, key] of specs) {
		for (const record of recordsForKey(data, key)) {
			const date = parseDate(record.updated_at ?? record.created_at);
			if (!date) continue;
			items.push({
				kind,
				id: stringValue(record.id),
				title: truncateText(titleForRecord(record, kind), 160) ?? kind,
				state: stringValue(record.state_key),
				date: date.toISOString(),
				relative: describeRelativeDate(now, date)
			});
		}
	}

	for (const activity of recordsForKey(data, 'recent_activity')) {
		const date = parseDate(activity.updated_at ?? activity.created_at);
		if (!date) continue;
		items.push({
			kind: stringValue(activity.entity_type) ?? 'activity',
			id: stringValue(activity.entity_id) ?? stringValue(activity.id),
			title: truncateText(titleForRecord(activity, 'activity'), 160) ?? 'activity',
			state: stringValue(activity.action),
			date: date.toISOString(),
			relative: describeRelativeDate(now, date)
		});
	}

	return items
		.sort((left, right) => {
			const leftDate = parseDate(left.date)?.getTime() ?? 0;
			const rightDate = parseDate(right.date)?.getTime() ?? 0;
			return rightDate - leftDate;
		})
		.slice(0, 8);
}

function buildOverdueDueSoonLines(projectDigest: LitePromptProjectDigest | null): string[] {
	if (!projectDigest) return [];
	const lines: string[] = [];
	if (projectDigest.overdueItems.length > 0) {
		lines.push(
			...formatTimelineItems(projectDigest.overdueItems).map((line) => `Overdue: ${line}`)
		);
	} else {
		lines.push('No overdue tasks, milestones, goals, or events are loaded.');
	}

	if (projectDigest.dueSoonItems.length > 0) {
		lines.push(
			...formatTimelineItems(projectDigest.dueSoonItems).map((line) => `Due soon: ${line}`)
		);
	} else {
		lines.push('No loaded tasks, milestones, goals, or events are due in the next 14 days.');
	}

	const nextUpcoming = projectDigest.upcomingItems[0];
	if (nextUpcoming && projectDigest.dueSoonItems.length === 0) {
		lines.push(`Next scheduled item: ${formatTimelineItem(nextUpcoming)}.`);
	}

	return lines;
}

function formatTimelineItems(items: LitePromptTimelineItem[]): string[] {
	return items.map((item) => `${formatTimelineItem(item)}.`);
}

function formatTimelineItem(item: LitePromptTimelineItem): string {
	const date = item.date ? parseDate(item.date) : null;
	const dateText = date ? formatDate(date) : 'no date';
	const state = item.state ? `, ${item.state}` : '';
	const relative = item.relative ? `, ${item.relative}` : '';
	return `${dateText}: ${item.kind} "${item.title}"${state}${relative}`;
}

function dayDelta(left: Date, right: Date): number {
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.ceil((startOfUtcDay(right).getTime() - startOfUtcDay(left).getTime()) / msPerDay);
}

function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function describeRelativeDate(now: Date, date: Date): string {
	const delta = dayDelta(now, date);
	if (delta === 0) return 'today';
	if (delta === 1) return 'tomorrow';
	if (delta === -1) return 'yesterday';
	if (delta > 1) return `in ${delta} days`;
	return `${Math.abs(delta)} days ago`;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function truncateText(value: string | null, maxChars = 240): string | null {
	if (!value) return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
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

function formatBullets(items: string[], fallback: string): string {
	if (items.length === 0) return `- ${fallback}`;
	return items.map((item) => `- ${item}`).join('\n');
}

function mergeList(defaults: string[], overrides?: string[] | null): string[] {
	return Array.from(new Set([...defaults, ...(overrides ?? [])].filter(Boolean)));
}

function dropNullish(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== null && value !== undefined)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
