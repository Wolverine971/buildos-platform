// apps/web/src/lib/components/landing/home-variants/b/examples.ts
/**
 * Homepage B example notes and the projects shown assembling beside the box. These are
 * hand-written and fixed (no model call): the novel is the real "Fading Crown" example
 * project; the other three are illustrative.
 */
import { FADING_CROWN, type ExampleTaskState } from '../fading-crown';

export type AssemblyTask = { title: string; state: ExampleTaskState; when?: string };

export type AssemblyExample = {
	id: 'novel' | 'youtube' | 'client' | 'renovation';
	chip: string;
	/** How a caption names the example, e.g. "a YouTube channel". */
	subject: string;
	note: string;
	project: {
		name: string;
		summary: string;
		goal: string;
		milestones: string[];
		/** The tasks the card shows, most relevant first. */
		tasks: AssemblyTask[];
		taskTotal: number;
		documents: string[];
		documentTotal: number;
		nextStep: string;
	};
};

const CARD_DOCS = 4;

function fadingCrownTask(title: string): AssemblyTask {
	const task = FADING_CROWN.tasks.find((item) => item.title === title);
	if (!task) throw new Error(`Fading Crown has no task named "${title}"`);
	return { title: task.title, state: task.state, when: 'when' in task ? task.when : undefined };
}

const NOVEL: AssemblyExample = {
	id: 'novel',
	chip: 'A novel',
	subject: 'a novel',
	note: FADING_CROWN.brainDump,
	project: {
		name: FADING_CROWN.name,
		summary: FADING_CROWN.description,
		goal: FADING_CROWN.goal,
		milestones: FADING_CROWN.milestones.map((milestone) => milestone.title),
		tasks: [
			fadingCrownTask("Reconcile Maya's motivation in Act II"),
			fadingCrownTask('Writing block: draft Ch. 13'),
			fadingCrownTask('Beta-reader pass: chapters 1–14'),
			fadingCrownTask('Draft query letter'),
			fadingCrownTask('Rewrite Ch. 12 opening')
		],
		taskTotal: FADING_CROWN.tasks.length,
		documents: FADING_CROWN.documents.slice(0, CARD_DOCS),
		documentTotal: FADING_CROWN.documents.length,
		nextStep: FADING_CROWN.nextStep
	}
};

const YOUTUBE: AssemblyExample = {
	id: 'youtube',
	chip: 'A YouTube channel',
	subject: 'a YouTube channel',
	note: "trying to actually commit to the channel this time. it's hand tool restoration. I have like 9 video ideas sitting in my notes app. want to post every other friday. editing is what kills me, the hand plane video has been at 80% for three weeks. thumbnails are all over the place, need one style. should I do shorts?? goal is 1k subs by spring but honestly I just want to stop starting over every month.",
	project: {
		name: 'Hand Tool Restoration Channel',
		summary:
			'A YouTube channel restoring old hand tools. Posting every other Friday and building toward 1,000 subscribers by spring.',
		goal: 'Post every other Friday through spring',
		milestones: ['First four videos published', '1,000 subscribers'],
		tasks: [
			{ title: 'Finish the hand plane edit', state: 'in_progress', when: 'Tonight' },
			{ title: 'Rank the nine video ideas', state: 'todo' },
			{ title: 'Pick one thumbnail template', state: 'todo' },
			{ title: 'Script the chisel sharpening video', state: 'todo' },
			{ title: 'Test Shorts with three clips', state: 'todo' }
		],
		taskTotal: 8,
		documents: [
			'Channel plan',
			'Video idea bank',
			'Thumbnail style guide',
			'Editing checklist'
		],
		documentTotal: 5,
		nextStep: 'Finish the last 20% of the hand plane edit and publish it Friday.'
	}
};

const CLIENT: AssemblyExample = {
	id: 'client',
	chip: 'A client launch',
	subject: 'a client launch',
	note: "launching the new site for the bakery client on the 15th. copy is basically done except the catering page. still waiting on photos from their photographer, it's been 2 weeks. now they want online ordering?? that was never in scope, I need to send a change order. DNS is apparently managed by the owner's nephew lol. launch email to their list + instagram posts same day.",
	project: {
		name: 'Bakery website launch',
		summary:
			'New website for a bakery client, launching on the 15th with an email and Instagram push the same day.',
		goal: 'Launch the new site on the 15th',
		milestones: ['All content in', 'Site live and launch email sent'],
		tasks: [
			{ title: 'Send a change order for online ordering', state: 'todo', when: 'Today' },
			{ title: 'Write the catering page', state: 'in_progress' },
			{ title: 'Get photos from the photographer', state: 'blocked' },
			{ title: 'Get DNS access from the client', state: 'todo' },
			{ title: 'Draft the launch email and 3 Instagram posts', state: 'todo' }
		],
		taskTotal: 9,
		documents: [
			'Launch plan',
			'Scope and change order notes',
			'Copy deck',
			'Launch day checklist'
		],
		documentTotal: 4,
		nextStep: 'Send the change order for online ordering before any more work starts on it.'
	}
};

const RENOVATION: AssemblyExample = {
	id: 'renovation',
	chip: 'A home renovation',
	subject: 'a home renovation',
	note: "kitchen reno. budget is 28k and I'm already nervous. contractor can start Feb 3 if we pick cabinets by mid-January. still can't decide quartz vs butcher block. do we need a permit to move the sink?? the fridge has to live somewhere during demo. electrician quote still hasn't come back.",
	project: {
		name: 'Kitchen renovation',
		summary:
			'Kitchen remodel on a $28k budget. Contractor starts February 3 once cabinets are chosen.',
		goal: 'Finish the kitchen under $28k',
		milestones: ['Cabinets ordered by mid-January', 'Demo starts February 3'],
		tasks: [
			{
				title: 'Ask the city about a permit to move the sink',
				state: 'todo',
				when: 'This week'
			},
			{ title: 'Choose cabinets', state: 'in_progress', when: 'Mid-Jan' },
			{ title: 'Decide: quartz or butcher block', state: 'todo' },
			{ title: 'Chase the electrician quote', state: 'blocked' },
			{ title: 'Plan where the fridge goes during demo', state: 'todo' }
		],
		taskTotal: 7,
		documents: [
			'Budget tracker',
			'Contractor notes',
			'Countertop comparison',
			'Demo week plan'
		],
		documentTotal: 4,
		nextStep: 'Call the city about the sink permit. The plumbing quote depends on it.'
	}
};

export const ASSEMBLY_EXAMPLES: readonly [AssemblyExample, ...AssemblyExample[]] = [
	NOVEL,
	YOUTUBE,
	CLIENT,
	RENOVATION
];

/** Before and after for the "tell it what changed" demo, on real Fading Crown tasks. */
export const UPDATE_DEMOS = [
	{
		say: FADING_CROWN.updates[0].say,
		task: 'Beta-reader pass: chapters 1–14',
		before: 'Due next week · Priority 2',
		after: 'Due in two weeks · Priority 1'
	},
	{
		say: FADING_CROWN.updates[1].say,
		task: 'Writing block: draft Ch. 13',
		before: 'Wed, 10 AM',
		after: 'Thu, 3 PM'
	}
] as const;
