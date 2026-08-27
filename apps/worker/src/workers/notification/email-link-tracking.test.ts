// apps/worker/src/workers/notification/email-link-tracking.test.ts
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../lib/utils/markdown.js';
import { buildDailyBriefEmailHtml } from './daily-brief-email-template.js';
import { rewriteLinksForTracking } from './email-link-tracking.js';

const BASE_URL = 'https://build-os.com';
const TRACKING_ID = 'tracking-1';

describe('rewriteLinksForTracking', () => {
	it('tracks relative and same-origin BuildOS destinations', () => {
		const html = [
			'<a href="/projects/project-1/tasks/task-1">Task</a>',
			'<a href="https://build-os.com/profile?tab=notifications">Preferences</a>'
		].join('');

		const rewritten = rewriteLinksForTracking(html, TRACKING_ID, BASE_URL);

		expect(rewritten).toContain(
			'/api/email-tracking/tracking-1/click?url=%2Fprojects%2Fproject-1%2Ftasks%2Ftask-1'
		);
		expect(rewritten).toContain(
			'/api/email-tracking/tracking-1/click?url=https%3A%2F%2Fbuild-os.com%2Fprofile%3Ftab%3Dnotifications'
		);
	});

	it('leaves external Google Calendar links direct', () => {
		const googleUrl = 'https://calendar.google.com/calendar/event?eid=event-1';
		const html = `<a href="${googleUrl}" target="_blank">Google Calendar</a>`;

		expect(rewriteLinksForTracking(html, TRACKING_ID, BASE_URL)).toBe(html);
	});

	it('does not rewrite anchors or unsubscribe links', () => {
		const html = [
			'<a href="#today">Today</a>',
			'<a href="https://build-os.com/api/email-tracking/tracking-1/unsubscribe">Unsubscribe</a>'
		].join('');

		expect(rewriteLinksForTracking(html, TRACKING_ID, BASE_URL)).toBe(html);
	});

	it('preserves rendered task, goal, project, and Google Calendar destinations end to end', () => {
		const contentHtml = renderMarkdown(`
- **[Approve launch plan](/projects/project-1/tasks/task-1)**
- **[Acquire 25 users](/projects/project-1?entity=goal&entity_id=goal-1)**
- [BuildOS](/projects/project-1)
- [Google Calendar](https://calendar.google.com/calendar/event?eid=event-1)
		`);
		const emailHtml = buildDailyBriefEmailHtml({
			subject: 'Daily Brief',
			contentHtml,
			briefUrl: `${BASE_URL}/briefs?date=2026-08-27&view=single&brief_id=brief-1`,
			managePreferencesUrl: `${BASE_URL}/profile?tab=notifications`,
			unsubscribeUrl: `${BASE_URL}/api/email-tracking/${TRACKING_ID}/unsubscribe`,
			primaryActionLabel: 'View in BuildOS →'
		});

		expect(contentHtml).toContain('target="_blank"');
		expect(contentHtml).toContain('rel="noopener noreferrer"');

		const rewritten = rewriteLinksForTracking(emailHtml, TRACKING_ID, BASE_URL);

		expect(rewritten).toContain('url=%2Fprojects%2Fproject-1%2Ftasks%2Ftask-1');
		expect(rewritten).toContain(
			'url=%2Fprojects%2Fproject-1%3Fentity%3Dgoal%26entity_id%3Dgoal-1'
		);
		expect(rewritten).toContain('url=%2Fprojects%2Fproject-1');
		expect(rewritten).toContain(
			'href="https://calendar.google.com/calendar/event?eid=event-1"'
		);
		expect(rewritten).not.toContain('url=https%3A%2F%2Fcalendar.google.com%2Fcalendar%2Fevent');
	});
});
