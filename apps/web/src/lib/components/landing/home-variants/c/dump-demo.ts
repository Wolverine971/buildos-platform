// apps/web/src/lib/components/landing/home-variants/c/dump-demo.ts
/**
 * Script for the homepage brain-dump demo (BrainDumpDemo.svelte). Two dumps, each written the
 * way people actually think out loud. Marked phrases are what BuildOS picks out; each one flies
 * to the item it becomes (`slot`), and `title` is how it reads once filed.
 *
 * Dump 1 builds "Fading Crown" from nothing; every item name matches the live example project.
 * Dump 2 is a voice note about a different project, plus one line about the book, so the demo
 * shows a single ramble landing in two projects. The other three projects reuse homepage B's
 * illustrative examples.
 */
import type { ExampleTaskState } from '../fading-crown';

export type DemoProjectId = 'fc' | 'channel' | 'bakery' | 'kitchen';

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
	'ok so the novel. ',
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
	", that's the spine. I need to ",
	m({
		id: 'fc-goal',
		text: 'finish the draft',
		kind: 'goal',
		project: 'fc',
		slot: 'fc-goal',
		title: 'Complete first draft'
	}),
	' and get it to ',
	m({
		id: 'fc-ms-beta',
		text: 'beta readers by mid-Sept',
		kind: 'milestone',
		project: 'fc',
		slot: 'fc-ms-beta',
		title: 'Full draft to beta readers'
	}),
	'. ',
	m({
		id: 'fc-ms-act1',
		text: 'Act I is basically locked',
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
	' last week. ',
	m({
		id: 'fc-t-maya',
		text: "Maya's motivation in act II still doesn't track",
		kind: 'task',
		project: 'fc',
		slot: 'fc-t-maya',
		title: "Reconcile Maya's motivation in Act II",
		state: 'in_progress'
	}),
	', she needs a real reason to betray her sister. ',
	m({
		id: 'fc-doc-magic',
		text: 'magic rules v2',
		kind: 'doc',
		project: 'fc',
		slot: 'fc-doc-magic',
		title: 'Magic system rules v2'
	}),
	' are written but ',
	m({
		id: 'fc-risk',
		text: 'I think they break some early scenes??',
		kind: 'risk',
		project: 'fc',
		slot: 'fc-risk',
		title: 'Magic-rule changes contradict early Act I scenes'
	}),
	' ',
	m({
		id: 'fc-next',
		text: 'ch 13 is next, start at the ferry scene',
		kind: 'next',
		project: 'fc',
		slot: 'fc-next',
		title: 'Draft Chapter 13 using the beats doc, starting at the ferry scene.'
	}),
	', ',
	m({
		id: 'fc-doc-beats',
		text: 'beats are in my notes',
		kind: 'doc',
		project: 'fc',
		slot: 'fc-doc-beats',
		title: 'Ch. 13 beats'
	}),
	'. at some point: ',
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
		text: 'a list of agents',
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
	'ok channel stuff while I walk the dog. ',
	m({
		id: 'ch-t-thumb',
		text: 'need to redo the hand plane thumbnail',
		kind: 'task',
		project: 'channel',
		slot: 'ch-t-thumb',
		title: 'Redo the hand plane thumbnail',
		state: 'todo'
	}),
	", it's way too dark. ",
	m({
		id: 'ch-t-film',
		text: 'film the chisel video saturday morning',
		kind: 'task',
		project: 'channel',
		slot: 'ch-t-film',
		title: 'Film the chisel sharpening video',
		state: 'todo',
		when: 'Sat, 9 AM'
	}),
	'. and ',
	m({
		id: 'ch-t-sponsor',
		text: 'email Marcus about the sponsor read',
		kind: 'task',
		project: 'channel',
		slot: 'ch-t-sponsor',
		title: 'Email Marcus about the sponsor read',
		state: 'todo'
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
	channel: {
		id: 'channel',
		name: 'Hand Tool Restoration Channel',
		short: 'Channel',
		summary: 'A YouTube channel restoring old hand tools. Posting every other Friday.',
		goal: 'Post every other Friday through spring',
		milestones: ['First four videos published', '1,000 subscribers'],
		tasks: [
			{ id: 'ch-b1', title: 'Finish the hand plane edit', state: 'in_progress' },
			{ id: 'ch-b2', title: 'Script the chisel sharpening video', state: 'done' },
			{ id: 'ch-b3', title: 'Pick one thumbnail template', state: 'todo' },
			{ id: 'ch-b4', title: 'Rank the nine video ideas', state: 'todo' }
		],
		taskTotal: 8,
		docs: [
			{ id: 'ch-d1', title: 'Video idea bank' },
			{ id: 'ch-d2', title: 'Thumbnail style guide' }
		],
		risk: null,
		next: 'Finish the last 20% of the hand plane edit and publish it Friday.'
	},
	bakery: {
		id: 'bakery',
		name: 'Bakery website launch',
		short: 'Bakery launch',
		summary: 'New site for a bakery client, launching on the 15th.',
		goal: 'Launch the new site on the 15th',
		milestones: ['All content in', 'Site live and launch email sent'],
		tasks: [
			{ id: 'bk-1', title: 'Send a change order for online ordering', state: 'todo' },
			{ id: 'bk-2', title: 'Write the catering page', state: 'in_progress' },
			{ id: 'bk-3', title: 'Get photos from the photographer', state: 'blocked' },
			{ id: 'bk-4', title: 'Get DNS access from the client', state: 'todo' }
		],
		taskTotal: 9,
		docs: [
			{ id: 'bk-d1', title: 'Launch plan' },
			{ id: 'bk-d2', title: 'Copy deck' }
		],
		risk: 'Photos are two weeks late',
		next: 'Send the change order before any work starts on ordering.'
	},
	kitchen: {
		id: 'kitchen',
		name: 'Kitchen renovation',
		short: 'Kitchen',
		summary: 'Kitchen remodel on a $28k budget. Contractor starts February 3.',
		goal: 'Finish the kitchen under $28k',
		milestones: ['Cabinets ordered', 'Demo starts Feb 3'],
		tasks: [
			{ id: 'kt-1', title: 'Ask the city about moving the sink', state: 'todo' },
			{ id: 'kt-2', title: 'Choose cabinets', state: 'in_progress' },
			{ id: 'kt-3', title: 'Decide quartz or butcher block', state: 'todo' },
			{ id: 'kt-4', title: 'Chase the electrician quote', state: 'blocked' }
		],
		taskTotal: 7,
		docs: [
			{ id: 'kt-d1', title: 'Budget' },
			{ id: 'kt-d2', title: 'Contractor notes' }
		],
		risk: 'Budget is already tight',
		next: 'Pick cabinets by mid-January so demo can start Feb 3.'
	}
};

/** Workspace order: Fading Crown top-left, so zooming out reveals the rest around it. */
export const PROJECT_ORDER: DemoProjectId[] = ['fc', 'channel', 'bakery', 'kitchen'];

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
