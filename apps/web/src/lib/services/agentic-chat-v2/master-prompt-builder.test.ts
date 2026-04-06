// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { buildMasterPrompt } from './master-prompt-builder';

afterEach(() => {
	delete mockEnv.AGENTIC_CHAT_TOOL_GATEWAY;
});

describe('buildMasterPrompt gateway tool instructions', () => {
	it('includes gateway query pattern guidance when enabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).toContain('Canonical ontology CRUD/search family');
		expect(prompt).toContain('<buildos_capabilities>');
		expect(prompt).toContain(
			'Workspace and project overviews: Get BuildOS-native status snapshots for the whole workspace or one project without assembling generic ontology reads by hand.'
		);
		expect(prompt).toContain(
			'Calendar management: Check the calendar, create or reschedule events, cancel events, and manage project calendar mapping.'
		);
		expect(prompt).toContain('<capability_system>');
		expect(prompt).toContain('<overview_guidance>');
		expect(prompt).toContain('Workspace-wide status -> util.workspace.overview');
		expect(prompt).toContain('Named or in-scope project status -> util.project.overview');
		expect(prompt).toContain('Think in three layers:');
		expect(prompt).toContain('1) Capability = what BuildOS can do for the user.');
		expect(prompt).toContain(
			'If it does not have a dedicated skill, go straight to targeted exact-op help.'
		);
		expect(prompt).toContain('<capability_catalog>');
		expect(prompt).toContain(
			'Workspace and project overviews -> no dedicated skill yet; direct discovery paths: util.workspace.overview, util.project.overview'
		);
		expect(prompt).toContain(
			'Project creation -> preferred skill: onto.project.create.skill; direct discovery paths: onto.project.create'
		);
		expect(prompt).toContain(
			'Calendar management -> preferred skill: cal.skill; direct discovery paths: cal.event, cal.project'
		);
		expect(prompt).toContain(
			'People and profile context -> preferred skill: util.people.skill; direct discovery paths: util.profile, util.contact'
		);
		expect(prompt).toContain(
			'Workflow audit -> preferred skill: workflow.audit.skill; direct discovery paths: onto.project.graph, onto.task, onto.plan, onto.goal, onto.milestone, onto.risk, onto.document.tree, cal.event'
		);
		expect(prompt).toContain('<skill_catalog>');
		expect(prompt).toContain(
			'cal.skill: Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping.'
		);
		expect(prompt).toContain(
			'onto.task.skill: Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely.'
		);
		expect(prompt).toContain(
			'onto.document.skill: Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.'
		);
		expect(prompt).toContain(
			'onto.plan.skill: Plan workflow playbook for deciding when to create plans, structuring them well, and connecting plans to tasks, goals, milestones, and documents.'
		);
		expect(prompt).toContain(
			'onto.project.create.skill: Project creation playbook for turning a user idea into the smallest valid BuildOS project payload with inferred name, type_key, props, and only the initial structure the user actually described.'
		);
		expect(prompt).toContain(
			'util.people.skill: People context playbook for profile lookup, contact search and updates, candidate resolution, and safe handling of sensitive contact values.'
		);
		expect(prompt).toContain('workflow.audit.skill: Project health audit playbook');
		expect(prompt).toContain('workflow.forecast.skill: Project forecast playbook');
		expect(prompt).toContain('In tool_exec.op, use only canonical ops.');
		expect(prompt).toContain('Never use legacy op strings in tool_exec.op');
		expect(prompt).toContain(
			'Use the capability catalog in the prompt to choose the right BuildOS domain first.'
		);
		expect(prompt).toContain(
			'For routine status questions about the workspace or a named project, prefer capabilities.overview first.'
		);
		expect(prompt).toContain(
			'When context_type is project_create, prefer capabilities.project_creation first.'
		);
		expect(prompt).toContain(
			'For workspace-wide status questions like "what is happening with my projects?", prefer util.workspace.overview instead of generic ontology search/list assembly.'
		);
		expect(prompt).toContain(
			'For one-project status questions like "what is going on with 9takes?", prefer util.project.overview with args.project_id when known or args.query when the name must be resolved.'
		);
		expect(prompt).toContain(
			'For project creation, prefer capabilities.project_creation -> onto.project.create.skill -> onto.project.create.'
		);
		expect(prompt).toContain(
			'tool_help can return a directory, a skill playbook, or an exact op schema.'
		);
		expect(prompt).toContain(
			'If the chosen capability has a skill and the work is multi-step, stateful, or easy to get wrong, fetch that skill first.'
		);
		expect(prompt).toContain(
			'Do not use tool_exec speculatively or "just to try." Only call it when you know the exact canonical op and have concrete args that satisfy that op schema.'
		);
		expect(prompt).toContain(
			'A missing required parameter means you are not ready to call that op yet.'
		);
		expect(prompt).toContain(
			'If a capability has no dedicated skill, go straight to targeted exact-op help instead of hunting for a skill that does not exist.'
		);
		expect(prompt).toContain(
			'User profile context is NOT preloaded. If personalization is needed, call tool_help({ path: "util.profile" }) and then util.profile.overview.'
		);
		expect(prompt).toContain('Contact method values are sensitive and redacted by default.');
		expect(prompt).toContain(
			'For first-time or complex writes in a turn, call tool_help({ path: "<exact op>", format: "full", include_schemas: true }) before tool_exec.'
		);
		expect(prompt).toContain(
			'Gateway payload contract: tool_help({ path: "<path>", format?: "short|full", include_schemas?: boolean }) and tool_exec({ op: "<canonical op>", args: { ... } }).'
		);
		expect(prompt).toContain(
			'onto.project.create requires args.project with project.name and project.type_key, plus args.entities and args.relationships arrays (use [] when empty).'
		);
		expect(prompt).toContain(
			'CRUD ID contract: onto.<entity>.get|update|delete require args.<entity>_id as an exact UUID.'
		);
		expect(prompt).toContain(
			'Example update task: tool_exec({ op: "onto.task.update", args: { task_id: "11111111-1111-4111-8111-111111111111", title: "Updated title" } }).'
		);
		expect(prompt).toContain(
			'For any onto.*.search op (including onto.search), always pass args.query and include args.project_id when known.'
		);
		expect(prompt).toContain('Calendar ops are under cal.event.* and cal.project.*');
		expect(prompt).toContain('onto.task.docs.list, onto.task.docs.create_or_attach');
		expect(prompt).not.toContain('tool_batch');
		expect(prompt).toContain(
			'Project context events are time-boxed to the last 7 days and next 14 days (UTC).'
		);
		expect(prompt).toContain(
			'To inspect events outside that context window, call cal.event.list with args.timeMin/timeMax (or args.time_min/time_max), and use limit/offset for paging.'
		);
		expect(prompt).toContain(
			'Project context data may include context_meta.entity_scopes with returned/total_matching/limit/is_complete values per entity.'
		);
		expect(prompt).toContain(
			'Global context data may include context_meta.entity_limits_per_project and may omit doc_structure to keep portfolio summaries compact.'
		);
		expect(prompt).toContain(
			'context_meta may include generated_at/source/cache_age_seconds to describe snapshot freshness.'
		);
		expect(prompt).toContain(
			'If global summaries are limited and the user asks for exhaustive cross-project results, run targeted list/search tools before answering.'
		);
		expect(prompt).toContain(
			'Use new_parent_id only when nesting under a parent (omit it for root moves).'
		);
		expect(prompt).toContain(
			'For "link unlinked docs" requests, call onto.document.tree.get once, then issue onto.document.tree.move for each unlinked document ID.'
		);
		expect(prompt).not.toContain('Common ops you can often use directly');
		expect(prompt).not.toContain('Path heuristic:');
		expect(prompt).not.toContain('Good skill entry points:');
	});

	it('omits the tool discovery block when gateway mode is disabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).not.toContain('<tool_discovery>');
		expect(prompt).not.toContain('<capability_system>');
		expect(prompt).not.toContain('<overview_guidance>');
		expect(prompt).not.toContain('<capability_catalog>');
		expect(prompt).not.toContain('<skill_catalog>');
		expect(prompt).not.toContain('Canonical ontology CRUD/search family');
		expect(prompt).toContain('<buildos_capabilities>');
		expect(prompt).toContain(
			'Web research: Search the web, inspect URLs, and pull in current external information when needed.'
		);
		expect(prompt).toContain(
			'Workflow audit: Review project health, structure, blockers, stale work, and missing coverage using BuildOS project data.'
		);
	});

	it('falls back project_id to entity_id for project context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: null,
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
		});

		expect(prompt).toContain('<project_id>05c40ed8-9dbe-4893-bd64-8aeec90eab40</project_id>');
	});

	it('adds dedicated project creation workflow guidance in project_create context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'project_create',
			projectId: null,
			entityId: null
		});

		expect(prompt).toContain('<project_create_workflow>');
		expect(prompt).toContain('You are already in project_create context.');
		expect(prompt).toContain(
			'Prefer capabilities.project_creation, then load onto.project.create.skill before the first create call.'
		);
		expect(prompt).toContain(
			'Always include entities: [] and relationships: [] even when the project starts empty.'
		);
		expect(prompt).toContain('Never use raw temp_id strings like ["g1", "t1"].');
		expect(prompt).toContain(
			'Use clarifications[] only when critical information cannot be reasonably inferred'
		);
	});

	it('renders absent ID tags as empty values instead of the string none', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null,
			focusEntityId: null
		});

		expect(prompt).toContain('<project_id></project_id>');
		expect(prompt).toContain('<entity_id></entity_id>');
		expect(prompt).toContain('<focus_entity_id></focus_entity_id>');
		expect(prompt).not.toContain('<project_id>none</project_id>');
		expect(prompt).not.toContain('<entity_id>none</entity_id>');
		expect(prompt).toContain(
			'Never pass strings like "none", "null", or "undefined" as any *_id or entity_id value.'
		);
		expect(prompt).toContain(
			'Do not use tools speculatively or "just to try." If you do not yet know the exact op schema or the required IDs/fields, fetch tool_help or read/list/search first.'
		);
	});

	it('includes member role planning guardrails', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'project-1',
			entityId: 'project-1'
		});

		expect(prompt).toContain('<member_role_rules>');
		expect(prompt).toContain(
			'Prefer assigning work to members whose role_name/role_description aligns with the responsibility.'
		);
		expect(prompt).toContain(
			'Treat permission role and access as hard constraints (for example, do not route admin actions to viewers).'
		);
		expect(prompt).toContain(
			'If multiple members overlap responsibilities, ask one concise clarification before assigning ownership.'
		);
	});

	it('does not inject user profile data into the system prompt by default', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).not.toContain('<user_profile>');
	});

	it('compacts agent_state entities and linked documents at prompt time', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'proj-1',
			entityId: 'proj-1',
			agentState: JSON.stringify({
				sessionId: 'session-1',
				items: [],
				assumptions: [],
				expectations: [],
				tentative_hypotheses: [],
				current_understanding: {
					entities: [{ id: 'goal-1', kind: 'goal', name: 'Goal One' }],
					dependencies: []
				}
			}),
			data: {
				doc_structure: {
					version: 1,
					root: [{ id: 'doc-linked', order: 0, title: 'Linked Doc' }]
				},
				documents: [
					{
						id: 'doc-linked',
						title: 'Linked Doc',
						in_doc_structure: true,
						is_unlinked: false
					},
					{
						id: 'doc-unlinked',
						title: 'Unlinked Doc',
						in_doc_structure: false,
						is_unlinked: true
					}
				]
			}
		});

		expect(prompt).not.toContain('"sessionId"');
		expect(prompt).not.toContain('"entities"');
		expect(prompt).toContain('"id": "doc-unlinked"');
		expect(prompt).not.toContain('"in_doc_structure": true');
	});
});
