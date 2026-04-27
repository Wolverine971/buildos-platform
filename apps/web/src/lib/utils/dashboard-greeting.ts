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
		(name) => `Happy New Year, ${name}.`,
		(name) => `New year, ${name}. Pick what actually matters this time.`
	],
	'Groundhog Day': [
		(name) => `Groundhog Day, ${name}. Break the loop today.`,
		(name) => `Groundhog Day, ${name}. Same calendar, different choices.`
	],
	'National Pizza Day': [
		(name) => `National Pizza Day, ${name}.`,
		(name) => `Pizza Day, ${name}. Slice the day into pieces you can finish.`
	],
	"Valentine's Day": [
		(name) => `Happy Valentine's Day, ${name}.`,
		(name) => `Valentine's Day, ${name}. Be kind to your future self today.`
	],
	'Mario Day': [
		(name) => `Mar10 Day, ${name}. Small jumps count.`,
		(name) => `Happy Mario Day, ${name}.`
	],
	"St. Patrick's Day": [
		(name) => `Happy St. Patrick's Day, ${name}.`,
		(name) => `St. Patrick's Day, ${name}.`
	],
	"April Fools' Day": [
		(name) => `April Fools', ${name}. No tricks here.`,
		(name) => `April 1st, ${name}. Ignore anything that smells like a prank.`
	],
	'U.S. Tax Day': [
		(name) => `Tax Day, ${name}. Hydrate, document, survive.`,
		(name) => `Tax Day, ${name}. Get it filed.`
	],
	'World Design Day': [
		(name) => `World Design Day, ${name}.`,
		(name) => `Design Day, ${name}. Sweat the details that nobody else will.`
	],
	'Star Wars Day': [
		(name) => `May the 4th be with you, ${name}.`,
		(name) => `Star Wars Day, ${name}. Trust the focus.`
	],
	'National Creativity Day': [
		(name) => `Creativity Day, ${name}. Make something rough today.`,
		(name) => `National Creativity Day, ${name}. The first draft is allowed to be bad.`
	],
	'Flag Day': [
		(name) => `Flag Day, ${name}.`,
		(name) => `Happy Flag Day, ${name}. Plant a flag in something real.`
	],
	Juneteenth: [
		(name) => `Juneteenth, ${name}. Make space for reflection.`,
		(name) => `Honoring Juneteenth, ${name}.`
	],
	'World Productivity Day': [
		(name) => `World Productivity Day, ${name}. On-brand, but we'll allow it.`,
		(name) => `Productivity Day, ${name}. One clean step is enough.`
	],
	'World Selfie Day': [
		(name) => `Selfie Day, ${name}.`,
		(name) => `World Selfie Day, ${name}. Look at the work, then back at me.`
	],
	'Independence Day': [
		(name) => `Happy 4th, ${name}.`,
		(name) => `Independence Day, ${name}. Take the day if you can.`
	],
	'World Emoji Day': [
		(name) => `World Emoji Day, ${name}.`,
		(name) => `Emoji Day, ${name}. One face per task, max.`
	],
	'World Photography Day': [
		(name) => `Photography Day, ${name}. Frame, focus, ship.`,
		(name) => `World Photography Day, ${name}.`
	],
	'Patriot Day': [
		(name) => `Patriot Day, ${name}. A quieter day. Be steady.`,
		(name) => `Today carries weight, ${name}. Keep the work intentional.`
	],
	'Constitution Day': [
		(name) => `Constitution Day, ${name}.`,
		(name) => `Constitution Day, ${name}. Pick one clear next action.`
	],
	'National Coffee Day': [
		(name) => `National Coffee Day, ${name}.`,
		(name) => `Coffee Day, ${name}. Pour first, plan second.`
	],
	'World Mental Health Day': [
		(name) => `Mental Health Day, ${name}. Be honest about your capacity today.`,
		(name) => `World Mental Health Day, ${name}. A gentler pace counts.`
	],
	Halloween: [
		(name) => `Happy Halloween, ${name}.`,
		(name) => `Halloween, ${name}. The scariest thing is the overdue list.`
	],
	'Veterans Day': [
		(name) => `Veterans Day, ${name}. Steady work, clear priorities.`,
		(name) => `Honoring Veterans Day, ${name}.`
	],
	'Christmas Day': [
		(name) => `Merry Christmas, ${name}.`,
		(name) => `Christmas Day, ${name}. The checklist can wait.`
	],
	"New Year's Eve": [
		(name) => `New Year's Eve, ${name}. Close one loop before midnight.`,
		(name) => `Happy New Year's Eve, ${name}.`
	],
	'Martin Luther King Jr. Day': [
		(name) => `MLK Day, ${name}. Make the work matter.`,
		(name) => `Honoring MLK Day, ${name}.`
	],
	"Presidents' Day": [
		(name) => `Presidents' Day, ${name}.`,
		(name) => `Presidents' Day, ${name}. One priority gets the chair today.`
	],
	"Mother's Day": [
		(name) => `Happy Mother's Day, ${name}. Did you call?`,
		(name) => `Mother's Day, ${name}.`
	],
	'Memorial Day': [
		(name) => `Memorial Day, ${name}. A day for remembrance.`,
		(name) => `Honoring Memorial Day, ${name}.`
	],
	"Father's Day": [(name) => `Happy Father's Day, ${name}.`, (name) => `Father's Day, ${name}.`],
	'Labor Day': [
		(name) => `Happy Labor Day, ${name}. Rest counts as work today.`,
		(name) => `Labor Day, ${name}. Take the break.`
	],
	'Columbus Day': [
		(name) => `Hey ${name}. Pick your direction this week.`,
		(name) => `Columbus Day, ${name}. Monday marker.`
	],
	Thanksgiving: [
		(name) => `Happy Thanksgiving, ${name}.`,
		(name) => `Thanksgiving, ${name}. Gratitude first, todo list later.`
	],
	'Black Friday': [
		(name) => `Black Friday, ${name}. Your attention isn't a doorbuster.`,
		(name) => `Black Friday, ${name}. The best deal today is fewer tabs.`
	],
	'National Entrepreneurs Day': [
		(name) => `Entrepreneurs Day, ${name}. Build the smallest version that works.`,
		(name) => `National Entrepreneurs Day, ${name}. Ship something rough today.`
	],
	'National Donut Day': [(name) => `Donut Day, ${name}.`, (name) => `Happy Donut Day, ${name}.`],
	Easter: [(name) => `Happy Easter, ${name}.`, (name) => `Easter, ${name}.`],
	'Start of Q1 / Fiscal Year': [
		(name) => `Q1, ${name}. Set the tone for the year.`,
		(name) => `Welcome to Q1, ${name}.`
	],
	'Start of Q2': [
		(name) => `Welcome to Q2, ${name}.`,
		(name) => `Q2, ${name}. Time to course-correct.`
	],
	'Start of Q3': [
		(name) => `Q3, ${name}. Halfway through the year.`,
		(name) => `Welcome to Q3, ${name}.`
	],
	'Start of Q4': [
		(name) => `Q4, ${name}. The year is closing fast.`,
		(name) => `Welcome to Q4, ${name}. Pick what actually ships before December.`
	],
	'Q3 Estimated Tax Due': [
		(name) => `Estimated taxes due today, ${name}.`,
		(name) => `Q3 tax day, ${name}. Don't forget.`
	],
	'Extended Tax Filing Deadline': [
		(name) => `Extended tax deadline, ${name}. File it.`,
		(name) => `Tax extension day, ${name}. Close the loop.`
	],
	'First Day of Spring': [
		(name) => `First day of spring, ${name}.`,
		(name) => `Spring's here, ${name}.`
	],
	'First Day of Summer': [
		(name) => `First day of summer, ${name}.`,
		(name) => `Summer starts, ${name}.`
	],
	'First Day of Fall': [
		(name) => `First day of fall, ${name}.`,
		(name) => `Fall's here, ${name}.`
	],
	'First Day of Winter': [
		(name) => `First day of winter, ${name}.`,
		(name) => `Winter starts, ${name}.`
	]
};

const GENERIC_SPECIAL_DAY_GREETINGS: GreetingTemplate[] = [
	(name, context) => `Happy ${context.primarySpecialDay}, ${name}.`,
	(name, context) => `Hey ${name}. It's ${context.primarySpecialDay}.`
];

const TIME_AWARE_SPECIAL_DAY_GREETINGS: GreetingTemplate[] = [
	(name, context) => `${timeGreetingWord(context)}, ${name}. Happy ${context.primarySpecialDay}.`,
	(name, context) =>
		`${timeGreetingWord(context)}, ${name}. ${context.primarySpecialDay}, in case you forgot.`
];

const MONDAY_GREETINGS: GreetingTemplate[] = [
	(name) => `Monday, ${name}. Let's go.`,
	(name) => `Hey ${name}. New week.`,
	(name) => `Welcome back, ${name}. What matters this week?`,
	(name) => `Monday, ${name}. Pick one real goal for the week.`,
	(name) => `Hey ${name}. Don't let Monday set the tone with chaos.`
];

const FRIDAY_GREETINGS: GreetingTemplate[] = [
	(name) => `Friday, ${name}.`,
	(name) => `Happy Friday, ${name}. What's left before the weekend?`,
	(name) => `Hey ${name}. Don't start anything you can't finish today.`,
	(name) => `Friday, ${name}. Ship one thing and call it.`,
	(name) => `Welcome back, ${name}. Almost there.`
];

const WEEKEND_GREETINGS: GreetingTemplate[] = [
	(name) => `Hey ${name}. Weekend mode.`,
	(name) => `Welcome back, ${name}. Light touch today.`,
	(name) => `Hey ${name}. The work will wait. Mostly.`,
	(name) => `Weekend check-in, ${name}. Capture the idea, then go live your life.`,
	(name) => `Hello, ${name}. No pressure today.`
];

const MIDWEEK_GREETINGS: GreetingTemplate[] = [
	(name) => `Wednesday, ${name}. Halfway there.`,
	(name) => `Midweek, ${name}. Course-correct if you need to.`,
	(name) => `Hey ${name}. Wednesday is decision day.`,
	(name) => `Wednesday, ${name}.`,
	(name) => `Hi ${name}. Honest check-in: are we on track this week?`
];

const MONTH_START_GREETINGS: GreetingTemplate[] = [
	(name) => `New month, ${name}.`,
	(name) => `Fresh month, ${name}. What matters most?`,
	(name) => `Hey ${name}. First of the month. Reset the priorities.`,
	(name) => `Welcome to a new month, ${name}.`,
	(name) => `New month, ${name}. Pick a theme and run with it.`
];

const GENERAL_GREETINGS: GreetingTemplate[] = [
	(name) => `Good to see you, ${name}.`,
	(name) => `Welcome back, ${name}.`,
	(name) => `Hey ${name}. What's the move today?`,
	(name) => `Hi ${name}. The blank page is the hardest part. Start anyway.`,
	(name) => `Hey ${name}. Don't plan more before doing anything.`,
	(name) => `Welcome back, ${name}. The first ten minutes set the tone.`,
	(name) => `Hi ${name}. Pick the hardest thing first.`,
	(name) => `Hey ${name}. You don't need a perfect plan. You need a next step.`,
	(name) => `Good to see you, ${name}. The to-do list isn't the work.`,
	(name) => `Hey ${name}. Think on paper. Decide on the page.`,
	(name) => `Welcome back, ${name}. What's been rattling around in your head?`,
	(name) => `Hi ${name}. Some days it's just one thing. That's fine.`,
	(name) => `Hey ${name}. The hard part is starting.`,
	(name) => `Welcome back, ${name}. Pick the version of you that ships.`,
	(name) => `Hi ${name}. Let's untangle something.`
];

const TIME_OF_DAY_GREETINGS: Record<DashboardTimeOfDay, GreetingTemplate[]> = {
	early_morning: [
		(name) => `Early morning, ${name}. Best hour for the hard stuff.`,
		(name) => `Up early, ${name}? Use the quiet before the world starts asking.`,
		(name) => `Early start, ${name}. Nobody else is here yet.`
	],
	morning: [
		(name) => `Good morning, ${name}.`,
		(name) => `Morning, ${name}. What's actually due today?`,
		(name) => `Good morning, ${name}. Don't open Slack first.`
	],
	midday: [
		(name) => `Midday, ${name}. How's it going?`,
		(name) => `Hey ${name}. Halfway through the day. Are we on track?`,
		(name) => `Lunch hour, ${name}. Step away from the screen if you can.`
	],
	afternoon: [
		(name) => `Afternoon, ${name}.`,
		(name) => `Afternoon slump, ${name}? Switch tasks.`,
		(name) => `Good afternoon, ${name}. Second wind incoming.`
	],
	evening: [
		(name) => `Evening, ${name}. Wrap up or one more push?`,
		(name) => `Hey ${name}. Close the loop you started this morning.`,
		(name) => `Good evening, ${name}. The work will still be here tomorrow.`
	],
	late_night: [
		(name) => `Late night, ${name}. Capture it and go to sleep.`,
		(name) => `Hey ${name}. Whatever's keeping you up, write it down.`,
		(name) => `Past bedtime, ${name}. Tomorrow-you will thank you for sleeping.`
	]
};

const BUILDOS_GREETINGS: GreetingTemplate[] = [
	(name) => `Hey ${name}. What's stuck in your head? Brain dump it.`,
	(name) => `Welcome back, ${name}. Drop the chaos, find the thread.`,
	(name) => `Hi ${name}. Brain dump first, plan second.`,
	(name) => `Good to see you, ${name}. Stream of consciousness is welcome here.`,
	(name) => `Hey ${name}. Get the thoughts out. The project graph will catch up.`,
	(name) => `Welcome back, ${name}. Messy thinking is the whole point.`,
	(name) => `Hi ${name}. Your daily brief is upstream of the noise.`,
	(name) => `Hey ${name}. The thoughts in your head won't sort themselves.`
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
