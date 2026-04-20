// apps/web/src/lib/server/welcome-sequence.content.ts
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import {
	getEmail3Branch,
	getEmail4Branch,
	hasReturnedForSecondSession,
	type WelcomeSequenceProductState,
	type WelcomeSequenceProgress,
	type WelcomeSequenceStep
} from './welcome-sequence.logic';

export interface WelcomeEmailContent {
	step: WelcomeSequenceStep;
	branchKey: string;
	subject: string;
	body: string;
	html: string;
	ctaLabel: string;
	ctaUrl: string;
}

export const WELCOME_COPY_BANNED_PHRASES = [
	'cognitive sovereignty',
	'citizens',
	'empire',
	'as an ai',
	'ai-powered',
	'powered by ai',
	'artificial intelligence',
	'large language model'
] as const;

type WelcomeTemplateTokens = Record<string, string | number | boolean | null | undefined>;

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function renderWelcomeTemplate(
	template: string,
	tokens: WelcomeTemplateTokens,
	options: { html?: boolean } = {}
): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
		if (!(key in tokens)) {
			return match;
		}

		const value = tokens[key];
		const rendered = value == null ? '' : String(value);
		return options.html ? escapeHtml(rendered) : rendered;
	});
}

export function findWelcomeCopyVoiceIssues(content: string): string[] {
	const lowerContent = content.toLowerCase();
	return WELCOME_COPY_BANNED_PHRASES.filter((phrase) => lowerContent.includes(phrase));
}

function firstName(name: string | null): string | null {
	if (!name) return null;
	const trimmed = name.trim();
	if (!trimmed) return null;
	return trimmed.split(/\s+/)[0] ?? null;
}

function getPlainGreeting(name: string | null): string {
	const resolvedFirstName = firstName(name);
	return resolvedFirstName ? `Hi ${resolvedFirstName},` : 'Hi,';
}

function getHtmlGreeting(name: string | null): string {
	const resolvedFirstName = firstName(name);
	return resolvedFirstName ? `Hi ${escapeHtml(resolvedFirstName)},` : 'Hi,';
}

function getIntentHook(intent: string | null): string | null {
	switch (intent) {
		case 'organize':
			return 'get everything you are juggling into one place';
		case 'plan':
			return 'turn the thing you are trying to build into a real plan';
		case 'unstuck':
			return 'get one clear next move instead of ten loose ones';
		case 'explore':
			return 'start messy and see what becomes worth building';
		default:
			return null;
	}
}

function renderButton(label: string, url: string): string {
	return `
		<div style="margin: 28px 0;">
			<a
				href="${escapeHtml(url)}"
				style="display: inline-block; background-color: #D96C1E; color: #FAF9F7; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;"
			>${escapeHtml(label)}</a>
		</div>
	`;
}

function wrapEmailHtml(
	subject: string,
	bodyHtml: string,
	ctaLabel: string,
	ctaUrl: string
): string {
	return generateMinimalEmailHTML({
		subject,
		content: `${bodyHtml}${renderButton(ctaLabel, ctaUrl)}<p style="margin-top: 24px;">DJ</p>`
	});
}

function getWelcomeUrls(baseUrl: string, state: WelcomeSequenceProductState) {
	const latestProjectUrl = state.latestProjectId
		? `${baseUrl}/projects/${state.latestProjectId}`
		: `${baseUrl}/projects`;

	return {
		start: state.onboardingCompleted ? `${baseUrl}/projects` : `${baseUrl}/onboarding`,
		openApp: state.onboardingCompleted ? `${baseUrl}/projects` : `${baseUrl}/onboarding`,
		project: latestProjectUrl,
		briefs: `${baseUrl}/profile?tab=briefs`,
		calendar: `${baseUrl}/profile?tab=calendar`,
		notifications: `${baseUrl}/profile?tab=notifications`
	};
}

function buildEmail1(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const ctaLabel = 'Start your first project';
	const ctaUrl = getWelcomeUrls(baseUrl, state).start;
	const subject = 'Welcome to BuildOS';
	const greeting = getPlainGreeting(state.name);
	const htmlGreeting = getHtmlGreeting(state.name);
	const body = renderWelcomeTemplate(
		`{{greeting}}

Welcome to BuildOS.

The best way to understand it is not by reading about it. It is by using it once.

Start with the mess in your head:
- a project you are trying to move forward
- a pile of ideas you have not organized yet
- something you feel stuck on
- a bunch of loose notes you do not want to lose

Open BuildOS and talk through it the way you naturally would. Do not clean it up first.

That is the point.

BuildOS is built to take rough input and turn it into structure you can actually work from.

Start here:
{{ctaLabel}}: {{ctaUrl}}

If you reply with what you are trying to build, I will tell you the fastest way to start it in BuildOS.

DJ`,
		{ greeting, ctaLabel, ctaUrl }
	);

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>Welcome to BuildOS.</p>
			<p>The best way to understand it is not by reading about it. It is by using it once.</p>
			<p>Start with the mess in your head:</p>
			<ul>
				<li>a project you are trying to move forward</li>
				<li>a pile of ideas you have not organized yet</li>
				<li>something you feel stuck on</li>
				<li>a bunch of loose notes you do not want to lose</li>
			</ul>
			<p>Open BuildOS and talk through it the way you naturally would. Do not clean it up first.</p>
			<p>That is the point.</p>
			<p>BuildOS is built to take rough input and turn it into structure you can actually work from.</p>
			<p>If you reply with what you are trying to build, I will tell you the fastest way to start it in BuildOS.</p>
		`,
			{ htmlGreeting },
			{ html: false }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_1',
		branchKey: 'welcome',
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

function buildEmail2(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const greeting = getPlainGreeting(state.name);
	const htmlGreeting = getHtmlGreeting(state.name);

	if (state.projectCount > 0) {
		return buildEmail2AlreadyCreatedProject(state, baseUrl, greeting, htmlGreeting);
	}

	const ctaLabel = 'Open BuildOS';
	const ctaUrl = getWelcomeUrls(baseUrl, state).openApp;
	const intentHook = getIntentHook(state.onboardingIntent);
	const subject = 'What to bring to your first BuildOS session';
	const intentLine = intentHook
		? `If you came to BuildOS to ${intentHook}, use that as your starting point.`
		: 'Use the thing you most need to move forward as your starting point.';

	const body = renderWelcomeTemplate(
		`{{greeting}}

If you opened BuildOS and thought "I should come back when I can explain this better," do not do that.

A good first session sounds more like this:

"I am trying to [goal]. These are the things already in motion. These are the loose ends. This is what is blocking me. These are the things I do not want to forget."

{{intentLine}}

You do not need:
- a polished plan
- a clean list
- the right format

You just need a real starting point.

Open BuildOS and give it the messy version. Let the system do the organizing after.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
		{ greeting, intentLine, ctaLabel, ctaUrl }
	);

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>If you opened BuildOS and thought "I should come back when I can explain this better," do not do that.</p>
			<p>A good first session sounds more like this:</p>
			<blockquote>
				I am trying to [goal]. These are the things already in motion. These are the loose ends. This is what is blocking me. These are the things I do not want to forget.
			</blockquote>
			<p>{{intentLine}}</p>
			<p>You do not need:</p>
			<ul>
				<li>a polished plan</li>
				<li>a clean list</li>
				<li>the right format</li>
			</ul>
			<p>You just need a real starting point.</p>
			<p>Open BuildOS and give it the messy version. Let the system do the organizing after.</p>
		`,
			{ htmlGreeting, intentLine: escapeHtml(intentLine) }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_2',
		branchKey: 'no_project',
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

function buildEmail2AlreadyCreatedProject(
	state: WelcomeSequenceProductState,
	baseUrl: string,
	greeting: string,
	htmlGreeting: string
): WelcomeEmailContent {
	const urls = getWelcomeUrls(baseUrl, state);
	const needsCalendar = !state.calendarConnected;
	const needsBrief = !state.emailDailyBriefEnabled;

	const ctaLabel = needsCalendar
		? 'Connect your calendar'
		: needsBrief
			? 'Turn on your daily brief'
			: 'Open BuildOS';
	const ctaUrl = needsCalendar ? urls.calendar : needsBrief ? urls.briefs : urls.project;

	const subject = 'You got your first project in. Here is what to do next.';

	const calendarLine = needsCalendar
		? '- Connect your calendar so deadlines and time context land inside the project instead of living in a separate place.'
		: null;
	const briefLine = needsBrief
		? '- Turn on the daily brief so the system shows back up for you on days you would have otherwise forgotten.'
		: null;
	const secondProjectLine =
		'- Add a second project. Personal, side work, something you have been putting off. One rough dump is enough.';
	const reopenLine =
		'- Re-open the project you already started and add whatever changed since last time. The second session is where BuildOS starts to click.';

	const optionLines = [calendarLine, briefLine, secondProjectLine, reopenLine].filter(
		(line): line is string => line !== null
	);

	const plainOptions = optionLines.join('\n');

	const body = renderWelcomeTemplate(
		`{{greeting}}

Nice. You already got something into BuildOS, which is usually the hardest part.

One thing most tools get wrong: they make you maintain a clean system forever. BuildOS is the opposite. It gets more useful the more real work you throw at it.

A few ways people make it click in the first week:
{{optionLines}}

You do not have to do all of these. Pick the one closest to what you actually need this week.

{{ctaLabel}}: {{ctaUrl}}

Or just reply and tell me what you are building. I will tell you the fastest way to keep it moving in BuildOS.

DJ`,
		{ greeting, optionLines: plainOptions, ctaLabel, ctaUrl }
	);

	const htmlOptions = optionLines
		.map((line) => `<li>${escapeHtml(line.replace(/^-\s+/, ''))}</li>`)
		.join('\n');

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>Nice. You already got something into BuildOS, which is usually the hardest part.</p>
			<p>One thing most tools get wrong: they make you maintain a clean system forever. BuildOS is the opposite. It gets more useful the more real work you throw at it.</p>
			<p>A few ways people make it click in the first week:</p>
			<ul>{{htmlOptions}}</ul>
			<p>You do not have to do all of these. Pick the one closest to what you actually need this week.</p>
			<p>Or just reply and tell me what you are building. I will tell you the fastest way to keep it moving in BuildOS.</p>
		`,
			{ htmlGreeting, htmlOptions },
			{ html: false }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_2',
		branchKey: 'already_created_project',
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

function buildEmail3(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const branchKey = getEmail3Branch(state);
	const urls = getWelcomeUrls(baseUrl, state);
	const greeting = getPlainGreeting(state.name);
	const htmlGreeting = getHtmlGreeting(state.name);

	if (branchKey === 'no_project') {
		const ctaLabel = 'Open BuildOS';
		const ctaUrl = urls.openApp;
		const subject = 'Why BuildOS works better than another blank workspace';
		const body = renderWelcomeTemplate(
			`{{greeting}}

Most tools make you start from zero.

You open a blank workspace, stare at it for a minute, and then put the work off because you are still the one responsible for turning the mess into structure.

That is the part BuildOS is trying to remove.

You do not need a polished plan before you start.

You need one place where you can say the messy version first and get something usable back.

Open BuildOS, dump what is in your head, and let the system turn it into a project you can keep building on.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
			{ greeting, ctaLabel, ctaUrl }
		);

		const html = wrapEmailHtml(
			subject,
			renderWelcomeTemplate(
				`
				<p>{{htmlGreeting}}</p>
				<p>Most tools make you start from zero.</p>
				<p>You open a blank workspace, stare at it for a minute, and then put the work off because you are still the one responsible for turning the mess into structure.</p>
				<p>That is the part BuildOS is trying to remove.</p>
				<p>You do not need a polished plan before you start.</p>
				<p>You need one place where you can say the messy version first and get something usable back.</p>
				<p>Open BuildOS, dump what is in your head, and let the system turn it into a project you can keep building on.</p>
			`,
				{ htmlGreeting }
			),
			ctaLabel,
			ctaUrl
		);

		return {
			step: 'email_3',
			branchKey,
			subject,
			body,
			html,
			ctaLabel,
			ctaUrl
		};
	}

	if (branchKey === 'finish_setup') {
		const ctaLabel = 'Finish setup';
		const ctaUrl = urls.openApp;
		const subject = 'Most tools make you start from zero';
		const body = renderWelcomeTemplate(
			`{{greeting}}

You already got something into BuildOS. Good.

The next step is finishing the setup that keeps you from starting from zero again.

When you come back to a project, the point is not to generate text once.

The point is to keep context attached to the work so the next session starts with something real instead of another blank page.

Finish onboarding, turn on one follow-through channel, and reopen the project you started.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
			{ greeting, ctaLabel, ctaUrl }
		);

		const html = wrapEmailHtml(
			subject,
			renderWelcomeTemplate(
				`
				<p>{{htmlGreeting}}</p>
				<p>You already got something into BuildOS. Good.</p>
				<p>The next step is finishing the setup that keeps you from starting from zero again.</p>
				<p>When you come back to a project, the point is not to generate text once.</p>
				<p>The point is to keep context attached to the work so the next session starts with something real instead of another blank page.</p>
				<p>Finish onboarding, turn on one follow-through channel, and reopen the project you started.</p>
			`,
				{ htmlGreeting }
			),
			ctaLabel,
			ctaUrl
		);

		return {
			step: 'email_3',
			branchKey,
			subject,
			body,
			html,
			ctaLabel,
			ctaUrl
		};
	}

	const ctaLabel = 'Re-open your project';
	const ctaUrl = urls.project;
	const subject = 'Most tools make you start from zero';
	const body = renderWelcomeTemplate(
		`{{greeting}}

Most tools make you maintain the system.

You write notes in one place, tasks in another, talk to AI in another, and then you become the person responsible for stitching all of it back together.

That is the part BuildOS is trying to remove.

When you talk through messy work in BuildOS, the goal is not just to generate text once.

The goal is to create a project you can keep building on without starting from zero every time.

Try this:
1. Open the project you already started
2. Add whatever changed since the last time you touched it
3. Ask what the next move should be

That second session is where BuildOS starts to make sense.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
		{ greeting, ctaLabel, ctaUrl }
	);

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>Most tools make you maintain the system.</p>
			<p>You write notes in one place, tasks in another, talk to AI in another, and then you become the person responsible for stitching all of it back together.</p>
			<p>That is the part BuildOS is trying to remove.</p>
			<p>When you talk through messy work in BuildOS, the goal is not just to generate text once.</p>
			<p>The goal is to create a project you can keep building on without starting from zero every time.</p>
			<p>Try this:</p>
			<ol>
				<li>Open the project you already started</li>
				<li>Add whatever changed since the last time you touched it</li>
				<li>Ask what the next move should be</li>
			</ol>
			<p>That second session is where BuildOS starts to make sense.</p>
		`,
			{ htmlGreeting }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_3',
		branchKey,
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

function buildEmail4(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const branch = getEmail4Branch(state).branchKey;
	const urls = getWelcomeUrls(baseUrl, state);
	const greeting = getPlainGreeting(state.name);
	const htmlGreeting = getHtmlGreeting(state.name);

	if (branch === 'finish_setup') {
		const ctaLabel = 'Finish setup';
		const ctaUrl = urls.openApp;
		const subject = 'Capture is only half the system';
		const body = renderWelcomeTemplate(
			`{{greeting}}

Getting your ideas out is step one.

Making sure BuildOS can keep showing up for the work after that is step two.

If you still have onboarding left, finish it now so the project you started does not turn into another thing you have to remember on your own.

You do not need to set up everything at once.

Just get to ready-state and give BuildOS one way to help you stay in motion after the first capture.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
			{ greeting, ctaLabel, ctaUrl }
		);

		const html = wrapEmailHtml(
			subject,
			renderWelcomeTemplate(
				`
				<p>{{htmlGreeting}}</p>
				<p>Getting your ideas out is step one.</p>
				<p>Making sure BuildOS can keep showing up for the work after that is step two.</p>
				<p>If you still have onboarding left, finish it now so the project you started does not turn into another thing you have to remember on your own.</p>
				<p>You do not need to set up everything at once.</p>
				<p>Just get to ready-state and give BuildOS one way to help you stay in motion after the first capture.</p>
			`,
				{ htmlGreeting }
			),
			ctaLabel,
			ctaUrl
		);

		return {
			step: 'email_4',
			branchKey: branch,
			subject,
			body,
			html,
			ctaLabel,
			ctaUrl
		};
	}

	const needsEmailBrief = !state.emailDailyBriefEnabled;
	const needsSmsChannel = !state.smsChannelEnabled;
	const needsCalendar = !state.calendarConnected;
	const ctaLabel = needsEmailBrief
		? 'Set up your daily brief'
		: needsSmsChannel
			? 'Turn on notifications'
			: needsCalendar
				? 'Connect your calendar'
				: 'Finish setup';
	const ctaUrl = needsEmailBrief
		? urls.briefs
		: needsSmsChannel
			? urls.notifications
			: needsCalendar
				? urls.calendar
				: urls.notifications;
	const subject = 'Capture is only half the system';
	const body = renderWelcomeTemplate(
		`{{greeting}}

Getting your ideas out is step one.

Following through without having to remember everything yourself is step two.

That is where the rest of setup matters.

Pick one:
- turn on the email daily brief
- verify your phone if you want SMS nudges
- connect your calendar if time and deadlines are part of your workflow

You do not need to set up everything at once.

Just give BuildOS one way to help you stay in motion after the first capture.

{{ctaLabel}}: {{ctaUrl}}

DJ`,
		{ greeting, ctaLabel, ctaUrl }
	);

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>Getting your ideas out is step one.</p>
			<p>Following through without having to remember everything yourself is step two.</p>
			<p>That is where the rest of setup matters.</p>
			<p>Pick one:</p>
			<ul>
				<li>turn on the email daily brief</li>
				<li>verify your phone if you want SMS nudges</li>
				<li>connect your calendar if time and deadlines are part of your workflow</li>
			</ul>
			<p>You do not need to set up everything at once.</p>
			<p>Just give BuildOS one way to help you stay in motion after the first capture.</p>
		`,
			{ htmlGreeting }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_4',
		branchKey: branch,
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

function buildEmail5(
	progress: WelcomeSequenceProgress,
	state: WelcomeSequenceProductState,
	baseUrl: string
): WelcomeEmailContent {
	const returned = hasReturnedForSecondSession(progress, state);
	const urls = getWelcomeUrls(baseUrl, state);
	const ctaLabel = 'Open BuildOS';
	const ctaUrl = state.projectCount > 0 ? urls.project : urls.openApp;
	const subject = 'What are you building right now?';
	const greeting = getPlainGreeting(state.name);
	const htmlGreeting = getHtmlGreeting(state.name);

	const opening = returned
		? 'You have already been back in BuildOS at least once, which is usually when it starts to click.'
		: 'By now you have probably felt one of two things: either it clicked, or you still do not know the best way to use this for your work.';

	const body = renderWelcomeTemplate(
		`{{greeting}}

{{opening}}

If you are still in the second group, reply and tell me what you are trying to move forward.

BuildOS tends to click fastest for people who need to:
- turn scattered project thinking into a usable plan
- keep context attached to work across multiple sessions
- stop bouncing between notes, task lists, and stateless AI chats
- get one clear next move when everything feels equally urgent

You do not need a huge system.

You need one project in BuildOS that becomes more useful every time you come back to it.

{{ctaLabel}}: {{ctaUrl}}

Or just reply to this email with what you are building.

DJ`,
		{ greeting, opening, ctaLabel, ctaUrl }
	);

	const html = wrapEmailHtml(
		subject,
		renderWelcomeTemplate(
			`
			<p>{{htmlGreeting}}</p>
			<p>{{opening}}</p>
			<p>If you are still in the second group, reply and tell me what you are trying to move forward.</p>
			<p>BuildOS tends to click fastest for people who need to:</p>
			<ul>
				<li>turn scattered project thinking into a usable plan</li>
				<li>keep context attached to work across multiple sessions</li>
				<li>stop bouncing between notes, task lists, and stateless AI chats</li>
				<li>get one clear next move when everything feels equally urgent</li>
			</ul>
			<p>You do not need a huge system.</p>
			<p>You need one project in BuildOS that becomes more useful every time you come back to it.</p>
			<p>Or just reply to this email with what you are building.</p>
		`,
			{ htmlGreeting, opening: escapeHtml(opening) }
		),
		ctaLabel,
		ctaUrl
	);

	return {
		step: 'email_5',
		branchKey: returned ? 'returning_check_in' : 'general_check_in',
		subject,
		body,
		html,
		ctaLabel,
		ctaUrl
	};
}

export function buildWelcomeEmailContent(
	step: WelcomeSequenceStep,
	progress: WelcomeSequenceProgress,
	state: WelcomeSequenceProductState,
	baseUrl: string
): WelcomeEmailContent {
	switch (step) {
		case 'email_1':
			return buildEmail1(state, baseUrl);
		case 'email_2':
			return buildEmail2(state, baseUrl);
		case 'email_3':
			return buildEmail3(state, baseUrl);
		case 'email_4':
			return buildEmail4(state, baseUrl);
		case 'email_5':
			return buildEmail5(progress, state, baseUrl);
	}
}
