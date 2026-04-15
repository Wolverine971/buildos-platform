// apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts
export type CapabilityStatus = 'available' | 'planned';

export interface CapabilityDefinition {
	id: string;
	path: `capabilities.${string}`;
	name: string;
	status: CapabilityStatus;
	summary: string;
	whatYouCanDo: string[];
	skillIds: string[];
	directPaths: string[];
	notes?: string[];
}

export interface CapabilityHelpPayload {
	type: 'capability';
	path: string;
	id: string;
	name: string;
	status: CapabilityStatus;
	summary: string;
	what_you_can_do: string[];
	skill_entrypoints: string[];
	direct_paths: string[];
	notes?: string[];
}

type CapabilityDirectoryItem = {
	name: string;
	type: 'capability';
	summary: string;
};

const ALL_CAPABILITIES: CapabilityDefinition[] = [
	{
		id: 'overview',
		path: 'capabilities.overview',
		name: 'Workspace and project overviews',
		status: 'available',
		summary:
			'Get BuildOS-native status snapshots for the whole workspace or one project without assembling generic ontology reads by hand.',
		whatYouCanDo: [
			'Summarize what is happening across accessible projects',
			'Check what is blocked, overdue, or due soon',
			'Get a concise named-project snapshot with recent activity and upcoming events'
		],
		skillIds: [],
		directPaths: ['util.workspace.overview', 'util.project.overview'],
		notes: [
			'Use this first for routine status questions like "what is happening with my projects?" or "what is going on with 9takes?" before generic search/list/project-graph discovery.'
		]
	},
	{
		id: 'project_creation',
		path: 'capabilities.project_creation',
		name: 'Project creation',
		status: 'available',
		summary:
			'Turn a user idea into the smallest valid BuildOS project payload with inferred name, type, props, and only the initial structure the user actually described.',
		whatYouCanDo: [
			'Create a new project from a short brief or rough idea',
			'Infer project name, type_key, and initial props from the user message',
			'Start minimal and include only explicit goals, tasks, plans, or milestones when warranted'
		],
		skillIds: ['project_creation'],
		directPaths: ['onto.project.create'],
		notes: [
			'In project_create context, prefer this capability first. The create payload must include project, entities, and relationships, even when the entity arrays are empty.'
		]
	},
	{
		id: 'project_graph',
		path: 'capabilities.project_graph',
		name: 'Project graph management',
		status: 'available',
		summary:
			'Inspect and update projects, goals, milestones, risks, and relationships across the BuildOS graph.',
		whatYouCanDo: [
			'Create, search, update, and delete core ontology graph entities',
			'Inspect project graphs and linked relationships',
			'Search across a project or across the portfolio'
		],
		skillIds: [],
		directPaths: [
			'x.search.all_projects',
			'x.search.project',
			'onto.project',
			'onto.goal',
			'onto.milestone',
			'onto.risk',
			'onto.edge',
			'onto.project.graph'
		],
		notes: [
			'There is not yet a single umbrella graph skill. Use targeted entity help unless the work is clearly task-, planning-, or document-specific.'
		]
	},
	{
		id: 'planning',
		path: 'capabilities.planning',
		name: 'Planning and task structuring',
		status: 'available',
		summary:
			'Turn outcomes into plans and tasks, refine existing plans, and connect execution to goals, milestones, and documents.',
		whatYouCanDo: [
			'Create a plan from a goal or milestone',
			'Capture and manage tasks for future work',
			'Break a plan into tasks and keep them aligned',
			'Refine stale plans and reconnect execution details'
		],
		skillIds: ['task_management', 'plan_management'],
		directPaths: ['onto.plan', 'onto.task', 'onto.goal', 'onto.milestone', 'onto.edge']
	},
	{
		id: 'documents',
		path: 'capabilities.documents',
		name: 'Document workspace management',
		status: 'available',
		summary:
			'Create, update, place, and reorganize project documents and task workspace docs without breaking hierarchy rules.',
		whatYouCanDo: [
			'Create or update project documents',
			'Reorganize the document tree and link unlinked docs',
			'Attach documentation to task workspaces'
		],
		skillIds: ['document_workspace'],
		directPaths: ['onto.document', 'onto.document.tree', 'onto.document.path', 'onto.task.docs']
	},
	{
		id: 'calendar',
		path: 'capabilities.calendar',
		name: 'Calendar management',
		status: 'available',
		summary:
			'Check the calendar, create or reschedule events, cancel events, and manage project calendar mapping.',
		whatYouCanDo: [
			'Read calendar events within an exact time window',
			'Create, update, and delete events',
			'Inspect or set project calendar mappings'
		],
		skillIds: ['calendar_management'],
		directPaths: ['cal.event', 'cal.project']
	},
	{
		id: 'people_context',
		path: 'capabilities.people_context',
		name: 'People and profile context',
		status: 'available',
		summary:
			'Use user profile context and contact records when personalization or relationship context matters.',
		whatYouCanDo: [
			'Read user profile context for personalization',
			'Search or update contacts',
			'Resolve contact candidates and link known people'
		],
		skillIds: ['people_context'],
		directPaths: ['util.profile', 'util.contact'],
		notes: [
			'Use util.people.skill when contact resolution, privacy handling, or linking judgment matters.'
		]
	},
	{
		id: 'project_audit',
		path: 'capabilities.project_audit',
		name: 'Project audit',
		status: 'available',
		summary:
			'Review project health, structure, blockers, stale work, and missing coverage from project context.',
		whatYouCanDo: [
			'Audit project structure and execution health',
			'Identify blockers, stale work, or missing planning layers',
			'Recommend next cleanup or correction actions'
		],
		skillIds: ['project_audit'],
		directPaths: [
			'onto.project.graph',
			'onto.task',
			'onto.plan',
			'onto.goal',
			'onto.milestone',
			'onto.risk',
			'onto.document.tree',
			'cal.event'
		]
	},
	{
		id: 'project_forecast',
		path: 'capabilities.project_forecast',
		name: 'Project forecast',
		status: 'available',
		summary:
			'Establish likely schedule outcomes, slippage risk, and the strongest drivers of project uncertainty from project context.',
		whatYouCanDo: [
			'Estimate whether work is on track',
			'Identify likely slippage and schedule risk',
			'Connect risks, blocked work, and milestones into a forward-looking view'
		],
		skillIds: ['project_forecast'],
		directPaths: [
			'onto.project.graph',
			'onto.task',
			'onto.plan',
			'onto.goal',
			'onto.milestone',
			'onto.risk',
			'cal.event'
		]
	},
	{
		id: 'web_research',
		path: 'capabilities.web_research',
		name: 'Web research',
		status: 'available',
		summary:
			'Search the web, inspect URLs, and pull in current external information when needed.',
		whatYouCanDo: [
			'Run web searches',
			'Visit URLs and inspect page content',
			'Use current external information when the user asks for it'
		],
		skillIds: [],
		directPaths: ['util.web'],
		notes: [
			'No dedicated skill exists yet. Go straight to util.web unless a future research skill is added.'
		]
	},
	{
		id: 'buildos_reference',
		path: 'capabilities.buildos_reference',
		name: 'BuildOS product reference',
		status: 'available',
		summary:
			'Explain BuildOS product concepts, usage patterns, and product-specific guidance from internal BuildOS reference tools.',
		whatYouCanDo: [
			'Explain BuildOS concepts and workflows',
			'Answer BuildOS product questions from internal reference material'
		],
		skillIds: [],
		directPaths: ['util.buildos']
	},
	{
		id: 'schema_reference',
		path: 'capabilities.schema_reference',
		name: 'Schema and field reference',
		status: 'available',
		summary:
			'Inspect field metadata and schema hints when exact model fields or contracts matter.',
		whatYouCanDo: [
			'Look up field metadata',
			'Use schema guidance to prepare exact tool arguments'
		],
		skillIds: [],
		directPaths: ['util.schema']
	}
];

export function listCapabilities(status?: CapabilityStatus): CapabilityDefinition[] {
	if (!status) return [...ALL_CAPABILITIES];
	return ALL_CAPABILITIES.filter((capability) => capability.status === status);
}

export function listCapabilityDirectoryItems(status?: CapabilityStatus): CapabilityDirectoryItem[] {
	return listCapabilities(status).map((capability) => ({
		name: capability.path,
		type: 'capability' as const,
		summary: capability.summary
	}));
}

export function getCapabilityByPath(path: string): CapabilityDefinition | undefined {
	return ALL_CAPABILITIES.find((capability) => capability.path === path);
}

export function buildCapabilityHelpPayload(
	capability: CapabilityDefinition,
	format: 'short' | 'full'
): CapabilityHelpPayload {
	const payload: CapabilityHelpPayload = {
		type: 'capability',
		path: capability.path,
		id: capability.id,
		name: capability.name,
		status: capability.status,
		summary: capability.summary,
		what_you_can_do: capability.whatYouCanDo,
		skill_entrypoints: capability.skillIds,
		direct_paths: capability.directPaths
	};

	if (format === 'full' && capability.notes?.length) {
		payload.notes = capability.notes;
	}

	return payload;
}
