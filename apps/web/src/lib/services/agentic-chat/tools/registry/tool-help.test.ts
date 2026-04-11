// apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.test.ts
import { describe, expect, it } from 'vitest';
import { getToolHelp } from './tool-help';

describe('getToolHelp', () => {
	it('returns root command contract and workflow examples', () => {
		const help = getToolHelp('root', { format: 'short', include_examples: true });

		expect(help.type).toBe('directory');
		expect(help.path).toBe('root');
		expect(help.groups).toContain('capabilities');
		expect(help.groups).toContain('skills');
		expect(help.groups).toContain('workflow');
		expect(Array.isArray(help.capabilities)).toBe(true);
		expect(help.capabilities.map((item: any) => item.name)).toContain('capabilities.overview');
		expect(help.capabilities.map((item: any) => item.name)).toContain(
			'capabilities.project_creation'
		);
		expect(help.capabilities.map((item: any) => item.name)).toContain('capabilities.calendar');
		expect(help.capabilities.map((item: any) => item.name)).toContain(
			'capabilities.workflow_audit'
		);
		expect(Array.isArray(help.skills)).toBe(true);
		expect(help.skills.map((item: any) => item.name)).toContain('calendar_management');
		expect(help.skills.map((item: any) => item.name)).toContain('project_creation');
		expect(help.skills.map((item: any) => item.name)).toContain('task_management');
		expect(help.skills.map((item: any) => item.name)).toContain('people_context');
		expect(help.command_contract?.execute_op?.required).toEqual(['op', 'input']);
		expect(Array.isArray(help.workflow)).toBe(true);
		expect(help.workflow.join(' ')).toContain('capabilities.overview');
		expect(help.workflow.join(' ')).toContain('capabilities.project_creation');
		expect(help.workflow.join(' ')).toContain('onto.project.create.skill');
		expect(help.workflow.join(' ')).toContain('util.workspace.overview');
		expect(help.workflow.join(' ')).toContain('util.project.overview');
		expect(help.workflow.join(' ')).toContain('capabilities.calendar');
		expect(help.workflow.join(' ')).toContain('capabilities.workflow_audit');
		expect(help.workflow.join(' ')).toContain('tool_help({ path: "skills" })');
		expect(help.workflow.join(' ')).toContain('tool_help({ path: help_path })');
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples.length).toBeGreaterThan(0);
	});

	it('lists the capability catalog at the top level', () => {
		const help = getToolHelp('capabilities', { format: 'short', include_examples: true });

		expect(help.type).toBe('directory');
		expect(help.path).toBe('capabilities');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('capabilities.overview');
		expect(help.items.map((item: any) => item.name)).toContain('capabilities.project_creation');
		expect(help.items.map((item: any) => item.name)).toContain('capabilities.calendar');
		expect(help.items.map((item: any) => item.name)).toContain('capabilities.documents');
		expect(help.items.map((item: any) => item.name)).toContain(
			'capabilities.workflow_forecast'
		);
	});

	it('returns overview capability detail with direct overview paths', () => {
		const help = getToolHelp('capabilities.overview', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('capability');
		expect(help.path).toBe('capabilities.overview');
		expect(help.skill_entrypoints).toEqual([]);
		expect(help.direct_paths).toContain('util.workspace.overview');
		expect(help.direct_paths).toContain('util.project.overview');
		expect(help.notes.join(' ')).toContain('what is happening with my projects');
	});

	it('returns project creation capability detail with its skill entrypoint', () => {
		const help = getToolHelp('capabilities.project_creation', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('capability');
		expect(help.path).toBe('capabilities.project_creation');
		expect(help.skill_entrypoints).toContain('project_creation');
		expect(help.direct_paths).toContain('onto.project.create');
		expect(help.notes.join(' ')).toContain('project_create context');
	});

	it('returns capability detail with skill entrypoints', () => {
		const help = getToolHelp('capabilities.calendar', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('capability');
		expect(help.path).toBe('capabilities.calendar');
		expect(help.skill_entrypoints).toContain('calendar_management');
		expect(help.direct_paths).toContain('cal.event');
		expect(help.what_you_can_do.join(' ')).toContain('Create, update, and delete events');
	});

	it('returns workflow capability detail with workflow skill entrypoints', () => {
		const help = getToolHelp('capabilities.workflow_audit', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('capability');
		expect(help.path).toBe('capabilities.workflow_audit');
		expect(help.skill_entrypoints).toContain('workflow_audit');
		expect(help.direct_paths).toContain('onto.project.graph');
	});

	it('lists the global skill catalog', () => {
		const help = getToolHelp('skills', { format: 'short', include_examples: true });

		expect(help.type).toBe('directory');
		expect(help.path).toBe('skills');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('calendar_management');
		expect(help.items.map((item: any) => item.name)).toContain('project_creation');
		expect(help.items.map((item: any) => item.name)).toContain('task_management');
		expect(help.items.map((item: any) => item.name)).toContain('document_workspace');
		expect(help.items.map((item: any) => item.name)).toContain('plan_management');
		expect(help.items.map((item: any) => item.name)).toContain('people_context');
		expect(help.items.map((item: any) => item.name)).toContain('workflow_audit');
		expect(help.items.map((item: any) => item.name)).toContain('workflow_forecast');
	});

	it('returns task skill playbook for onto.task.skill', () => {
		const help = getToolHelp('onto.task.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('task_management');
		expect(help.related_ops).toContain('onto.task.create');
		expect(help.related_ops).toContain('onto.task.update');
		expect(help.notes.join(' ')).toContain('future human work');
		expect(help.guardrails.join(' ')).toContain('do now in chat');
	});

	it('returns project creation skill playbook for onto.project.create.skill', () => {
		const help = getToolHelp('onto.project.create.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('project_creation');
		expect(help.related_ops).toContain('onto.project.create');
		expect(help.workflow.join(' ')).toContain('entities: []');
		expect(help.workflow.join(' ')).toContain('relationships: []');
		expect(help.guardrails.join(' ')).toContain('create_onto_project({})');
		expect(help.notes.join(' ')).toContain('Project creation is a minimality exercise');
	});

	it('returns op help with required args and concrete example template', () => {
		const help = getToolHelp('onto.task.update', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('onto.task.update');
		expect(Array.isArray(help.required_args)).toBe(true);
		expect(help.required_args).toContain('task_id');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('task_id');
		expect(help.example_execute_op?.op).toBe('onto.task.update');
		expect(help.example_execute_op?.input?.task_id).toBe('<task_id_uuid>');
		expect(Object.keys(help.example_execute_op?.input ?? {}).length).toBeGreaterThan(1);
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples.length).toBeGreaterThan(0);
	});

	it('returns project creation op help with a real minimal payload example', () => {
		const help = getToolHelp('onto.project.create', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('onto.project.create');
		expect(help.required_args).toEqual(
			expect.arrayContaining(['project', 'entities', 'relationships'])
		);
		expect(help.notes.join(' ')).toContain('project.name and project.type_key');
		expect(help.notes.join(' ')).toContain('Never use raw string pairs');
		expect(help.example_execute_op?.input?.project?.name).toBe('<project name>');
		expect(help.example_execute_op?.input?.project?.type_key).toBe(
			'project.business.initiative'
		);
		expect(help.example_execute_op?.input?.entities).toEqual([]);
		expect(help.example_execute_op?.input?.relationships).toEqual([]);
		expect(help.examples.length).toBeGreaterThanOrEqual(3);
		expect(help.examples[2]?.execute_op?.input?.relationships?.[0]?.from?.temp_id).toBe('g1');
	});

	it('returns concrete creation guidance for goals, milestones, and plans', () => {
		const goalHelp = getToolHelp('onto.goal.create', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});
		const milestoneHelp = getToolHelp('onto.milestone.create', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});
		const planHelp = getToolHelp('onto.plan.create', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(goalHelp.notes.join(' ')).toContain('input.name');
		expect(goalHelp.notes.join(' ')).toContain('not title');
		expect(goalHelp.examples[0]?.execute_op?.input?.name).toBe(
			'Finish first draft by March 31st'
		);

		expect(milestoneHelp.notes.join(' ')).toContain('input.title');
		expect(milestoneHelp.notes.join(' ')).toContain('not name');
		expect(milestoneHelp.examples[0]?.execute_op?.input?.goal_id).toBe('<goal_id_uuid>');
		expect(milestoneHelp.examples[0]?.execute_op?.input?.title).toBe('Complete chapters 1-10');

		expect(planHelp.notes.join(' ')).toContain('input.name');
		expect(planHelp.notes.join(' ')).toContain('milestone_id');
		expect(planHelp.examples[0]?.execute_op?.input?.milestone_id).toBe('<milestone_id_uuid>');
		expect(planHelp.examples[0]?.execute_op?.input?.name).toBe('Weekday drafting routine');
	});

	it('returns workspace overview op guidance for status questions', () => {
		const help = getToolHelp('util.workspace.overview', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.workspace.overview');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('workspace-wide status questions');
		expect(help.examples[0]?.execute_op?.input?.project_limit).toBe(8);
	});

	it('returns project overview op guidance for named project status questions', () => {
		const help = getToolHelp('util.project.overview', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.project.overview');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('input.project_id');
		expect(help.notes.join(' ')).toContain('input.query');
		expect(help.examples[0]?.execute_op?.input?.query).toBe('9takes');
		expect(help.examples[1]?.execute_op?.input?.project_id).toBe('<project_id_uuid>');
	});

	it('includes query guidance for search ops', () => {
		const help = getToolHelp('onto.task.search', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.example_execute_op?.input?.query).toBe('<search query>');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('input.query');
	});

	it('includes explicit range and paging guidance for calendar list ops', () => {
		const help = getToolHelp('cal.event.list', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('timeMin/timeMax');
		expect(help.notes.join(' ')).toContain('limit');
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples[0]?.execute_op?.input?.time_min).toBe('2026-03-01');
		expect(help.examples[1]?.execute_op?.input?.offset).toBe(100);
	});

	it('includes required identifier guidance for calendar update ops', () => {
		const help = getToolHelp('cal.event.update', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('onto_event_id or input.event_id');
		expect(help.example_execute_op?.input?.onto_event_id).toBe('<onto_event_id_uuid>');
		expect(help.example_execute_op?.input?.title).toBe('<title>');
	});

	it('returns calendar skill playbook for cal.skill', () => {
		const help = getToolHelp('cal.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('calendar_management');
		expect(Array.isArray(help.when_to_use)).toBe(true);
		expect(Array.isArray(help.workflow)).toBe(true);
		expect(Array.isArray(help.related_ops)).toBe(true);
		expect(help.related_ops).toContain('cal.event.list');
		expect(help.related_ops).toContain('cal.event.create');
		expect(help.related_ops).toContain('cal.event.update');
		expect(help.related_ops).toContain('cal.event.delete');
		expect(Array.isArray(help.guardrails)).toBe(true);
		expect(help.guardrails.join(' ')).toContain('onto_event_id');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('time zone normalization');
	});

	it('lists calendar skill under cal namespace', () => {
		const help = getToolHelp('cal', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('cal');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('calendar_management');
	});

	it('returns document skill playbook for onto.document.skill', () => {
		const help = getToolHelp('onto.document.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('document_workspace');
		expect(Array.isArray(help.when_to_use)).toBe(true);
		expect(help.when_to_use.join(' ')).toContain('task workspace');
		expect(Array.isArray(help.related_ops)).toBe(true);
		expect(help.related_ops).toContain('onto.document.create');
		expect(help.related_ops).toContain('onto.task.docs.create_or_attach');
		expect(help.workflow.join(' ')).toContain('project_id, title, and description');
		expect(Array.isArray(help.guardrails)).toBe(true);
		expect(help.guardrails.join(' ')).toContain('document_id');
	});

	it('lists document skill under onto.document namespace', () => {
		const help = getToolHelp('onto.document', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('onto.document');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('document_workspace');
		expect(help.items.map((item: any) => item.name)).toContain('onto.document.create');
	});

	it('returns plan skill playbook for onto.plan.skill', () => {
		const help = getToolHelp('onto.plan.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('plan_management');
		expect(Array.isArray(help.related_ops)).toBe(true);
		expect(help.related_ops).toContain('onto.plan.create');
		expect(help.related_ops).toContain('onto.task.create');
		expect(help.workflow.join(' ')).toContain('Prefer a milestone-scoped plan');
		expect(Array.isArray(help.guardrails)).toBe(true);
		expect(help.guardrails.join(' ')).toContain(
			'description is the synopsis; plan is the detailed body'
		);
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('goal -> milestone -> plan -> tasks');
	});

	it('lists plan skill under onto.plan namespace', () => {
		const help = getToolHelp('onto.plan', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('onto.plan');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('plan_management');
		expect(help.items.map((item: any) => item.name)).toContain('onto.plan.create');
	});

	it('returns people skill playbook for util.people.skill', () => {
		const help = getToolHelp('util.people.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.id).toBe('people_context');
		expect(help.related_ops).toContain('util.contact.search');
		expect(help.related_ops).toContain('util.profile.overview');
		expect(help.guardrails.join(' ')).toContain('redacted');
		expect(help.notes.join(' ')).toContain('silent merging');
	});

	it('supports profile overview op discovery', () => {
		const help = getToolHelp('util.profile.overview', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.profile.overview');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('not preloaded');
		expect(help.example_execute_op?.input).toEqual({});
	});

	it('lists util.profile namespace with profile overview op', () => {
		const help = getToolHelp('util.profile', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('util.profile');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('util.profile.overview');
	});

	it('supports contact search op discovery with redaction notes', () => {
		const help = getToolHelp('util.contact.search', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.contact.search');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('redacted');
	});

	it('lists util.contact namespace with contact ops', () => {
		const help = getToolHelp('util.contact', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('util.contact');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('util.contact.search');
		expect(help.items.map((item: any) => item.name)).toContain('util.contact.upsert');
	});

	it('lists people skill under util namespace and supports alias lookup', () => {
		const utilHelp = getToolHelp('util', {
			format: 'short',
			include_examples: true
		});
		const aliasHelp = getToolHelp('people.skill', {
			format: 'full',
			include_examples: true
		});

		expect(utilHelp.type).toBe('directory');
		expect(utilHelp.items.map((item: any) => item.name)).toContain('people_context');
		expect(aliasHelp.type).toBe('skill');
		expect(aliasHelp.id).toBe('people_context');
	});

	it('lists workflow skill namespace and forecast playbook', () => {
		const workflowHelp = getToolHelp('workflow', {
			format: 'short',
			include_examples: true
		});
		const forecastHelp = getToolHelp('workflow.forecast.skill', {
			format: 'full',
			include_examples: true
		});

		expect(workflowHelp.type).toBe('directory');
		expect(workflowHelp.path).toBe('workflow');
		expect(workflowHelp.items.map((item: any) => item.name)).toContain('workflow_audit');
		expect(workflowHelp.items.map((item: any) => item.name)).toContain('workflow_forecast');
		expect(forecastHelp.type).toBe('skill');
		expect(forecastHelp.id).toBe('workflow_forecast');
		expect(forecastHelp.related_ops).toContain('cal.event.list');
		expect(forecastHelp.guardrails.join(' ')).toContain('Do not invent dates');
	});
});
