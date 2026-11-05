// apps/worker/tests/dailyBriefEmailSanitization.test.ts
//
// The daily brief email mixes model output with text other people wrote (shared-project
// titles and names). None of it may put live HTML, remote images or outside links in the mail.
import { afterEach, describe, expect, it } from 'vitest';
import { isAllowedEmailLinkHref, renderMarkdown } from '../src/lib/utils/markdown';
import {
	buildOthersActivityBriefSection,
	formatOthersActivitySection
} from '../src/workers/brief/othersActivityBriefSection';
import {
	buildDailyBriefEmailHtml,
	normalizeDailyBriefMarkdown
} from '../src/workers/notification/daily-brief-email-template';

const ME = 'user-me';
const SAM = 'user-sam';
const IMG = '<img src="https://pixel.example.invalid/p.gif">';
const ANCHOR = '<a href="https://evil.example.invalid/x">click</a>';

function collaboratorSection(title: string, actorName = 'Sam') {
	return buildOthersActivityBriefSection({
		userId: ME,
		logs: [
			{
				project_id: 'p-shared',
				entity_type: 'task',
				entity_id: 't-1',
				action: 'created',
				before_data: null,
				after_data: { title, state_key: 'todo' },
				created_at: '2026-10-23T12:00:00.000Z',
				changed_by: SAM,
				changed_by_actor_id: null,
				external_agent_caller_id: null
			}
		],
		projects: [
			{
				id: 'p-shared',
				name: 'Cadre',
				isShared: true,
				isWorkspace: false,
				createdBy: 'actor-sam'
			}
		],
		people: new Map([[SAM, { actorId: 'actor-sam', name: actorName }]]),
		callers: new Map(),
		titles: new Map(),
		windowStart: new Date('2026-10-22T07:00:00Z'),
		windowLabel: 'since your last brief'
	});
}

function renderEmail(markdown: string): string {
	return buildDailyBriefEmailHtml({
		subject: 'BuildOS Daily Brief',
		contentHtml: renderMarkdown(normalizeDailyBriefMarkdown(markdown)),
		briefUrl: 'https://build-os.com/briefs?date=2026-10-23',
		managePreferencesUrl: 'https://build-os.com/profile?tab=notifications',
		unsubscribeUrl: 'https://build-os.com/unsubscribe',
		primaryActionLabel: 'Open brief'
	});
}

describe('daily brief email: collaborator text', () => {
	it('escapes inline HTML in a collaborator task title and name as text', () => {
		const markdown = formatOthersActivitySection(
			collaboratorSection(`${IMG}${ANCHOR}`.slice(0, 80), `Sam ${IMG}`)
		);
		// Markdown keeps the angle brackets escaped, so no raw tag reaches the renderer.
		expect(markdown).not.toMatch(/(^|[^\\])<img/);
		expect(markdown).toContain('\\<img');

		const html = renderEmail(markdown);
		expect(html).not.toContain('<img');
		expect(html).not.toMatch(/<a\s[^>]*href="https:\/\/(evil|pixel)\.example\.invalid/);
		// The title still shows, as text, inside its working app link.
		expect(html).toContain('&lt;img');
		expect(html).toContain('href="/projects/p-shared/tasks/t-1"');
	});
});

describe('daily brief email: renderMarkdown', () => {
	const originalAppUrl = process.env.PUBLIC_APP_URL;
	afterEach(() => {
		if (originalAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
		else process.env.PUBLIC_APP_URL = originalAppUrl;
	});

	it('renders raw inline HTML from model output as text', () => {
		const html = renderMarkdown(`Summary ${IMG} and ${ANCHOR}`);
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<a ');
		expect(html).toContain('&lt;img');
	});

	it('drops markdown images, including remote ones', () => {
		const html = renderMarkdown('Look ![data](https://pixel.example.invalid/p.gif?d=secret)');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('pixel.example.invalid');
	});

	it('unlinks outside links but keeps app and calendar links clickable', () => {
		process.env.PUBLIC_APP_URL = 'https://app.build-os.test';
		const html = renderMarkdown(
			[
				'- [outside](https://evil.example.invalid/x?d=secret)',
				'- [protocol relative](//evil.example.invalid/x)',
				'- [task](/projects/p1/tasks/t1)',
				'- [app](https://build-os.com/briefs)',
				'- [configured](https://app.build-os.test/projects)',
				'- [Google Calendar](https://www.google.com/calendar/event?eid=abc)',
				'- bare https://evil.example.invalid/auto'
			].join('\n')
		);
		expect(html).not.toContain('evil.example.invalid/x"');
		expect(html).not.toContain('href="https://evil');
		expect(html).not.toContain('href="//evil');
		expect(html).toContain('outside');
		expect(html).toContain('href="/projects/p1/tasks/t1"');
		expect(html).toContain('href="https://build-os.com/briefs"');
		expect(html).toContain('href="https://app.build-os.test/projects"');
		expect(html).toContain('href="https://www.google.com/calendar/event?eid=abc"');
		// Text after an unlinked anchor survives (sanitize-html span quirk).
		expect(html).toContain('protocol relative');
		expect(html).toContain('Google Calendar');
	});

	it('classifies hrefs', () => {
		expect(isAllowedEmailLinkHref('/projects/x')).toBe(true);
		expect(isAllowedEmailLinkHref('//evil.example.invalid')).toBe(false);
		expect(isAllowedEmailLinkHref('/\\evil.example.invalid')).toBe(false);
		expect(isAllowedEmailLinkHref('https://www.google.com/url?q=https://evil')).toBe(false);
		expect(isAllowedEmailLinkHref('javascript:alert(1)')).toBe(false);
		expect(isAllowedEmailLinkHref('https://build-os.com.evil.invalid/')).toBe(false);
	});
});

describe('daily brief email: full template', () => {
	it('carries no remote image or outside link from a collaborator title', () => {
		const markdown = [
			'# Oct 23, 2026',
			'',
			formatOthersActivitySection(collaboratorSection(`Ship ${IMG}`)),
			formatOthersActivitySection(collaboratorSection(`Ship ${ANCHOR}`))
		].join('\n');
		const html = renderEmail(markdown);
		// The tag text survives only as escaped text (&lt;...), never as a live element.
		expect(html).not.toMatch(/<img[^>]+example\.invalid/);
		expect(html).not.toMatch(/<a\s[^>]*href="https?:\/\/[^"]*example\.invalid/);
		expect(html).toContain('Ship &lt;a href=');
	});
});
