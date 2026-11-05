// Example people and projects for Home D's hero reel. Each story is one person's
// Workspace with one project open, plus the messy note that updates it. The reel
// types the note, then shows the project after BuildOS sorts it: new tasks, a task
// marked done, and a new next step.
//
// Dates are days from today, so the examples never go stale.
import type { Pulse, TaskBucket } from '$lib/components/projects/desktop/desktop-signals';

export type ReelTask = {
	title: string;
	state: 'todo' | 'in_progress';
	/** Days from today. Negative is overdue. */
	due?: number;
	/** Comes from the note: hidden until the note is sorted. */
	added?: boolean;
	/** The note says it's finished: open before, done after. */
	completes?: boolean;
};

export type ReelSideProject = {
	name: string;
	emoji: [string, string];
	pulse: Pulse;
	mix: Record<TaskBucket, number>;
};

export type ReelStory = {
	id: string;
	/** Picker label. */
	chip: string;
	/** Fills "See where your ___ stands." */
	phrase: string;
	person: string;
	role: string;
	project: {
		name: string;
		emoji: [string, string];
		pulse: Pulse;
		reason: string;
		description: string;
		nextStep: string;
		/** The next step after the note is sorted. */
		nextStepAfter: string;
		docs: number;
		goals: number;
		/** Finished tasks before the note. */
		done: number;
		tasks: ReelTask[];
	};
	others: ReelSideProject[];
	note: string;
	/** Placeholder for the page's paste box while this story is showing. */
	prompt: string;
};

const mix = (overdue: number, in_progress: number, scheduled: number, backlog: number) => ({
	overdue,
	in_progress,
	scheduled,
	backlog
});

export const REEL_STORIES: ReelStory[] = [
	{
		id: 'garden',
		chip: 'Backyard garden',
		phrase: 'backyard garden',
		person: 'Marcus',
		role: 'first-time gardener',
		project: {
			name: 'Backyard garden',
			emoji: ['🌱', '🍅'],
			pulse: 'moving',
			reason: 'Finished 3 tasks in the last 14 days',
			description:
				'Turning the side yard into four raised beds. Goal: tomatoes, peppers, and herbs by midsummer.',
			nextStep: 'Get the soil test results back',
			nextStepAfter: "Order 2 yards of garden soil before Saturday's build day",
			docs: 4,
			goals: 1,
			done: 5,
			tasks: [
				{ title: 'Get soil test results back', state: 'in_progress', completes: true },
				{ title: 'Build raised beds 3 and 4', state: 'todo', due: 4 },
				{ title: 'Fix the drip line timer', state: 'todo' },
				{ title: 'Order 2 yards of garden soil', state: 'todo', due: 2, added: true },
				{ title: 'Ask Dave to borrow his truck', state: 'todo', added: true }
			]
		},
		others: [
			{ name: 'Half marathon', emoji: ['🏃', '🏅'], pulse: 'moving', mix: mix(0, 1, 3, 2) },
			{
				name: 'Basement cleanout',
				emoji: ['📦', '🧹'],
				pulse: 'quiet',
				mix: mix(1, 0, 0, 4)
			},
			{
				name: 'Work: vendor switch',
				emoji: ['💼', '🔁'],
				pulse: 'shaping',
				mix: mix(0, 2, 2, 3)
			}
		],
		note: "soil test came back, ph is fine just low nitrogen. need like 2 yards of soil before saturday's build day. ask dave about his truck",
		prompt: 'My garden: two beds built, soil test is back, the drip line is still broken…'
	},
	{
		id: 'novel',
		chip: 'Novel',
		phrase: 'novel',
		person: 'Denise',
		role: 'writing her first fantasy novel',
		project: {
			name: 'Fading Crown',
			emoji: ['👑', '📖'],
			pulse: 'shaping',
			reason: 'Last change today, nothing finished yet',
			description:
				'Fantasy novel. Queen Isolde is losing her magic as the wards fail. Working toward a full draft for beta readers.',
			nextStep: 'Draft Ch. 13, starting at the ferry scene',
			nextStepAfter: "Rewrite the ferry scene from Maya's side",
			docs: 8,
			goals: 1,
			done: 3,
			tasks: [
				{ title: 'Writing block: draft Ch. 13', state: 'in_progress', due: 3 },
				{ title: "Reconcile Maya's motivation in Act II", state: 'todo' },
				{ title: 'Send sampler to critique group', state: 'todo', due: 6 },
				{ title: "Rewrite ferry scene from Maya's side", state: 'todo', added: true },
				{ title: 'Fix the north wards in the magic rules', state: 'todo', added: true }
			]
		},
		others: [
			{
				name: 'Author newsletter',
				emoji: ['💌', '🗞️'],
				pulse: 'shaping',
				mix: mix(0, 1, 1, 2)
			},
			{
				name: 'Short story contest',
				emoji: ['✍️', '🏆'],
				pulse: 'quiet',
				mix: mix(0, 0, 1, 2)
			},
			{
				name: 'Day job: grant report',
				emoji: ['📊', '🗂️'],
				pulse: 'moving',
				mix: mix(0, 2, 2, 1)
			}
		],
		note: "ferry scene feels flat bc it's from isolde's side. try it from maya instead. also isolde can't have seen the north wards yet, fix that in the rules doc",
		prompt: 'My novel: 12 chapters drafted, the middle sags, I keep rewriting chapter 3…'
	},
	{
		id: 'soccer',
		chip: 'Soccer team',
		phrase: 'soccer team',
		person: 'Priya',
		role: "coaches her daughter's U10 team",
		project: {
			name: 'Hornets U10 soccer',
			emoji: ['⚽', '🐝'],
			pulse: 'moving',
			reason: 'Finished 4 tasks in the last 14 days',
			description:
				'12 kids, two practices a week, games on Saturdays. Goal: every kid plays every position by the end of the season.',
			nextStep: "Plan Thursday's passing drills",
			nextStepAfter: 'Text parents: Thursday practice moves to 5:30',
			docs: 3,
			goals: 1,
			done: 9,
			tasks: [
				{ title: "Plan Thursday's passing drills", state: 'in_progress', due: 2 },
				{ title: 'Collect medical forms (3 missing)', state: 'todo', due: -1 },
				{ title: 'Order end-of-season trophies', state: 'todo', due: 12 },
				{ title: 'Find 2 more snack parents', state: 'todo', added: true },
				{
					title: 'Send picture-day reminder (Sat 9 AM)',
					state: 'todo',
					due: 3,
					added: true
				}
			]
		},
		others: [
			{
				name: 'Kitchen remodel',
				emoji: ['🔨', '🍳'],
				pulse: 'shaping',
				mix: mix(0, 1, 2, 5)
			},
			{ name: 'Family reunion', emoji: ['🎉', '🏡'], pulse: 'quiet', mix: mix(0, 0, 1, 3) },
			{ name: 'Work: Q4 launch', emoji: ['🚀', '📈'], pulse: 'moving', mix: mix(1, 3, 2, 2) }
		],
		note: 'practice moving to thurs 5:30 bc of the field lights. still need 2 more snack parents. remind everyone picture day is sat 9am',
		prompt: 'My U10 team: practice times keep changing, I need snack parents, picture day is coming…'
	},
	{
		id: 'school',
		chip: 'School',
		phrase: 'semester',
		person: 'Jordan',
		role: 'college sophomore, five classes',
		project: {
			name: 'Sophomore year',
			emoji: ['🎓', '📚'],
			pulse: 'moving',
			reason: 'Finished 6 tasks in the last 14 days',
			description:
				'Orgo, Stats, Spanish, Bio lab, and a writing seminar. Goal: stay ahead of deadlines and keep a 3.5.',
			nextStep: 'Finish Orgo problem set 7',
			nextStepAfter: 'Confirm the Stats midterm date with Prof. Lin',
			docs: 6,
			goals: 2,
			done: 14,
			tasks: [
				{ title: 'Orgo problem set 7', state: 'in_progress', due: 1 },
				{ title: 'Bio lab report: enzyme kinetics', state: 'todo', due: 4 },
				{ title: 'Spanish oral exam prep', state: 'todo', due: 8 },
				{
					title: 'Email Prof. Lin about the midterm date',
					state: 'todo',
					due: 1,
					added: true
				},
				{
					title: 'Book a library study room for Wednesday',
					state: 'todo',
					due: 1,
					added: true
				}
			]
		},
		others: [
			{
				name: 'Summer internship apps',
				emoji: ['💼', '📝'],
				pulse: 'shaping',
				mix: mix(0, 1, 3, 4)
			},
			{
				name: 'Study abroad application',
				emoji: ['✈️', '🌍'],
				pulse: 'quiet',
				mix: mix(1, 0, 1, 2)
			},
			{ name: 'Club volleyball', emoji: ['🏐', '🗓️'], pulse: 'moving', mix: mix(0, 0, 3, 1) }
		],
		note: 'stats midterm got moved up?? email prof lin to confirm. study group wants wednesday, need a library room. lab report still due friday',
		prompt: 'My semester: two midterms next week, a lab report due Friday, internship apps…'
	},
	{
		id: 'brand',
		chip: 'Brand redesign',
		phrase: 'brand redesign',
		person: 'Sam',
		role: 'runs marketing at a 12-person company',
		project: {
			name: 'Brand redesign',
			emoji: ['🎨', '✨'],
			pulse: 'shaping',
			reason: 'Last change today, nothing finished yet',
			description:
				'New logo, colors, and type for the company relaunch. Goal: every customer-facing asset updated by launch day.',
			nextStep: 'Review logo round 2 with the founders',
			nextStepAfter: 'Send the agency notes: darker green, softer type',
			docs: 7,
			goals: 1,
			done: 6,
			tasks: [
				{
					title: 'Review logo round 2 with founders',
					state: 'in_progress',
					completes: true
				},
				{ title: 'Update the sales deck template', state: 'todo', due: 6 },
				{ title: 'Swap social profile images', state: 'todo' },
				{ title: 'Send agency notes on logo B', state: 'todo', due: 1, added: true },
				{ title: 'Get a printer quote for business cards', state: 'todo', added: true }
			]
		},
		others: [
			{
				name: 'Website refresh',
				emoji: ['🌐', '🖥️'],
				pulse: 'shaping',
				mix: mix(0, 2, 1, 6)
			},
			{ name: 'Q1 campaign', emoji: ['📣', '🎯'], pulse: 'quiet', mix: mix(0, 0, 2, 3) },
			{ name: 'Hire a designer', emoji: ['🧑‍🎨', '🤝'], pulse: 'moving', mix: mix(0, 1, 2, 0) }
		],
		note: 'founders picked logo B but want the green darker and the type less sharp. need new business cards before the conference, get a quote',
		prompt: 'Our rebrand: logo round 2 is in, the deck and site still need new colors…'
	},
	{
		id: 'wedding',
		chip: 'Wedding',
		phrase: 'wedding',
		person: 'Tasha',
		role: 'planning a 120-guest wedding',
		project: {
			name: 'Our wedding',
			emoji: ['💍', '🌸'],
			pulse: 'moving',
			reason: 'Finished 5 tasks in the last 14 days',
			description:
				'120 guests, one weekend, a budget we both agreed on. Goal: every vendor booked by spring.',
			nextStep: 'Finalize the guest list with both families',
			nextStepAfter: 'Book the cake tasting for Saturday at 2',
			docs: 5,
			goals: 2,
			done: 11,
			tasks: [
				{ title: 'Finalize the guest list', state: 'in_progress', due: 5 },
				{ title: 'Pick a photographer (3 quotes)', state: 'todo' },
				{ title: 'Pay the venue deposit', state: 'todo', due: 3 },
				{ title: 'Book cake tasting, Saturday 2 PM', state: 'todo', due: 4, added: true },
				{ title: 'Ask Aunt Rosa about the welcome dinner', state: 'todo', added: true }
			]
		},
		others: [
			{ name: 'Honeymoon', emoji: ['🏝️', '🧳'], pulse: 'shaping', mix: mix(0, 0, 1, 4) },
			{ name: 'Move apartments', emoji: ['📦', '🔑'], pulse: 'quiet', mix: mix(1, 0, 2, 3) },
			{
				name: 'Work: annual review',
				emoji: ['📝', '⭐'],
				pulse: 'moving',
				mix: mix(0, 1, 1, 0)
			}
		],
		note: 'photographer #2 is way over budget, cross them off. cake tasting saturday at 2? aunt rosa offered to host the welcome dinner!!',
		prompt: 'Our wedding: venue booked, guest list is a mess, three photographer quotes…'
	},
	{
		id: 'youtube',
		chip: 'YouTube channel',
		phrase: 'YouTube channel',
		person: 'Theo',
		role: 'starting a cooking channel',
		project: {
			name: 'Noodle night channel',
			emoji: ['🎬', '🍜'],
			pulse: 'moving',
			reason: 'Finished 2 tasks in the last 14 days',
			description:
				'Weeknight noodle recipes in under 20 minutes. Goal: one video a week for 12 weeks straight.',
			nextStep: 'Edit episode 4: dan dan noodles',
			nextStepAfter: 'Reshoot the episode 4 intro in daylight',
			docs: 9,
			goals: 1,
			done: 7,
			tasks: [
				{ title: 'Edit episode 4: dan dan noodles', state: 'in_progress', due: 2 },
				{ title: 'Batch-film episodes 5 and 6', state: 'todo', due: 5 },
				{ title: 'Thumbnails for episodes 5 and 6', state: 'todo' },
				{
					title: 'Reshoot episode 4 intro in daylight',
					state: 'todo',
					due: 1,
					added: true
				},
				{ title: 'Order a lav mic', state: 'todo', added: true }
			]
		},
		others: [
			{
				name: 'Sourdough side hustle',
				emoji: ['🍞', '💵'],
				pulse: 'quiet',
				mix: mix(0, 0, 1, 3)
			},
			{ name: 'Day job', emoji: ['💼', '☕'], pulse: 'moving', mix: mix(0, 2, 3, 1) },
			{ name: 'Apartment setup', emoji: ['🛋️', '🪴'], pulse: 'parked', mix: mix(0, 0, 0, 2) }
		],
		note: 'ep 4 intro looks awful under the kitchen lights, reshoot in daylight. audio is echoey, order a lav mic. 5 and 6 can film sunday',
		prompt: 'My channel: 3 videos up, episode 4 half edited, I keep missing my upload day…'
	},
	{
		id: 'client',
		chip: 'Client launch',
		phrase: 'client launch',
		person: 'Rafael',
		role: 'consultant juggling three clients',
		project: {
			name: 'Northwind site launch',
			emoji: ['🚀', '🌐'],
			pulse: 'moving',
			reason: 'Finished 4 tasks in the last 14 days',
			description:
				'New marketing site for Northwind Outfitters. Goal: launch before their big sale with zero broken links.',
			nextStep: 'QA the checkout flow on mobile',
			nextStepAfter: 'Send Kim the launch-day checklist by Thursday',
			docs: 6,
			goals: 1,
			done: 12,
			tasks: [
				{ title: 'QA checkout on mobile', state: 'in_progress', due: 1 },
				{ title: 'Migrate 40 blog posts', state: 'todo', completes: true },
				{ title: 'Set up redirects from old URLs', state: 'todo', due: 3 },
				{ title: 'Send launch-day checklist to Kim', state: 'todo', due: 2, added: true },
				{ title: 'Invoice phase 2 after sign-off', state: 'todo', added: true }
			]
		},
		others: [
			{ name: 'Acme retainer', emoji: ['🧾', '📅'], pulse: 'moving', mix: mix(0, 1, 2, 1) },
			{
				name: 'Bramble brand audit',
				emoji: ['🔍', '🌿'],
				pulse: 'shaping',
				mix: mix(0, 1, 1, 4)
			},
			{ name: 'Business taxes', emoji: ['🧮', '📁'], pulse: 'quiet', mix: mix(1, 0, 1, 2) }
		],
		note: 'blog migration finally done. kim wants the launch checklist by thursday. invoice phase 2 once they sign off',
		prompt: 'Northwind launch: blog migration half done, client wants a checklist, invoice pending…'
	}
];

/** The story at a position, wrapping around the list. */
export function storyAt(index: number): ReelStory {
	const story = REEL_STORIES[index % REEL_STORIES.length];
	if (!story) throw new Error('Home D reel has no stories');
	return story;
}
