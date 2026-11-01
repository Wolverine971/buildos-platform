// apps/web/src/lib/components/landing/home-variants/fading-crown.ts
/**
 * The featured public example project, "Fading Crown", as the homepage versions show it.
 * Every name below is copied from the live project (GET /api/public/projects/<id>/graph,
 * 2026-11-01), the same one the "Open an example project" preview loads and the homepage
 * screenshots were captured from. Dates are left out on purpose: the project's are fixed
 * and would read as stale, so the page shows relative labels instead.
 */

export const FADING_CROWN_PROJECT_ID = 'e81e7114-b6f7-4013-8052-13c792b6fdc5';

export type ExampleTaskState = 'done' | 'in_progress' | 'todo' | 'blocked';
export type ExampleMilestoneState = 'done' | 'pending';

export const FADING_CROWN = {
	name: 'Fading Crown',
	description:
		'Fantasy novel. Queen Isolde is losing her magic as the wards that protect her kingdom fail. Working toward a complete first draft for beta readers.',
	nextStep: 'Draft Chapter 13 using the beats doc, starting at the ferry scene.',
	goal: 'Complete first draft',
	plan: 'Revision pass: Act II',
	milestones: [
		{ title: 'Act I locked', state: 'pending' as ExampleMilestoneState },
		{ title: 'Full draft to beta readers', state: 'pending' as ExampleMilestoneState }
	],
	risk: 'Magic-rule changes contradict early Act I scenes',
	tasks: [
		{ title: 'Outline Act I beats', state: 'done' },
		{ title: 'Rewrite Ch. 12 opening', state: 'done' },
		{ title: 'Magic system v2: write the hard rules', state: 'done' },
		{ title: "Reconcile Maya's motivation in Act II", state: 'in_progress' },
		{ title: 'Writing block: draft Ch. 13', state: 'todo', when: 'Thu, 3 PM' },
		{ title: 'Send three-chapter sampler to critique group', state: 'todo', priority: 1 },
		{ title: 'Beta-reader pass: chapters 1–14', state: 'todo', priority: 1 },
		{ title: 'Draft query letter', state: 'todo' },
		{ title: 'Map the northern wards', state: 'todo' },
		{ title: 'Research fantasy-friendly literary agents', state: 'todo' },
		{ title: 'Commission cover concept art', state: 'blocked' }
	] satisfies Array<{
		title: string;
		state: ExampleTaskState;
		when?: string;
		priority?: number;
	}>,
	documents: [
		'Fading Crown: project context',
		'Magic system rules v2',
		'Ch. 13 beats',
		'Maya: character arc',
		'Queen Isolde: motive',
		'Ch. 12 opening rewrite notes',
		'Chapter notes',
		'Beta reader shortlist'
	],
	/** The brain dump the project was built from (paraphrased from the homepage screenshot). */
	brainDump:
		"ok so the novel. Fading Crown. Queen Isolde is losing her magic and the wards are failing, that's the spine. Act I is basically locked. Ch 12 opening needed a rewrite (did it). Maya's motivation in act II still doesn't track, she needs a reason to betray her sister that isn't just plot. Magic rules v2 are written but I think they break some early scenes?? Want a full draft to beta readers by mid-Sept. Also need to start thinking about agents + a query letter, and a cover at some point.",
	/** Chat updates shown in the homepage screenshots of this project. */
	updates: [
		{
			say: 'Push the beta-reader pass out a week and bump it to priority 1.',
			result: 'Beta-reader pass: chapters 1–14 → due one week later, priority 1'
		},
		{
			say: 'Move my chapter 13 writing block to Thursday afternoon.',
			result: 'Writing block: draft Ch. 13 → Thu, 3 PM'
		}
	]
} as const;

export const FADING_CROWN_COUNTS = {
	tasks: FADING_CROWN.tasks.length,
	documents: FADING_CROWN.documents.length,
	milestones: FADING_CROWN.milestones.length,
	done: FADING_CROWN.tasks.filter((task) => task.state === 'done').length
};
