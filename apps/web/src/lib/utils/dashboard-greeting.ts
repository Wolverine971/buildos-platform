// apps/web/src/lib/utils/dashboard-greeting.ts

export type DashboardGreetingInput = {
	displayName?: string | null;
	date?: Date;
	timezone?: string | null;
	seed?: string | null;
};

export type DashboardTimeOfDay =
	| 'late_night'
	| 'early_morning'
	| 'morning'
	| 'midday'
	| 'afternoon'
	| 'evening';

export type DashboardDateContext = {
	year: number;
	month: number;
	day: number;
	weekday: number;
	weekdayName: string;
	hour: number;
	timeOfDay: DashboardTimeOfDay;
	dateKey: string;
	specialDays: string[];
	primarySpecialDay: string | null;
};

type GreetingTemplate = (name: string, context: DashboardDateContext) => string;

const DEFAULT_TIMEZONE = 'UTC';
const FALLBACK_GREETING: GreetingTemplate = (name) => `Good to see you, ${name}.`;

const WEEKDAY_INDEX_BY_NAME: Record<string, number> = {
	Sunday: 0,
	Monday: 1,
	Tuesday: 2,
	Wednesday: 3,
	Thursday: 4,
	Friday: 5,
	Saturday: 6
};

const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

const TIME_OF_DAY_LABELS: Record<DashboardTimeOfDay, string> = {
	late_night: 'late night',
	early_morning: 'early morning',
	morning: 'morning',
	midday: 'midday',
	afternoon: 'afternoon',
	evening: 'evening'
};

const FIXED_SPECIAL_DAYS: Record<string, string[]> = {
	'01-01': ["New Year's Day"],
	'02-02': ['Groundhog Day'],
	'02-09': ['National Pizza Day'],
	'02-14': ["Valentine's Day"],
	'03-10': ['Mario Day'],
	'03-17': ["St. Patrick's Day"],
	'04-01': ["April Fools' Day"],
	'04-15': ['U.S. Tax Day'],
	'04-27': ['World Design Day'],
	'05-04': ['Star Wars Day'],
	'05-27': ['National Creativity Day'],
	'06-14': ['Flag Day'],
	'06-19': ['Juneteenth'],
	'06-20': ['World Productivity Day'],
	'06-21': ['World Selfie Day'],
	'07-04': ['Independence Day'],
	'07-17': ['World Emoji Day'],
	'08-19': ['World Photography Day'],
	'09-11': ['Patriot Day'],
	'09-17': ['Constitution Day'],
	'09-29': ['National Coffee Day'],
	'10-10': ['World Mental Health Day'],
	'10-31': ['Halloween'],
	'11-11': ['Veterans Day'],
	'12-25': ['Christmas Day'],
	'12-31': ["New Year's Eve"]
};

const BUSINESS_MARKERS: Record<string, string[]> = {
	'01-01': ['Start of Q1 / Fiscal Year'],
	'04-01': ['Start of Q2'],
	'07-01': ['Start of Q3'],
	'10-01': ['Start of Q4'],
	'09-15': ['Q3 Estimated Tax Due'],
	'10-15': ['Extended Tax Filing Deadline']
};

const SPECIAL_DAY_GREETING_BANKS: Record<string, GreetingTemplate[]> = {
	"New Year's Day": [
		(name) =>
			`Happy New Year, ${name}. Fresh calendar smell, suspiciously ambitious tab count.`,
		(name) => `New year, ${name}. The blank calendar is acting innocent.`
	],
	'Groundhog Day': [
		(name) =>
			`Happy Groundhog Day, ${name}. If the same task appears again, we call it tradition.`,
		(name) => `Groundhog Day check-in, ${name}. Repeating patterns are now festive.`
	],
	'National Pizza Day': [
		(name) =>
			`Happy National Pizza Day, ${name}. Today's plan has extra focus and no pineapple discourse.`,
		(name) => `Pizza Day, ${name}. Slice the work into triangles and pretend that was strategy.`
	],
	"Valentine's Day": [
		(name) => `Happy Valentine's Day, ${name}. May your tasks be emotionally available.`,
		(name) =>
			`Valentine's Day, ${name}. Your dashboard brought tiny paper hearts for the priorities.`
	],
	'Mario Day': [
		(name) => `Happy Mario Day, ${name}. Tiny jumps count.`,
		(name) => `Mario Day, ${name}. Power up, then tackle one question mark block at a time.`
	],
	"St. Patrick's Day": [
		(name) =>
			`Happy St. Patrick's Day, ${name}. May your priorities line up without making you chase them.`,
		(name) =>
			`St. Patrick's Day, ${name}. The plan is wearing green and pretending it was organized all along.`
	],
	"April Fools' Day": [
		(name) =>
			`Happy April Fools' Day, ${name}. The dashboard promises zero fake buttons today.`,
		(name) =>
			`April Fools' Day, ${name}. Your backlog says it was "just kidding" about half of that.`
	],
	'U.S. Tax Day': [
		(name) => `Tax Day, ${name}. Hydrate, document, survive.`,
		(name) => `Tax Day, ${name}. Today's vibe is receipts, resolve, and one tiny win.`
	],
	'World Design Day': [
		(name) =>
			`Happy World Design Day, ${name}. May every weird layout reveal its true feelings.`,
		(name) => `World Design Day, ${name}. The pixels have agreed to be reasonable. Mostly.`
	],
	'Star Wars Day': [
		(name) => `May the 4th be productive, ${name}. The backlog is not your father.`,
		(name) => `Star Wars Day, ${name}. Use the focus. The tabs can wait.`
	],
	'National Creativity Day': [
		(name) =>
			`Happy National Creativity Day, ${name}. The messy idea pile is officially decorative.`,
		(name) => `Creativity Day, ${name}. Weird first drafts are wearing formal attire today.`
	],
	'Flag Day': [
		(name) => `Flag Day, ${name}. Plant one tiny flag in the work and call that progress.`,
		(name) => `Happy Flag Day, ${name}. Pick a hill, preferably a small and useful one.`
	],
	Juneteenth: [
		(name) => `Honoring Juneteenth, ${name}. Make room for reflection and real progress today.`,
		(name) => `Juneteenth, ${name}. A steady day for meaning, memory, and intentional work.`
	],
	'World Productivity Day': [
		(name) => `World Productivity Day, ${name}. Suspiciously on-brand, but we will allow it.`,
		(name) =>
			`Happy World Productivity Day, ${name}. One clean next step is the whole ceremony.`
	],
	'World Selfie Day': [
		(name) =>
			`World Selfie Day, ${name}. The dashboard checked its angles and found your next step.`,
		(name) => `Selfie Day, ${name}. Face the work, but maybe from your good side.`
	],
	'Independence Day': [
		(name) => `Happy Independence Day, ${name}. Free yourself from one lingering tiny task.`,
		(name) => `Independence Day, ${name}. Big sky, small list, excellent ratio.`
	],
	'World Emoji Day': [
		(name) => `World Emoji Day, ${name}. Every task gets one facial expression and no more.`,
		(name) => `Emoji Day, ${name}. The plan is expressive, but still legally a plan.`
	],
	'World Photography Day': [
		(name) => `World Photography Day, ${name}. Focus, frame, ship the thing.`,
		(name) => `Photography Day, ${name}. The blur is artistic until the deadline arrives.`
	],
	'Patriot Day': [
		(name) => `Patriot Day, ${name}. A quieter greeting for a day that asks for remembrance.`,
		(name) => `Today carries weight, ${name}. Keep the work steady and the attention kind.`
	],
	'Constitution Day': [
		(name) =>
			`Constitution Day, ${name}. Your tasks demand due process and one clear next action.`,
		(name) => `Constitution Day, ${name}. The plan has articles, sections, and coffee.`
	],
	'National Coffee Day': [
		(name) => `National Coffee Day, ${name}. The priorities are lightly caffeinated.`,
		(name) => `Coffee Day, ${name}. Sip first, then negotiate with the task stack.`
	],
	'World Mental Health Day': [
		(name) =>
			`World Mental Health Day, ${name}. Gentle pace, honest priorities, no heroics required.`,
		(name) => `Mental Health Day, ${name}. The best plan is allowed to be humane.`
	],
	Halloween: [
		(name) => `Happy Halloween, ${name}. The overdue list is wearing a tiny cape.`,
		(name) => `Halloween, ${name}. Spooky thought: one focused hour might fix a lot.`
	],
	'Veterans Day': [
		(name) => `Veterans Day, ${name}. Respectful pause, steady work, clear priorities.`,
		(name) => `Honoring Veterans Day, ${name}. Keep the signal clean and the day intentional.`
	],
	'Christmas Day': [
		(name) =>
			`Merry Christmas, ${name}. May your checklist be optional and your cocoa persuasive.`,
		(name) => `Christmas Day, ${name}. The dashboard brought a tiny bow for your priorities.`
	],
	"New Year's Eve": [
		(name) => `Happy New Year's Eve, ${name}. Tie a tiny bow on the chaos.`,
		(name) => `New Year's Eve, ${name}. Close one loop and let the rest wait in line.`
	],
	'Martin Luther King Jr. Day': [
		(name) => `MLK Day, ${name}. Make the work worthy of the time it gets.`,
		(name) => `Honoring MLK Day, ${name}. Choose one useful action with real weight.`
	],
	"Presidents' Day": [
		(name) =>
			`Presidents' Day, ${name}. Executive decision: one priority gets the fancy chair.`,
		(name) => `Presidents' Day, ${name}. The agenda is in session.`
	],
	"Mother's Day": [
		(name) => `Happy Mother's Day, ${name}. The plan called its mother and said thank you.`,
		(name) => `Mother's Day, ${name}. Gentle goals, warm notes, maybe fewer meetings.`
	],
	'Memorial Day': [
		(name) => `Memorial Day, ${name}. A slower greeting for remembrance and perspective.`,
		(name) => `Honoring Memorial Day, ${name}. Keep the day spacious where you can.`
	],
	"Father's Day": [
		(name) =>
			`Happy Father's Day, ${name}. The dashboard is pretending it knows how to hold a flashlight.`,
		(name) => `Father's Day, ${name}. Measure twice, do one actually useful thing.`
	],
	'Labor Day': [
		(name) => `Happy Labor Day, ${name}. Rest is a feature, not a bug.`,
		(name) => `Labor Day, ${name}. The work can respect the worker today.`
	],
	'Columbus Day': [
		(name) => `Monday marker, ${name}. Navigate toward one clear next step.`,
		(name) => `Today gets a calendar footnote, ${name}. Your plan gets a clean starting line.`
	],
	Thanksgiving: [
		(name) =>
			`Happy Thanksgiving, ${name}. Gratitude first, leftovers later, tiny plan if needed.`,
		(name) => `Thanksgiving, ${name}. The dashboard is thankful for short lists.`
	],
	'Black Friday': [
		(name) => `Black Friday, ${name}. Your attention does not need a doorbuster deal.`,
		(name) =>
			`Black Friday, ${name}. Put the impulse buys in a parking lot with the impulse tasks.`
	],
	'National Entrepreneurs Day': [
		(name) =>
			`Entrepreneurs Day, ${name}. Tiny experiment, sharp question, brave little spreadsheet.`,
		(name) =>
			`National Entrepreneurs Day, ${name}. Build the smallest proof that refuses to be theoretical.`
	],
	'National Donut Day': [
		(name) =>
			`Donut Day, ${name}. The plan has a hole in the middle, but we can work with that.`,
		(name) => `Happy Donut Day, ${name}. Round goals, sweet constraints, one next bite.`
	],
	Easter: [
		(name) => `Happy Easter, ${name}. May one useful idea pop out of hiding.`,
		(name) => `Easter, ${name}. The plan found the bright-colored next step.`
	],
	'Start of Q1 / Fiscal Year': [
		(name) => `Welcome to Q1, ${name}. The spreadsheet has put on its optimistic shoes.`,
		(name) => `Q1 begins, ${name}. Big ambition, tiny first step.`
	],
	'Start of Q2': [
		(name) =>
			`Welcome to Q2, ${name}. Tiny quarterly ambitions, meet reality with a clipboard.`,
		(name) => `Q2 begins, ${name}. The plan has requested a fresh marker.`
	],
	'Start of Q3': [
		(name) =>
			`Welcome to Q3, ${name}. Halfway through the year and still suspiciously possible.`,
		(name) =>
			`Q3 begins, ${name}. The calendar is wearing sunglasses and asking for priorities.`
	],
	'Start of Q4': [
		(name) => `Welcome to Q4, ${name}. The year is entering its dramatic third act.`,
		(name) =>
			`Q4 begins, ${name}. Choose the few things future-you will actually thank you for.`
	],
	'Q3 Estimated Tax Due': [
		(name) => `Estimated tax day, ${name}. The finances would like a calm adult in the room.`,
		(name) => `Q3 tax marker, ${name}. Receipts, resolve, then back to the good work.`
	],
	'Extended Tax Filing Deadline': [
		(name) =>
			`Extended tax deadline, ${name}. May every document be exactly where it claimed to be.`,
		(name) => `Tax extension day, ${name}. Close the loop, then close the tab.`
	],
	'First Day of Spring': [
		(name) => `Spring is here, ${name}. The ideas are thawing and pretending they had a plan.`,
		(name) => `First day of spring, ${name}. Fresh starts are allowed to be tiny.`
	],
	'First Day of Summer': [
		(name) => `First day of summer, ${name}. Big sun, small focused list.`,
		(name) => `Summer starts, ${name}. Keep the plan bright and portable.`
	],
	'First Day of Fall': [
		(name) => `First day of fall, ${name}. Crisp air, crisp priorities.`,
		(name) => `Fall begins, ${name}. The calendar put on a sweater and asked for a clean list.`
	],
	'First Day of Winter': [
		(name) => `First day of winter, ${name}. Cozy focus mode has entered the chat.`,
		(name) => `Winter starts, ${name}. Warm drink, cold facts, clear next step.`
	]
};

const GENERIC_SPECIAL_DAY_GREETINGS: GreetingTemplate[] = [
	(name, context) =>
		`${context.primarySpecialDay} has entered the chat, ${name}. Very official, very interesting.`,
	(name, context) =>
		`Happy ${context.primarySpecialDay}, ${name}. The calendar wore a tiny sash today.`
];

const TIME_AWARE_SPECIAL_DAY_GREETINGS: GreetingTemplate[] = [
	(name, context) =>
		`${formatTimeOfDayLabel(context.timeOfDay)} edition, ${name}: ${context.primarySpecialDay} is on the calendar, and your context graph brought tiny confetti.`,
	(name, context) =>
		`${timeGreetingWord(context)}, ${name}. It is ${context.primarySpecialDay}, so the dashboard is being festive and only a little smug.`
];

const MONDAY_GREETINGS: GreetingTemplate[] = [
	(name) =>
		`Monday reporting for duty, ${name}. It brought a clipboard and questionable confidence.`,
	(name) => `Good morning, ${name}. Monday is trying to look organized, so let's humor it.`,
	(name) => `Hey ${name}. New week, fresh context, same charmingly ambitious brain.`,
	(name) => `Monday mode, ${name}. Small first move, then we negotiate with the rest.`,
	(name) => `Welcome back, ${name}. The week is still soft clay. Poke it into shape.`
];

const FRIDAY_GREETINGS: GreetingTemplate[] = [
	(name) =>
		`Happy Friday, ${name}. The finish line is waving from an ergonomically questionable chair.`,
	(name) =>
		`Friday found you, ${name}. Let's make one clean move before the weekend steals the aux cord.`,
	(name) => `Good to see you, ${name}. Friday says the list should be short and a little smug.`,
	(name) => `Friday mode, ${name}. Ship the tiny thing and look mysterious about it.`,
	(name) => `Hey ${name}. The week is asking for a receipt. One useful win will do.`
];

const WEEKEND_GREETINGS: GreetingTemplate[] = [
	(name) => `Weekend dashboard check, ${name}. Keep it light unless the muse brought snacks.`,
	(name) => `Hey ${name}. Weekend mode means the plan must earn its spot on the couch.`,
	(name) =>
		`Good to see you, ${name}. The weekend list should fit in one hand and leave room for coffee.`,
	(name) =>
		`Weekend workbench is open, ${name}. Tiny projects only, unless inspiration gets dramatic.`,
	(name) => `Hello ${name}. Saturday-and-Sunday energy demands fewer tabs and better snacks.`
];

const MIDWEEK_GREETINGS: GreetingTemplate[] = [
	(name) => `Midweek check-in, ${name}. The plot has thickened, but the next step is still tiny.`,
	(name) => `Hey ${name}. Wednesday is basically a bridge with email.`,
	(name) =>
		`Good to see you, ${name}. Midweek momentum is just yesterday's chaos wearing a belt.`,
	(name) => `Midweek mode, ${name}. Sort the signal, spare the drama.`,
	(name) => `Hello ${name}. The week has a middle, and somehow you are standing in it.`
];

const MONTH_START_GREETINGS: GreetingTemplate[] = [
	(name) => `New month, ${name}. The calendar has reset its tiny scoreboard.`,
	(name) => `Fresh month, ${name}. Pick a theme before the tabs pick one for you.`,
	(name) => `Good to see you, ${name}. New month energy pairs well with one honest priority.`,
	(name) => `Month one-liner, ${name}: fewer vague quests, more small wins.`,
	(name) => `Welcome to a fresh page, ${name}. Try not to intimidate it immediately.`
];

const GENERAL_GREETINGS: GreetingTemplate[] = [
	(name) => `Good to see you, ${name}. The idea kettle is whistling.`,
	(name) => `Hey ${name}. Your dashboard brewed a small pot of momentum.`,
	(name) => `Hello ${name}. The task pile has been lightly fluffed for readability.`,
	(name) => `Welcome back, ${name}. The plan is standing near the door with shoes on.`,
	(name) => `Hey ${name}. Your ideas are wearing tiny name tags today.`,
	(name) => `Good morning, ${name}. The ambition drawer is open, but only take what fits.`,
	(name) => `Hi ${name}. The context shelves have been dusted and are pretending to be elegant.`,
	(name) => `Hello ${name}. Today's agenda has requested a calm voice and a firm boundary.`,
	(name) => `Welcome back, ${name}. The next step is probably smaller than it looks.`,
	(name) => `Hey ${name}. Your scattered thoughts have agreed to stand in a loose line.`,
	(name) => `Good to see you, ${name}. The dashboard found your focus under a stack of almosts.`,
	(name) => `Hi ${name}. Let's turn a vague blob into a suspiciously useful little plan.`,
	(name) => `Hello ${name}. The work is wearing its least intimidating hat today.`,
	(name) => `Hey ${name}. One useful next step is already doing stretches.`,
	(name) =>
		`Good to see you, ${name}. The day brought several tabs, but only one gets to be important.`
];

const TIME_OF_DAY_GREETINGS: Record<DashboardTimeOfDay, GreetingTemplate[]> = {
	early_morning: [
		(name) =>
			`Early morning, ${name}. You have the coffee, the context, and one reasonably behaved next step.`,
		(name) =>
			`Rise and lightly structure, ${name}. The brain dump inbox is doing gentle stretches.`,
		(name) =>
			`Early start, ${name}. The daily brief is still tying its shoes, but the signal is awake.`
	],
	morning: [
		(name) =>
			`Good morning, ${name}. Your brain-dump floor has one useful little plan peeking out.`,
		(name) =>
			`Morning, ${name}. The project graph is caffeinated and making suspiciously good eye contact.`,
		(name) => `Good morning, ${name}. Your context has been sorted into tiny responsible piles.`
	],
	midday: [
		(name) =>
			`Midday checkpoint, ${name}. The dashboard packed a sandwich and one clean next move.`,
		(name) =>
			`Lunch-hour logic, ${name}. One bite-sized task beats trying to eat the whole buffet.`,
		(name) =>
			`Midday, ${name}. The ontology says things are connected. Brave claim, but useful.`
	],
	afternoon: [
		(name) =>
			`Afternoon, ${name}. Your focus meter is at "please be specific," which is rude but useful.`,
		(name) =>
			`Afternoon check-in, ${name}. Project Lens energy says follow the next thread, not all of them.`,
		(name) => `Good afternoon, ${name}. The task pile has entered its second-act character arc.`
	],
	evening: [
		(name) => `Evening, ${name}. One loop is worth closing; the rest can stop auditioning.`,
		(name) =>
			`Evening mode, ${name}. The daily brief is off duty, but the context graph is still gossiping.`,
		(name) => `Good evening, ${name}. Tiny wrap-up energy beats heroic spreadsheet theater.`
	],
	late_night: [
		(name) =>
			`Late night, ${name}. Put the scary tasks in pajama mode and capture only what matters.`,
		(name) =>
			`Late-night dashboard visit, ${name}. The tabs are awake, but they do not get to vote.`,
		(name) => `After-hours check-in, ${name}. Capture the thought, spare the future brain.`
	]
};

const BUILDOS_GREETINGS: GreetingTemplate[] = [
	(name) =>
		`Hey ${name}. Your loose brain confetti is closer to becoming something that respects gravity.`,
	(name) =>
		`Welcome back, ${name}. Project Lens mode: notice the next useful thread and let the rest wait.`,
	(name) =>
		`Hi ${name}. Your project graph has opinions today, but at least they are organized opinions.`,
	(name) =>
		`Good to see you, ${name}. Your ontology has connected three dots, which is plenty for a Tuesday-shaped brain.`,
	(name) => `Hey ${name}. Keep the daily brief energy: one small, legally actionable next step.`,
	(name) =>
		`Hello ${name}. There is probably a task hiding inside that thought, wearing a tiny clipboard.`,
	(name) =>
		`Welcome back, ${name}. The context graph says everything is related, which is annoying but accurate.`,
	(name) =>
		`Hi ${name}. Today's brain dump residue has been composted into premium next-step soil.`
];

function normalizeDisplayName(displayName: string | null | undefined): string {
	const normalized = (displayName ?? '').trim().replace(/\s+/g, ' ');
	return normalized || 'there';
}

function getSafeDate(date: Date | undefined): Date {
	if (date instanceof Date && Number.isFinite(date.getTime())) {
		return date;
	}
	return new Date();
}

function getWeekdayName(weekday: number): string {
	return WEEKDAY_NAMES[weekday] ?? 'Sunday';
}

function getSafeHour(hour: number, fallbackHour: number): number {
	const candidate = Number.isFinite(hour) ? hour : fallbackHour;
	const normalized = Math.trunc(candidate) % 24;
	return normalized >= 0 ? normalized : normalized + 24;
}

function getTimeOfDay(hour: number): DashboardTimeOfDay {
	if (hour >= 0 && hour < 5) return 'late_night';
	if (hour >= 5 && hour < 9) return 'early_morning';
	if (hour >= 9 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 14) return 'midday';
	if (hour >= 14 && hour < 17) return 'afternoon';
	if (hour >= 17 && hour < 21) return 'evening';
	return 'late_night';
}

function formatTimeOfDayLabel(timeOfDay: DashboardTimeOfDay): string {
	return TIME_OF_DAY_LABELS[timeOfDay];
}

function timeGreetingWord(context: DashboardDateContext): string {
	switch (context.timeOfDay) {
		case 'late_night':
			return 'Late night';
		case 'early_morning':
			return 'Early morning';
		case 'morning':
			return 'Good morning';
		case 'midday':
			return 'Midday';
		case 'afternoon':
			return 'Good afternoon';
		case 'evening':
			return 'Good evening';
	}
}

function getZonedDateParts(
	date: Date,
	timezone: string | null | undefined
): Omit<DashboardDateContext, 'specialDays' | 'primarySpecialDay'> {
	const safeTimezone = timezone?.trim() || DEFAULT_TIMEZONE;

	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: safeTimezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			weekday: 'long',
			hour: '2-digit',
			hourCycle: 'h23'
		});
		const parts = Object.fromEntries(
			formatter.formatToParts(date).map((part) => [part.type, part.value])
		);
		const year = Number(parts.year);
		const month = Number(parts.month);
		const day = Number(parts.day);
		const fallbackWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
		const weekdayName = parts.weekday ?? getWeekdayName(fallbackWeekday);
		const weekday = WEEKDAY_INDEX_BY_NAME[weekdayName] ?? fallbackWeekday;
		const hour = getSafeHour(Number(parts.hour), date.getUTCHours());

		return {
			year,
			month,
			day,
			weekday,
			weekdayName,
			hour,
			timeOfDay: getTimeOfDay(hour),
			dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
		};
	} catch {
		if (safeTimezone === DEFAULT_TIMEZONE) {
			const year = date.getUTCFullYear();
			const month = date.getUTCMonth() + 1;
			const day = date.getUTCDate();
			const weekday = date.getUTCDay();
			const hour = date.getUTCHours();
			return {
				year,
				month,
				day,
				weekday,
				weekdayName: getWeekdayName(weekday),
				hour,
				timeOfDay: getTimeOfDay(hour),
				dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
			};
		}

		return getZonedDateParts(date, DEFAULT_TIMEZONE);
	}
}

function getNthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
	const firstDay = new Date(year, monthIndex, 1);
	const offset = (7 + weekday - firstDay.getDay()) % 7;
	return new Date(year, monthIndex, 1 + offset + 7 * (n - 1));
}

function getLastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): Date {
	const lastDay = new Date(year, monthIndex + 1, 0);
	const offset = (7 + lastDay.getDay() - weekday) % 7;
	return new Date(year, monthIndex + 1, 0 - offset);
}

function getEasterDate(year: number): Date {
	const floor = Math.floor;
	const goldenNumber = year % 19;
	const century = floor(year / 100);
	const h =
		(century - floor(century / 4) - floor((8 * century + 13) / 25) + 19 * goldenNumber + 15) %
		30;
	const i = h - floor(h / 28) * (1 - floor(29 / (h + 1)) * floor((21 - goldenNumber) / 11));
	const j = (year + floor(year / 4) + i + 2 - century + floor(century / 4)) % 7;
	const l = i - j;
	const monthIndex = 3 + floor((l + 40) / 44) - 1;
	const day = l + 28 - 31 * floor(monthIndex / 4);
	return new Date(year, monthIndex, day);
}

function dateMatchesParts(date: Date, month: number, day: number): boolean {
	return date.getMonth() + 1 === month && date.getDate() === day;
}

function getSpecialDaysForParts(year: number, month: number, day: number): string[] {
	const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	const specialDays: string[] = [];

	specialDays.push(...(FIXED_SPECIAL_DAYS[mmdd] ?? []));

	const movableSpecialDays = [
		{ name: 'Martin Luther King Jr. Day', date: getNthWeekdayOfMonth(year, 0, 1, 3) },
		{ name: "Presidents' Day", date: getNthWeekdayOfMonth(year, 1, 1, 3) },
		{ name: "Mother's Day", date: getNthWeekdayOfMonth(year, 4, 0, 2) },
		{ name: 'Memorial Day', date: getLastWeekdayOfMonth(year, 4, 1) },
		{ name: "Father's Day", date: getNthWeekdayOfMonth(year, 5, 0, 3) },
		{ name: 'Labor Day', date: getNthWeekdayOfMonth(year, 8, 1, 1) },
		{ name: 'Columbus Day', date: getNthWeekdayOfMonth(year, 9, 1, 2) },
		{ name: 'Thanksgiving', date: getNthWeekdayOfMonth(year, 10, 4, 4) },
		{
			name: 'Black Friday',
			date: new Date(getNthWeekdayOfMonth(year, 10, 4, 4).getTime() + 86400000)
		},
		{ name: 'National Entrepreneurs Day', date: getNthWeekdayOfMonth(year, 10, 2, 3) },
		{ name: 'National Donut Day', date: getNthWeekdayOfMonth(year, 5, 5, 1) },
		{ name: 'Easter', date: getEasterDate(year) }
	];

	for (const specialDay of movableSpecialDays) {
		if (dateMatchesParts(specialDay.date, month, day)) {
			specialDays.push(specialDay.name);
		}
	}

	specialDays.push(...(BUSINESS_MARKERS[mmdd] ?? []));

	const seasonalMarkers = [
		{ name: 'First Day of Spring', date: new Date(year, 2, 20) },
		{ name: 'First Day of Summer', date: new Date(year, 5, 20) },
		{ name: 'First Day of Fall', date: new Date(year, 8, 22) },
		{ name: 'First Day of Winter', date: new Date(year, 11, 21) }
	];

	for (const marker of seasonalMarkers) {
		if (dateMatchesParts(marker.date, month, day)) {
			specialDays.push(marker.name);
		}
	}

	return specialDays;
}

function stableHash(input: string): number {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pickTemplate(templates: GreetingTemplate[], seed: string): GreetingTemplate {
	if (templates.length === 0) return FALLBACK_GREETING;
	return templates[stableHash(seed) % templates.length] ?? FALLBACK_GREETING;
}

function getGreetingBank(context: DashboardDateContext): {
	key: string;
	templates: GreetingTemplate[];
} {
	const timeTemplates = TIME_OF_DAY_GREETINGS[context.timeOfDay];

	if (context.primarySpecialDay) {
		return {
			key: `special:${context.primarySpecialDay}:${context.timeOfDay}`,
			templates:
				SPECIAL_DAY_GREETING_BANKS[context.primarySpecialDay]?.concat(
					TIME_AWARE_SPECIAL_DAY_GREETINGS
				) ?? GENERIC_SPECIAL_DAY_GREETINGS.concat(TIME_AWARE_SPECIAL_DAY_GREETINGS)
		};
	}

	if (context.day === 1) {
		return {
			key: `month-start:${context.timeOfDay}`,
			templates: MONTH_START_GREETINGS.concat(timeTemplates, BUILDOS_GREETINGS)
		};
	}

	if (context.weekday === 1) {
		return {
			key: `monday:${context.timeOfDay}`,
			templates: MONDAY_GREETINGS.concat(timeTemplates, BUILDOS_GREETINGS)
		};
	}

	if (context.weekday === 3) {
		return {
			key: `midweek:${context.timeOfDay}`,
			templates: MIDWEEK_GREETINGS.concat(timeTemplates, BUILDOS_GREETINGS)
		};
	}

	if (context.weekday === 5) {
		return {
			key: `friday:${context.timeOfDay}`,
			templates: FRIDAY_GREETINGS.concat(timeTemplates, BUILDOS_GREETINGS)
		};
	}

	if (context.weekday === 0 || context.weekday === 6) {
		return {
			key: `weekend:${context.timeOfDay}`,
			templates: WEEKEND_GREETINGS.concat(timeTemplates, BUILDOS_GREETINGS)
		};
	}

	return {
		key: `general:${context.timeOfDay}`,
		templates: timeTemplates.concat(BUILDOS_GREETINGS, GENERAL_GREETINGS)
	};
}

export function getDashboardDateContext(
	date: Date = new Date(),
	timezone?: string | null
): DashboardDateContext {
	const safeDate = getSafeDate(date);
	const dateParts = getZonedDateParts(safeDate, timezone);
	const specialDays = getSpecialDaysForParts(dateParts.year, dateParts.month, dateParts.day);

	return {
		...dateParts,
		specialDays,
		primarySpecialDay: specialDays[0] ?? null
	};
}

export function getDashboardSpecialDays(
	date: Date = new Date(),
	timezone?: string | null
): string[] {
	return getDashboardDateContext(date, timezone).specialDays;
}

export function getDashboardGreeting(input: DashboardGreetingInput = {}): string {
	const displayName = normalizeDisplayName(input.displayName);
	const context = getDashboardDateContext(input.date ?? new Date(), input.timezone);
	const { key, templates } = getGreetingBank(context);
	const template = pickTemplate(
		templates,
		`${context.dateKey}:${input.seed ?? displayName}:${key}`
	);

	return template(displayName, context);
}
