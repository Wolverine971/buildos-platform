// apps/web/src/lib/components/landing/home-variants/c/dump-demo.ts
/**
 * Script for the homepage brain-dump demo (BrainDumpDemo.svelte). Two dumps, each written the
 * way people actually think out loud. Marked phrases are what BuildOS picks out; each one flies
 * to the item it becomes (`slot`), and `title` is how it reads once filed.
 *
 * Dump 1 builds "Fading Crown" from nothing; every item name matches the live example project.
 * Dump 2 is a voice note about a different project, plus one line about the book, so the demo
 * shows a single ramble landing in two projects. The other three projects match Home D's hero
 * reel (d/project-reel.ts), so the page tells one story.
 */
import type { ExampleTaskState } from '../fading-crown';

export type DemoProjectId = 'fc' | 'soccer' | 'garden' | 'channel';

/** The project the voice note (dump 2) is mostly about; the camera ends there. */
export const DUMP_TWO_PROJECT: DemoProjectId = 'soccer';

export type DemoMarkKind =
	| 'project'
	| 'summary'
	| 'goal'
	| 'milestone'
	| 'task'
	| 'doc'
	| 'risk'
	| 'next'
	| 'update';

export type DemoMark = {
	id: string;
	/** The phrase as written in the dump. */
	text: string;
	kind: DemoMarkKind;
	project: DemoProjectId;
	/** The `data-slot` it lands on. New list items use their own id. */
	slot: string;
	/** The item it becomes. */
	title: string;
	state?: ExampleTaskState;
	when?: string;
};

export type DemoSegment = string | DemoMark;

export type DemoTask = { id: string; title: string; state: ExampleTaskState; when?: string };

export type DemoProject = {
	id: DemoProjectId;
	name: string;
	/** Short name for routing tags and overview labels. */
	short: string;
	summary: string;
	goal: string | null;
	milestones: string[];
	tasks: DemoTask[];
	/** Total tasks in the project; the card shows the first few. */
	taskTotal: number;
	docs: { id: string; title: string }[];
	risk: string | null;
	next: string | null;
};

export const KIND_LABEL: Record<DemoMarkKind, string> = {
	project: 'Project',
	summary: 'Summary',
	goal: 'Goal',
	milestone: 'Milestone',
	task: 'Task',
	doc: 'Doc',
	risk: 'Risk',
	next: 'Next step',
	update: 'Doc update'
};

const m = (mark: DemoMark): DemoMark => mark;

export const DUMP_ONE: DemoSegment[] = [
	'ok the novel, ',
	m({
		id: 'fc-name',
		text: 'Fading Crown',
		kind: 'project',
		project: 'fc',
		slot: 'fc-name',
		title: 'Fading Crown'
	}),
	'. ',
	m({
		id: 'fc-summary',
		text: 'Queen Isolde is losing her magic and the wards are failing',
		kind: 'summary',
		project: 'fc',
		slot: 'fc-summary',
		title: 'Fantasy novel. Queen Isolde is losing her magic as the wards that protect her kingdom fail.'
	}),
	'. need to ',
	m({
		id: 'fc-goal',
		text: 'finish the draft',
		kind: 'goal',
		project: 'fc',
		slot: 'fc-goal',
		title: 'Complete first draft'
	}),
	', ',
	m({
		id: 'fc-ms-beta',
		text: 'beta readers next month',
		kind: 'milestone',
		project: 'fc',
		slot: 'fc-ms-beta',
		title: 'Full draft to beta readers'
	}),
	'. ',
	m({
		id: 'fc-ms-act1',
		text: 'Act I is locked',
		kind: 'milestone',
		project: 'fc',
		slot: 'fc-ms-act1',
		title: 'Act I locked'
	}),
	'. ',
	m({
		id: 'fc-t-ch12',
		text: 'rewrote the ch 12 opening',
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-ch12',
		title: 'Rewrite Ch. 12 opening',
		state: 'done'
	}),
	'. ',
	m({
		id: 'fc-t-maya',
		text: "Maya's motive in act II still doesn't track",
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-maya',
		title: "Reconcile Maya's motivation in Act II",
		state: 'in_progress'
	}),
	'. ',
	m({
		id: 'fc-doc-magic',
		text: 'magic rules v2',
		kind: 'doc',
		project: 'fc',
		slot: 'fc-doc-magic',
		title: 'Magic system rules v2'
	}),
	' done but ',
	m({
		id: 'fc-risk',
		text: 'they might break early scenes??',
		kind: 'risk',
		project: 'fc',
		slot: 'fc-risk',
		title: 'Magic-rule changes contradict early Act I scenes'
	}),
	' ',
	m({
		id: 'fc-next',
		text: 'ch 13 next, start at the ferry scene',
		kind: 'next',
		project: 'fc',
		slot: 'fc-next',
		title: 'Draft Chapter 13 using the beats doc, starting at the ferry scene.'
	}),
	', ',
	m({
		id: 'fc-doc-beats',
		text: 'beats in my notes',
		kind: 'doc',
		project: 'fc',
		slot: 'fc-doc-beats',
		title: 'Ch. 13 beats'
	}),
	'. someday: ',
	m({
		id: 'fc-t-query',
		text: 'query letter',
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-query',
		title: 'Draft query letter',
		state: 'todo'
	}),
	', ',
	m({
		id: 'fc-t-agents',
		text: 'agent list',
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-agents',
		title: 'Research fantasy-friendly literary agents',
		state: 'todo'
	}),
	', ',
	m({
		id: 'fc-t-cover',
		text: 'cover art',
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-cover',
		title: 'Commission cover concept art',
		state: 'todo'
	}),
	'.'
];

export const DUMP_TWO: DemoSegment[] = [
	'soccer stuff, walking the dog. ',
	m({
		id: 'sc-t-time',
		text: 'practice moves to thursday 5:30',
		kind: 'task',
		project: 'soccer',
		slot: 'sc-t-time',
		title: 'Text parents: practice moves to Thursday 5:30',
		state: 'todo'
	}),
	', the field lights are out. ',
	m({
		id: 'sc-t-snack',
		text: 'still need two snack parents',
		kind: 'task',
		project: 'soccer',
		slot: 'sc-t-snack',
		title: 'Find 2 more snack parents',
		state: 'todo'
	}),
	'. ',
	m({
		id: 'sc-t-photo',
		text: 'picture day is saturday at 9',
		kind: 'task',
		project: 'soccer',
		slot: 'sc-t-photo',
		title: 'Send the picture-day reminder',
		state: 'todo',
		when: 'Sat, 9 AM'
	}),
	'. oh and for the book, ',
	m({
		id: 'fc-u-storm',
		text: 'the storm in the ferry scene should hit earlier',
		kind: 'update',
		project: 'fc',
		slot: 'fc-doc-beats',
		title: 'Ch. 13 beats: storm hits earlier'
	}),
	'.'
];

function marksOf(segments: DemoSegment[]): DemoMark[] {
	return segments.filter((segment): segment is DemoMark => typeof segment !== 'string');
}

export const DUMP_ONE_MARKS = marksOf(DUMP_ONE);
export const DUMP_TWO_MARKS = marksOf(DUMP_TWO);

/** Total characters in a dump, for typing. */
export function dumpLength(segments: DemoSegment[]): number {
	return segments.reduce(
		(total, segment) => total + (typeof segment === 'string' ? segment : segment.text).length,
		0
	);
}

/** Fading Crown starts empty: everything on its card arrives from dump 1. */
export const PROJECTS: Record<DemoProjectId, DemoProject> = {
	fc: {
		id: 'fc',
		name: 'Fading Crown',
		short: 'Fading Crown',
		summary: '',
		goal: null,
		milestones: [],
		tasks: [],
		taskTotal: 0,
		docs: [],
		risk: null,
		next: null
	},
	soccer: {
		id: 'soccer',
		name: 'Hornets U10 soccer',
		short: 'Soccer',
		summary: '12 kids, two practices a week, games on Saturdays.',
		goal: 'Every kid plays every position this season',
		milestones: ['Midseason parent meeting', 'End-of-season party'],
		tasks: [
			{ id: 'sc-b1', title: "Plan Thursday's passing drills", state: 'in_progress' },
			{ id: 'sc-b2', title: 'Make the carpool sheet', state: 'done' },
			{ id: 'sc-b3', title: 'Collect medical forms (3 missing)', state: 'todo' },
			{ id: 'sc-b4', title: 'Order end-of-season trophies', state: 'todo' }
		],
		taskTotal: 9,
		docs: [
			{ id: 'sc-d1', title: 'Practice plans' },
			{ id: 'sc-d2', title: 'Parent contact list' }
		],
		risk: 'Three medical forms still missing',
		next: "Plan Thursday's passing drills."
	},
	garden: {
		id: 'garden',
		name: 'Backyard garden',
		short: 'Garden',
		summary: 'Turning the side yard into four raised beds.',
		goal: 'Tomatoes, peppers, and herbs by midsummer',
		milestones: ['Beds 1 and 2 built', 'First planting'],
		tasks: [
			{ id: 'gd-1', title: 'Get soil test results back', state: 'in_progress' },
			{ id: 'gd-2', title: 'Build raised beds 3 and 4', state: 'todo' },
			{ id: 'gd-3', title: 'Fix the drip line timer', state: 'blocked' },
			{ id: 'gd-4', title: 'Pick seeds for the first planting', state: 'done' }
		],
		taskTotal: 8,
		docs: [
			{ id: 'gd-d1', title: 'Bed layout' },
			{ id: 'gd-d2', title: 'Seed list' }
		],
		risk: null,
		next: 'Build raised beds 3 and 4 on Saturday.'
	},
	channel: {
		id: 'channel',
		name: 'Noodle night channel',
		short: 'Channel',
		summary: 'Weeknight noodle recipes in under 20 minutes.',
		goal: 'One video a week for 12 weeks',
		milestones: ['First four episodes up', '1,000 subscribers'],
		tasks: [
			{ id: 'ch-b1', title: 'Edit episode 4: dan dan noodles', state: 'in_progress' },
			{ id: 'ch-b2', title: 'Script episode 5', state: 'done' },
			{ id: 'ch-b3', title: 'Batch-film episodes 5 and 6', state: 'todo' },
			{ id: 'ch-b4', title: 'Thumbnails for episodes 5 and 6', state: 'todo' }
		],
		taskTotal: 8,
		docs: [
			{ id: 'ch-d1', title: 'Recipe list' },
			{ id: 'ch-d2', title: 'Thumbnail style' }
		],
		risk: null,
		next: 'Edit episode 4 and post it Friday.'
	}
};

/** Workspace order: Fading Crown top-left, so zooming out reveals the rest around it. */
export const PROJECT_ORDER: DemoProjectId[] = ['fc', 'soccer', 'garden', 'channel'];

export const CHAPTERS = [
	{
		id: 'dump',
		label: 'Brain dump',
		caption: 'Dump everything. Any order, half-sentences, question marks.'
	},
	{
		id: 'sort',
		label: 'Sorted',
		caption: 'BuildOS picks out each piece and files it where it belongs.'
	},
	{
		id: 'zoom',
		label: 'Zoom out',
		caption: 'That project sits with everything else you have going.'
	},
	{ id: 'again', label: 'Dump again', caption: 'Later, another ramble. This time a voice note.' },
	{
		id: 'route',
		label: 'Routed',
		caption: 'Each piece lands in the right project, even the one about the book.'
	}
] as const;

/** Highlight per kind, shared by the dump text, the flying chips, and the landed items. */
export const KIND_TONE: Record<DemoMarkKind, string> = {
	project: 'bg-foreground/15',
	summary: 'bg-foreground/10',
	goal: 'bg-accent/25',
	milestone: 'bg-success/25',
	task: 'bg-info/25',
	doc: 'bg-warning/25',
	risk: 'bg-destructive/25',
	next: 'bg-accent/35',
	update: 'bg-warning/25'
};
