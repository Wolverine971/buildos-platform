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
			contentVariant(
				'email_2/no_project',
				'email_2',
				{},
				{
					sentAt: { email_1: STARTED_AT }
				}
			),
			contentVariant(
				'email_2/already_created_project',
				'email_2',
				{
					projectCount: 1,
					latestProjectId: 'project-1'
				},
				{
					sentAt: { email_1: STARTED_AT }
				}
			),
			contentVariant(
				'email_3/no_project',
				'email_3',
				{},
				{
					sentAt: { email_1: STARTED_AT, email_2: STARTED_AT }
				}
			),
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

			Welcome to BuildOS. A project workspace you can talk to.

			Tell it what you are working on. BuildOS organizes your notes, tasks, and next steps.

			Start with this:
			"I'm working on ____. Here's what I have so far. Here's where I'm stuck."

			Paste any rough notes you already have. Then open the project to review the tasks and documents it creates.

			Start with one project: https://build-os.com/onboarding

			DJ",
			    "branchKey": "welcome",
			    "label": "email_1/welcome",
			    "subject": "Welcome to BuildOS",
			  },
			  {
			    "body": "Hi Alex,

			Pick one thing you are working on: a book, a video, a launch, or a project of your own.

			Describe it like this:
			"I'm working on ____. Here's what I have so far. Here's where I'm stuck."

			If you came to BuildOS to turn the thing you are trying to build into a real plan, start there.

			BuildOS turns that conversation into a project with tasks and documents you can open and edit.

			Start with one project: https://build-os.com/onboarding

			DJ",
			    "branchKey": "no_project",
			    "label": "email_2/no_project",
			    "subject": "Bring the rough notes you already have",
			  },
			  {
			    "body": "Hi Alex,

			You have started a project in BuildOS. Give it one update next.

			Tell BuildOS one thing that changed: something you finished, a new idea, or a deadline that moved.

			Open the project chat and describe the change you want. Then open the task or document to check the result.

			Keep working in that same project as your plans develop.

			Re-open your project: https://build-os.com/projects/project-1

			DJ",
			    "branchKey": "already_created_project",
			    "label": "email_2/already_created_project",
			    "subject": "Tell your project what changed",
			  },
			  {
			    "body": "Hi Alex,

			Your first message can be the rough version of what you are trying to do.

			"I'm working on ____. Here's what I have so far. Here's where I'm stuck."

			After BuildOS creates the project, open a task or document. If something needs changing, tell it in chat.

			Start with one project: https://build-os.com/onboarding

			DJ",
			    "branchKey": "no_project",
			    "label": "email_3/no_project",
			    "subject": "One conversation to start your project",
			  },
			  {
			    "body": "Hi Alex,

			You have already created a project in BuildOS.

			Finish the remaining onboarding steps, then open that project. Calendar and notification connections are optional.

			Tell BuildOS one thing that changed: something you finished, a new idea, or a deadline that moved.

			Your next conversation can build on the work you have already saved.

			Finish setup: https://build-os.com/onboarding

			DJ",
			    "branchKey": "finish_setup",
			    "label": "email_3/finish_setup",
			    "subject": "Your project is saved. Pick up from there.",
			  },
			  {
			    "body": "Hi Alex,

			Open the project you started and look at its notes and unfinished tasks.

			Tell BuildOS one thing that changed: something you finished, a new idea, or a deadline that moved.

			Use the project chat to make the update, check the result, and ask what to tackle next.

			That is the loop: start a project, update it as you work, and come back to keep going.

			Re-open your project: https://build-os.com/projects/project-1

			DJ",
			    "branchKey": "reopen_project",
			    "label": "email_3/reopen_project",
			    "subject": "Pick up where you left off",
			  },
			  {
			    "body": "Hi Alex,

			Getting your ideas out is step one.

			Making sure BuildOS can keep showing up for the work after that is step two.

			If you still have onboarding left, finish it now so the project you started does not turn into another thing you have to remember on your own.

			You do not need to set up everything at once.

			Just get set up enough that BuildOS can keep showing up for the work after the first capture.

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
			contentVariant('email_2/already_created_project', 'email_2', {
				projectCount: 1,
				latestProjectId: 'project-1'
			}),
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
