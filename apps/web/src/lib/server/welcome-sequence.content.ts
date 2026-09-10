// apps/web/src/lib/server/welcome-sequence.content.ts
import {
	BRAND_TAGLINE,
	FIRST_PROJECT_PROMPT,
	PROJECT_UPDATE_PROMPT,
	START_PROJECT_CTA
} from '$lib/constants/brand';
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

// Keep the first-session copy identical in text and HTML; escape each paragraph once.
function buildProjectInvitation(
	state: WelcomeSequenceProductState,
	step: WelcomeSequenceStep,
	branchKey: string,
	subject: string,
	ctaLabel: string,
	ctaUrl: string,
	paragraphs: string[]
): WelcomeEmailContent {
	const body = [getPlainGreeting(state.name), ...paragraphs, `${ctaLabel}: ${ctaUrl}`, 'DJ'].join(
		'\n\n'
	);
	const html = wrapEmailHtml(
		subject,
		[getPlainGreeting(state.name), ...paragraphs]
			.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
			.join('\n'),
		ctaLabel,
		ctaUrl
	);
	return { step, branchKey, subject, body, html, ctaLabel, ctaUrl };
}

function buildEmail1(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	return buildProjectInvitation(
		state,
		'email_1',
		'welcome',
		'Welcome to BuildOS',
		START_PROJECT_CTA,
		getWelcomeUrls(baseUrl, state).start,
		[
			`Welcome to BuildOS. ${BRAND_TAGLINE}`,
			'Tell it what you are working on. BuildOS organizes your notes, tasks, and next steps.',
			`Start with this:\n"${FIRST_PROJECT_PROMPT}"`,
			'Paste any rough notes you already have. Then open the project to review the tasks and documents it creates.'
		]
	);
}

function buildEmail2(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const urls = getWelcomeUrls(baseUrl, state);
	if (state.projectCount > 0) {
		return buildProjectInvitation(
			state,
			'email_2',
			'already_created_project',
			'Tell your project what changed',
			'Re-open your project',
			urls.project,
			[
				'You have started a project in BuildOS. Give it one update next.',
				PROJECT_UPDATE_PROMPT,
				'Open the project chat and describe the change you want. Then open the task or document to check the result.',
				'Keep working in that same project as your plans develop.'
			]
		);
	}

	const intentHook = getIntentHook(state.onboardingIntent);
	return buildProjectInvitation(
		state,
		'email_2',
		'no_project',
		'Bring the rough notes you already have',
		START_PROJECT_CTA,
		urls.openApp,
		[
			'Pick one thing you are working on: a book, a video, a launch, or a project of your own.',
			`Describe it like this:\n"${FIRST_PROJECT_PROMPT}"`,
			...(intentHook ? [`If you came to BuildOS to ${intentHook}, start there.`] : []),
			'BuildOS turns that conversation into a project with tasks and documents you can open and edit.'
		]
	);
}

function buildEmail3(state: WelcomeSequenceProductState, baseUrl: string): WelcomeEmailContent {
	const branchKey = getEmail3Branch(state);
	const urls = getWelcomeUrls(baseUrl, state);
	if (branchKey === 'no_project') {
		return buildProjectInvitation(
			state,
			'email_3',
			branchKey,
			'One conversation to start your project',
			START_PROJECT_CTA,
			urls.openApp,
			[
				'Your first message can be the rough version of what you are trying to do.',
				`"${FIRST_PROJECT_PROMPT}"`,
				'After BuildOS creates the project, open a task or document. If something needs changing, tell it in chat.'
			]
		);
	}
	if (branchKey === 'finish_setup') {
		return buildProjectInvitation(
			state,
			'email_3',
			branchKey,
			'Your project is saved. Pick up from there.',
			'Finish setup',
			urls.openApp,
			[
				'You have already created a project in BuildOS.',
				'Finish the remaining onboarding steps, then open that project. Calendar and notification connections are optional.',
				PROJECT_UPDATE_PROMPT,
				'Your next conversation can build on the work you have already saved.'
			]
		);
	}
	return buildProjectInvitation(
		state,
		'email_3',
		branchKey,
		'Pick up where you left off',
		'Re-open your project',
		urls.project,
		[
			'Open the project you started and look at its notes and unfinished tasks.',
			PROJECT_UPDATE_PROMPT,
			'Use the project chat to make the update, check the result, and ask what to tackle next.',
			'That is the loop: start a project, update it as you work, and come back to keep going.'
		]
	);
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

Just get set up enough that BuildOS can keep showing up for the work after the first capture.

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
				<p>Just get set up enough that BuildOS can keep showing up for the work after the first capture.</p>
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
