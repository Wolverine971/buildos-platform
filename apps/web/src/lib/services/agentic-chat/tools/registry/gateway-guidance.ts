// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts
export const GATEWAY_TOOL_DISCOVERY_LINES = [
	'You only have access to tool_help and tool_exec. tool_help discovers paths and schemas; tool_exec runs canonical ops.',
	'Use targeted discovery first unless the exact op and args are already known in-turn.',
	'Path heuristic: tasks -> onto.task, task docs / task workspace docs -> onto.task.docs, documents -> onto.document, goals -> onto.goal, plans -> onto.plan, milestones -> onto.milestone, risks -> onto.risk, calendar -> cal.skill, user profile -> util.profile, contacts -> util.contact, web/current info/URLs -> util.web, BuildOS product/docs/workflows -> util.buildos, field/schema questions -> util.schema, unknown namespace -> root.',
	'Fetch a skill only when the workflow is multi-step, stateful, or easy to get wrong.',
	'Good skill entry points: calendar/event work or project calendar mapping -> cal.skill; project document tree, unlinked docs, or task docs -> onto.document.skill; plan creation or plan restructuring -> onto.plan.skill.',
	'Do not fetch skills speculatively, and do not re-fetch the same skill path repeatedly in one turn once the guidance is already known in-turn.',
	'tool_help can return a directory, a skill playbook, or an exact op schema. Use directory/skill output to narrow the target, then inspect the exact op when needed.',
	'In tool_exec.op, use only canonical ops.',
	'Canonical ontology CRUD/search family: onto.<entity>.create|list|get|update|delete|search.',
	'Supported onto entities: project, task, goal, plan, document, milestone, risk.',
	'Canonical onto exception ops: onto.search, onto.document.tree.get, onto.document.tree.move, onto.document.path.get, onto.project.graph.get, onto.project.graph.reorganize, onto.edge.link, onto.edge.unlink, onto.entity.relationships.get, onto.entity.links.get, onto.task.docs.list, onto.task.docs.create_or_attach.',
	'Calendar ops are under cal.event.* and cal.project.* (not onto.event.*). Utility ops are under util.*. Never use legacy op strings in tool_exec.op (for example: get_document_tree, move_document_in_tree, list_onto_*).',
	'Gateway payload contract: tool_help({ path: "<path>", format?: "short|full", include_schemas?: boolean }) and tool_exec({ op: "<canonical op>", args: { ... } }). Never call tool_exec with {} or with missing op/args.',
	'User profile context is NOT preloaded. If personalization is needed, call tool_help({ path: "util.profile" }) and then util.profile.overview.',
	'Contact method values are sensitive and redacted by default. Use util.contact when needed, but only request raw phone/email values when the user explicitly asks for exact details.',
	'CRUD ID contract: onto.<entity>.get|update|delete require args.<entity>_id as an exact UUID.',
	'Update contract: onto.<entity>.update requires args.<entity>_id plus at least one field to change.',
	'Example update task: tool_exec({ op: "onto.task.update", args: { task_id: "11111111-1111-4111-8111-111111111111", title: "Updated title" } }).',
	'Example update document: tool_exec({ op: "onto.document.update", args: { document_id: "22222222-2222-4222-8222-222222222222", content: "Updated markdown content" } }).',
	'If IDs are unknown, run list/search/tree ops first and extract IDs from tool results before writes.',
	'Do not emit dependent write calls that require an ID from another call in the same response unless the ID is already known in context.',
	'For first-time or complex writes in a turn, call tool_help({ path: "<exact op>", format: "full", include_schemas: true }) before tool_exec. When the exact op and schema are already known in-turn, call tool_exec directly and do not re-run the same tool_help path.',
	'For any onto.*.search op (including onto.search), always pass args.query and include args.project_id when known.',
	'Project context events are time-boxed to the last 7 days and next 14 days (UTC).',
	'To inspect events outside that context window, call cal.event.list with args.timeMin/timeMax (or args.time_min/time_max), and use limit/offset for paging.',
	'Project context data may include context_meta.entity_scopes with returned/total_matching/limit/is_complete values per entity.',
	'Global context data may include context_meta.entity_limits_per_project and may omit doc_structure to keep portfolio summaries compact.',
	'context_meta may include generated_at/source/cache_age_seconds to describe snapshot freshness.',
	'If global summaries are limited and the user asks for exhaustive cross-project results, run targeted list/search tools before answering.',
	'If a scope is incomplete and the user asks for "all" items or older history, run targeted list/search/tree tools to fetch missing data before answering.',
	'If a tool_exec error includes help_path, call tool_help({ path: help_path }) once, then retry once with corrected args.',
	'If a tool_exec result includes _fallback due to missing *_id, extract candidate IDs from returned list/tree payload and retry with an exact *_id.',
	'For onto.*.get ops, always pass the exact *_id. If unknown, use list/search/tree ops first to discover IDs.',
	'Never guess IDs or required fields, and do not repeat the same failing op+args without new help output.'
];

export function formatGatewayGuidanceLines(prefix = '- '): string {
	return GATEWAY_TOOL_DISCOVERY_LINES.map((line) => `${prefix}${line}`).join('\n');
}
