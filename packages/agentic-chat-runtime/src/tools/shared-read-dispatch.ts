// packages/agentic-chat-runtime/src/tools/shared-read-dispatch.ts
import type { JsonObject } from '@buildos/shared-types';
import {
	getOntoGoalDetails,
	getOntoMilestoneDetails,
	getOntoPlanDetails,
	getOntoRiskDetails
} from './ontology-detail-reads';
import {
	getDocumentOutline,
	getOntoDocumentDetails,
	getOntoProjectDetails,
	listOntoDocuments,
	listOntoGoals,
	listOntoMilestones,
	listOntoPlans,
	listOntoProjects,
	listOntoRisks,
	listOntoTasks,
	readDocumentSection,
	searchOntoDocuments,
	searchOntoGoals,
	searchOntoMilestones,
	searchOntoPlans,
	searchOntoProjects,
	searchOntoRisks,
	searchOntoTasks,
	type AgenticChatSharedReadContextV1
} from './ontology-reads';
import { getCalendarEventDetails, getProjectCalendar, listCalendarEvents } from './calendar-reads';
import { exploreProject } from './ontology-explore';
import { searchAllProjects, searchOntology, searchProject } from './ontology-search';
import { getDocumentPath, getDocumentTree, getOntoProjectGraph } from './ontology-structure-reads';
import { getOntoTaskDetails } from './ontology-task-detail';
import { listTaskDocuments } from './ontology-task-documents';
import { getFieldInfo, getProjectOverview, getWorkspaceOverview } from './overview-reads';

type SharedReadToolRunnerV1 = (
	context: AgenticChatSharedReadContextV1,
	args: never
) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * The single package-owned mapping between public read-tool names and their
 * implementations. `satisfies` checks each function's actual argument and
 * result contract while preserving those per-tool types for consumers.
 */
const AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1 = Object.freeze({
	list_onto_projects: listOntoProjects,
	list_onto_tasks: listOntoTasks,
	list_onto_goals: listOntoGoals,
	list_onto_plans: listOntoPlans,
	list_onto_documents: listOntoDocuments,
	list_onto_milestones: listOntoMilestones,
	list_onto_risks: listOntoRisks,
	search_onto_projects: searchOntoProjects,
	search_onto_tasks: searchOntoTasks,
	search_onto_goals: searchOntoGoals,
	search_onto_plans: searchOntoPlans,
	search_onto_documents: searchOntoDocuments,
	search_onto_milestones: searchOntoMilestones,
	search_onto_risks: searchOntoRisks,
	search_all_projects: searchAllProjects,
	// Legacy public name retained as an explicit alias, not a second implementation.
	search_buildos: searchAllProjects,
	search_project: searchProject,
	search_ontology: searchOntology,
	explore_project: exploreProject,
	get_onto_project_details: getOntoProjectDetails,
	get_onto_project_graph: getOntoProjectGraph,
	get_onto_document_details: getOntoDocumentDetails,
	get_onto_goal_details: getOntoGoalDetails,
	get_onto_plan_details: getOntoPlanDetails,
	get_onto_milestone_details: getOntoMilestoneDetails,
	get_onto_risk_details: getOntoRiskDetails,
	get_onto_task_details: getOntoTaskDetails,
	list_task_documents: listTaskDocuments,
	get_document_outline: getDocumentOutline,
	read_document_section: readDocumentSection,
	get_document_tree: getDocumentTree,
	get_document_path: getDocumentPath,
	get_workspace_overview: getWorkspaceOverview,
	get_project_overview: getProjectOverview,
	// Calendar READS only. The four calendar writes and set_project_calendar
	// stay on the web executor and remain worker-unavailable.
	list_calendar_events: listCalendarEvents,
	get_calendar_event_details: getCalendarEventDetails,
	get_project_calendar: getProjectCalendar,
	get_field_info: async (_context, args: Parameters<typeof getFieldInfo>[0]) => getFieldInfo(args)
} satisfies Readonly<Record<string, SharedReadToolRunnerV1>>);

export type AgenticChatSharedReadToolNameV1 =
	keyof typeof AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1;

export type AgenticChatSharedReadToolMapV1 = {
	[TName in AgenticChatSharedReadToolNameV1]: {
		arguments: Parameters<(typeof AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1)[TName]>[1];
		result: Awaited<ReturnType<(typeof AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1)[TName]>>;
	};
};

export const AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 = Object.freeze(
	Object.keys(AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1) as AgenticChatSharedReadToolNameV1[]
);

const AGENTIC_CHAT_SHARED_READ_TOOL_NAME_SET_V1 = new Set<string>(
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1
);

export function isAgenticChatSharedReadToolNameV1(
	value: unknown
): value is AgenticChatSharedReadToolNameV1 {
	return typeof value === 'string' && AGENTIC_CHAT_SHARED_READ_TOOL_NAME_SET_V1.has(value);
}

export function executeAgenticChatSharedReadToolV1<
	TName extends AgenticChatSharedReadToolNameV1
>(input: {
	toolName: TName;
	context: AgenticChatSharedReadContextV1;
	arguments: AgenticChatSharedReadToolMapV1[TName]['arguments'];
}): Promise<AgenticChatSharedReadToolMapV1[TName]['result']>;
export function executeAgenticChatSharedReadToolV1(input: {
	toolName: AgenticChatSharedReadToolNameV1;
	context: AgenticChatSharedReadContextV1;
	arguments: JsonObject;
}): Promise<Record<string, unknown>>;
export async function executeAgenticChatSharedReadToolV1(input: {
	toolName: AgenticChatSharedReadToolNameV1;
	context: AgenticChatSharedReadContextV1;
	arguments: JsonObject;
}): Promise<Record<string, unknown>> {
	const runner: SharedReadToolRunnerV1 =
		AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1[input.toolName];
	// The provider validates tool arguments against the admitted JSON schema;
	// individual implementations retain their domain checks for direct callers.
	return runner(input.context, input.arguments as never);
}
