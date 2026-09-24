// docs/research/jev-tool-selection-2026-09-18/planning-cases.ts
// Cases for the 2026-09-18 planning layer (goals, plans, milestones, risks,
// tags, project edits, task documents, unlink). Written before the eval run.
import type { SelectionCase } from './cases';

const FIND_TASK = [
	'search_all_projects',
	'search_onto_projects',
	'list_onto_tasks',
	'search_onto_tasks',
	'search_ontology'
] as const;
const FIND_IN_PROJECT = [
	'search_project',
	'list_onto_tasks',
	'search_onto_tasks',
	'search_ontology',
	'list_onto_documents',
	'get_document_tree'
] as const;
const NOISE = ['delete_calendar_event', 'search_email_messages', 'web_search'] as const;

export const PLANNING_CASES: readonly SelectionCase[] = [
	{
		id: 'PL01-new-goal-global',
		surface: 'global',
		message: 'new goal for BuildOS: hit $2k MRR by February',
		must: [
			'create_onto_goal',
			['search_onto_projects', 'search_all_projects', 'list_onto_projects']
		],
		mustNot: [...NOISE, 'create_onto_project']
	},
	{
		id: 'PL02-milestone-slipped',
		surface: 'project',
		message: 'the beta launch milestone slipped, move it to november 3',
		must: ['update_onto_milestone', ['list_onto_milestones', 'search_onto_milestones']],
		mustNot: [...NOISE, 'create_onto_risk']
	},
	{
		id: 'PL03-flag-risk',
		surface: 'project',
		message: 'flag a risk: the jev api is alpha and could change under us',
		must: ['create_onto_risk'],
		mustNot: [...NOISE, 'create_calendar_event']
	},
	{
		id: 'PL04-rename-project',
		surface: 'project',
		message:
			"rename this project to Bid Desk and update the description to say it's for specialty subcontractors",
		must: ['update_onto_project'],
		mustNot: [...NOISE, 'create_onto_goal']
	},
	{
		id: 'PL05-goals-and-milestones-status',
		surface: 'project',
		message: 'what are the goals and milestones for this project, and are we on track?',
		must: [
			['list_onto_goals', 'search_onto_goals', 'get_onto_project_graph'],
			['list_onto_milestones', 'search_onto_milestones', 'get_onto_project_graph']
		],
		mustNot: [...NOISE, 'create_onto_goal', 'update_onto_project']
	},
	{
		// Relabeled after the first run: tag_onto_entity @-mentions collaborators;
		// tasks have no label field. Jev scored tag 0.13 and kept task reads +
		// update_onto_task, which is the right read of the catalog.
		id: 'PL06-label-tasks-global',
		surface: 'global',
		message: "tag all my bid desk tasks as 'sales'",
		must: [FIND_TASK],
		mustNot: [...NOISE, 'create_onto_project', 'tag_onto_entity']
	},
	{
		id: 'PL13-tag-collaborator',
		surface: 'project',
		message: 'tag @jim on the pricing doc so he sees the new numbers',
		must: ['tag_onto_entity', FIND_IN_PROJECT],
		mustNot: [...NOISE, 'create_onto_document']
	},
	{
		id: 'PL07-write-a-plan',
		surface: 'project',
		message:
			'write up a plan for the launch: week 1 landing page, week 2 outreach, week 3 onboarding calls',
		must: ['create_onto_plan'],
		mustNot: ['delete_calendar_event', 'search_email_messages']
	},
	{
		id: 'PL08-close-risk',
		surface: 'project',
		message: 'the risk about stripe approval is resolved, close it out',
		must: ['update_onto_risk', ['list_onto_risks', 'search_onto_risks']],
		mustNot: [...NOISE, 'create_onto_risk']
	},
	{
		id: 'PL09-unlink',
		surface: 'project',
		message: "unlink the old research doc from the pricing task, it's not relevant anymore",
		must: ['unlink_onto_edge', FIND_IN_PROJECT],
		mustNot: [...NOISE, 'create_calendar_event']
	},
	{
		id: 'PL10-task-document',
		surface: 'project',
		message: 'attach a doc to the onboarding task with the call script we talked about',
		must: ['create_task_document', FIND_IN_PROJECT],
		mustNot: ['delete_calendar_event', 'search_email_messages', 'web_search']
	},
	{
		id: 'PL11-find-everything-global',
		surface: 'global',
		message: 'find everything I have about referral programs, across tasks, docs, and goals',
		must: [['search_ontology', 'search_all_projects', 'explore_project']],
		mustNot: ['delete_calendar_event', 'create_onto_project', 'create_calendar_event']
	},
	{
		id: 'PL12-goal-achieved',
		surface: 'project',
		message: "mark the 'ship v1' goal as achieved!!",
		must: ['update_onto_goal', ['list_onto_goals', 'search_onto_goals']],
		mustNot: [...NOISE, 'create_onto_goal']
	}
];
