// docs/research/jev-tool-selection-2026-09-18/audit-cases.ts
// Cases for the 2026-11-13 tool audit. Jev scores a tool from its TOOL_METADATA
// summary; eight summaries described the old engine's tool (the project tool
// "scaffolds goals and tasks", document search was "by title", a document was
// never a note). These check the corrected summaries on the asks they affect.
import type { SelectionCase } from './cases';

const FIND_IN_PROJECT = [
	'search_project',
	'search_onto_tasks',
	'search_onto_documents',
	'list_onto_tasks',
	'list_onto_documents',
	'get_document_tree'
] as const;

export const AUDIT_CASES: readonly SelectionCase[] = [
	{
		id: 'AU01-project-with-goals-and-tasks',
		surface: 'global',
		message:
			'start a new project for my podcast launch. goals: 10 episodes recorded by march and 500 subscribers. first tasks: book a studio, draft the episode list',
		must: ['create_onto_project', 'create_onto_goal', 'create_onto_task'],
		mustNot: ['delete_calendar_event', 'search_email_messages']
	},
	{
		id: 'AU02-save-a-note',
		surface: 'global',
		message:
			'save this as a note: the vendor said net-30 terms, with the deposit due on signing',
		must: ['create_onto_document'],
		mustNot: ['create_onto_project', 'delete_calendar_event']
	},
	{
		id: 'AU03-ping-by-name',
		surface: 'project',
		message: 'ping Sam on the launch checklist task and ask him to confirm the date',
		must: ['tag_onto_entity', FIND_IN_PROJECT],
		mustNot: ['delete_calendar_event', 'create_onto_document']
	},
	{
		id: 'AU04-find-text-in-doc-bodies',
		surface: 'project',
		message:
			"which doc has the refund policy wording? i think it's buried in the body of one of them",
		must: [['search_project', 'search_onto_documents', 'explore_project']],
		mustNot: ['delete_calendar_event', 'update_onto_task']
	},
	{
		id: 'AU05-attach-doc-to-task',
		surface: 'project',
		message: "attach the pricing brief doc to the 'send proposal' task",
		must: ['create_task_document', FIND_IN_PROJECT],
		mustNot: ['delete_calendar_event', 'web_search']
	},
	{
		id: 'AU06-background-staged-change',
		surface: 'project',
		message:
			'do this in the background and stage it for me to review: clean up the task list and merge the duplicates',
		must: ['delegate_task'],
		mustNot: ['delete_calendar_event', 'web_search']
	},
	{
		id: 'AU07-read-a-linked-page',
		surface: 'global',
		message: 'read https://example.com/pricing and tell me what the pro plan costs',
		must: [['web_visit', 'web_navigate']],
		mustNot: ['create_onto_project', 'delete_calendar_event']
	},
	{
		id: 'AU08-project-property',
		surface: 'project',
		message: "what type of project is this set up as, and when's the end date?",
		must: [['get_onto_project_details', 'get_project_overview']],
		mustNot: ['delete_calendar_event', 'tag_onto_entity']
	},
	{
		id: 'AU09-plain-status',
		surface: 'project',
		message: 'where are we on this? quick summary',
		must: ['get_project_overview'],
		mustNot: ['tag_onto_entity', 'delegate_task', 'create_task_document']
	}
];
