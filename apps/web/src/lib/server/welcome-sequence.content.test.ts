// apps/web/src/lib/server/welcome-sequence.content.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildWelcomeEmailContent,
	findWelcomeCopyVoiceIssues,
	renderWelcomeTemplate
} from './welcome-sequence.content';
import type {
	WelcomeSequenceProductState,
	WelcomeSequenceProgress,
	WelcomeSequenceStep
} from './welcome-sequence.logic';

const BASE_URL = 'https://build-os.com';
const STARTED_AT = '2026-03-01T10:00:00.000Z';

function createProgress(overrides: Partial<WelcomeSequenceProgress> = {}): WelcomeSequenceProgress {
	return {
		startedAt: STARTED_AT,
		status: 'active',
		sentAt: {},
		skippedAt: {},
		...overrides
	};
}

function createState(
	overrides: Partial<WelcomeSequenceProductState> = {}
): WelcomeSequenceProductState {
	return {
		userId: 'user-123',
		email: 'user@example.com',
		name: 'Alex Builder',
		createdAt: STARTED_AT,
		timezone: 'UTC',
		onboardingIntent: 'plan',
		onboardingCompleted: false,
		projectCount: 0,
		latestProjectId: null,
		emailDailyBriefEnabled: false,
		smsChannelEnabled: false,
		calendarConnected: false,
		lastVisit: null,
		...overrides
	};
}

function contentVariant(
	label: string,
	step: WelcomeSequenceStep,
	stateOverrides: Partial<WelcomeSequenceProductState> = {},
	progressOverrides: Partial<WelcomeSequenceProgress> = {}
) {
	const content = buildWelcomeEmailContent(
		step,
		createProgress(progressOverrides),
		createState(stateOverrides),
		BASE_URL
	);

	return {
		label,
		branchKey: content.branchKey,
		subject: content.subject,
		body: content.body
	};
}

describe('welcome sequence content', () => {
	it('renders known tokens with null-safe fallbacks and keeps unknown tokens visible', () => {
		expect(
			renderWelcomeTemplate('Hi {{ name }}, go to {{cta_url}}. {{unknown}}', {
				name: null,
				cta_url: 'https://build-os.com/projects'
			})
		).toBe('Hi , go to https://build-os.com/projects. {{unknown}}');

		expect(
			renderWelcomeTemplate('<p>{{name}}</p>', { name: '<Alex & Co>' }, { html: true })
		).toBe('<p>&lt;Alex &amp; Co&gt;</p>');
	});

	it('escapes dynamic HTML values once across branch templates', () => {
		const email = buildWelcomeEmailContent(
			'email_2',
			createProgress({
				sentAt: { email_1: STARTED_AT }
			}),
			createState({
				name: "D'Angelo & Co"
			}),
			BASE_URL
		);

		expect(email.body).toContain("Hi D'Angelo,");
		expect(email.html).toContain('<p>Hi D&#39;Angelo,</p>');
		expect(email.html).not.toContain('D&amp;#39;Angelo');
	});

	it('snapshots rendered subject and plain text for every welcome branch', () => {
		const variants = [
			contentVariant('email_1/welcome', 'email_1'),
			contentVariant('email_2/no_project', 'email_2', {}, {
				sentAt: { email_1: STARTED_AT }
			}),
			contentVariant('email_3/no_project', 'email_3', {}, {
				sentAt: { email_1: STARTED_AT, email_2: STARTED_AT }
			}),
			contentVariant(
				'email_3/finish_setup',
				'email_3',
				{
					projectCount: 1,
					latestProjectId: 'project-1'
				},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT }
				}
			),
			contentVariant(
				'email_3/reopen_project',
				'email_3',
				{
					projectCount: 1,
					latestProjectId: 'project-1',
					onboardingCompleted: true
				},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT }
				}
			),
			contentVariant(
				'email_4/finish_setup',
				'email_4',
				{
					projectCount: 1,
					latestProjectId: 'project-1'
				},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT, email_3: STARTED_AT }
				}
			),
			contentVariant(
				'email_4/follow_through_missing',
				'email_4',
				{
					projectCount: 1,
					latestProjectId: 'project-1',
					onboardingCompleted: true
				},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT, email_3: STARTED_AT }
				}
			),
			contentVariant(
				'email_5/general_check_in',
				'email_5',
				{},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT, email_3: STARTED_AT }
				}
			),
			contentVariant(
				'email_5/returning_check_in',
				'email_5',
				{
					projectCount: 1,
					latestProjectId: 'project-1',
					onboardingCompleted: true,
					lastVisit: '2026-03-02T02:00:00.000Z'
				},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT, email_3: STARTED_AT }
				}
			)
		];

		expect(variants).toMatchInlineSnapshot(`
			[
			  {
			    "body": "Hi Alex,

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
			Start your first project: https://build-os.com/onboarding

			If you reply with what you are trying to build, I will tell you the fastest way to start it in BuildOS.

			DJ",
			    "branchKey": "welcome",
			    "label": "email_1/welcome",
			    "subject": "Welcome to BuildOS",
			  },
			  {
			    "body": "Hi Alex,

			If you opened BuildOS and thought "I should come back when I can explain this better," do not do that.

			A good first session sounds more like this:

			"I am trying to [goal]. These are the things already in motion. These are the loose ends. This is what is blocking me. These are the things I do not want to forget."

			If you came to BuildOS to turn the thing you are trying to build into a real plan, use that as your starting point.

			You do not need:
			- a polished plan
			- a clean list
			- the right format

			You just need a real starting point.

			Open BuildOS and give it the messy version. Let the system do the organizing after.

			Open BuildOS: https://build-os.com/onboarding

			DJ",
			    "branchKey": "no_project",
			    "label": "email_2/no_project",
			    "subject": "What to bring to your first BuildOS session",
			  },
			  {
			    "body": "Hi Alex,

			Most tools make you start from zero.

			You open a blank workspace, stare at it for a minute, and then put the work off because you are still the one responsible for turning the mess into structure.

			That is the part BuildOS is trying to remove.

			You do not need a polished plan before you start.

			You need one place where you can say the messy version first and get something usable back.

			Open BuildOS, dump what is in your head, and let the system turn it into a project you can keep building on.

			Open BuildOS: https://build-os.com/onboarding

			DJ",
			    "branchKey": "no_project",
			    "label": "email_3/no_project",
			    "subject": "Why BuildOS works better than another blank workspace",
			  },
			  {
			    "body": "Hi Alex,

			You already got something into BuildOS. Good.

			The next step is finishing the setup that keeps you from starting from zero again.

			When you come back to a project, the point is not to generate text once.

			The point is to keep context attached to the work so the next session starts with something real instead of another blank page.

			Finish onboarding, turn on one follow-through channel, and reopen the project you started.

			Finish setup: https://build-os.com/onboarding

			DJ",
			    "branchKey": "finish_setup",
			    "label": "email_3/finish_setup",
			    "subject": "Most tools make you start from zero",
			  },
			  {
			    "body": "Hi Alex,

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

			Re-open your project: https://build-os.com/projects/project-1

			DJ",
			    "branchKey": "reopen_project",
			    "label": "email_3/reopen_project",
			    "subject": "Most tools make you start from zero",
			  },
			  {
			    "body": "Hi Alex,

			Getting your ideas out is step one.

			Making sure BuildOS can keep showing up for the work after that is step two.

			If you still have onboarding left, finish it now so the project you started does not turn into another thing you have to remember on your own.

			You do not need to set up everything at once.

			Just get to ready-state and give BuildOS one way to help you stay in motion after the first capture.

			Finish setup: https://build-os.com/onboarding

			DJ",
			    "branchKey": "finish_setup",
			    "label": "email_4/finish_setup",
			    "subject": "Capture is only half the system",
			  },
			  {
			    "body": "Hi Alex,

			Getting your ideas out is step one.

			Following through without having to remember everything yourself is step two.

			That is where the rest of setup matters.

			Pick one:
			- turn on the email daily brief
			- verify your phone if you want SMS nudges
			- connect your calendar if time and deadlines are part of your workflow

			You do not need to set up everything at once.

			Just give BuildOS one way to help you stay in motion after the first capture.

			Set up your daily brief: https://build-os.com/profile?tab=briefs

			DJ",
			    "branchKey": "follow_through_missing",
			    "label": "email_4/follow_through_missing",
			    "subject": "Capture is only half the system",
			  },
			  {
			    "body": "Hi Alex,

			By now you have probably felt one of two things: either it clicked, or you still do not know the best way to use this for your work.

			If you are still in the second group, reply and tell me what you are trying to move forward.

			BuildOS tends to click fastest for people who need to:
			- turn scattered project thinking into a usable plan
			- keep context attached to work across multiple sessions
			- stop bouncing between notes, task lists, and stateless AI chats
			- get one clear next move when everything feels equally urgent

			You do not need a huge system.

			You need one project in BuildOS that becomes more useful every time you come back to it.

			Open BuildOS: https://build-os.com/onboarding

			Or just reply to this email with what you are building.

			DJ",
			    "branchKey": "general_check_in",
			    "label": "email_5/general_check_in",
			    "subject": "What are you building right now?",
			  },
			  {
			    "body": "Hi Alex,

			You have already been back in BuildOS at least once, which is usually when it starts to click.

			If you are still in the second group, reply and tell me what you are trying to move forward.

			BuildOS tends to click fastest for people who need to:
			- turn scattered project thinking into a usable plan
			- keep context attached to work across multiple sessions
			- stop bouncing between notes, task lists, and stateless AI chats
			- get one clear next move when everything feels equally urgent

			You do not need a huge system.

			You need one project in BuildOS that becomes more useful every time you come back to it.

			Open BuildOS: https://build-os.com/projects/project-1

			Or just reply to this email with what you are building.

			DJ",
			    "branchKey": "returning_check_in",
			    "label": "email_5/returning_check_in",
			    "subject": "What are you building right now?",
			  },
			]
		`);
	});

	it('keeps banned voice phrases out of rendered welcome copy', () => {
		const rendered = [
			contentVariant('email_1/welcome', 'email_1'),
			contentVariant('email_2/no_project', 'email_2'),
			contentVariant('email_3/no_project', 'email_3'),
			contentVariant('email_3/finish_setup', 'email_3', {
				projectCount: 1,
				latestProjectId: 'project-1'
			}),
			contentVariant('email_3/reopen_project', 'email_3', {
				projectCount: 1,
				latestProjectId: 'project-1',
				onboardingCompleted: true
			}),
			contentVariant('email_4/finish_setup', 'email_4'),
			contentVariant('email_4/follow_through_missing', 'email_4', {
				onboardingCompleted: true
			}),
			contentVariant('email_5/general_check_in', 'email_5'),
			contentVariant('email_5/returning_check_in', 'email_5', {
				projectCount: 1,
				latestProjectId: 'project-1',
				lastVisit: '2026-03-02T02:00:00.000Z'
			})
		];

		for (const variant of rendered) {
			expect(findWelcomeCopyVoiceIssues(`${variant.subject}\n${variant.body}`)).toEqual([]);
		}
	});
});
