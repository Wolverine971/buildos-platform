import { describe, expect, it } from 'vitest';

import {
	buildDailyBriefEmailHtml,
	normalizeDailyBriefMarkdown
} from './daily-brief-email-template.js';

describe('normalizeDailyBriefMarkdown', () => {
	it('closes an unmatched strong marker on the same line', () => {
		expect(normalizeDailyBriefMarkdown('Start with **approving')).toBe(
			'Start with **approving**'
		);
	});

	it('preserves balanced markers and fenced code', () => {
		const markdown = ['Keep **this** balanced.', '```md', 'literal ** marker', '```'].join(
			'\n'
		);

		expect(normalizeDailyBriefMarkdown(markdown)).toBe(markdown);
	});
});

describe('buildDailyBriefEmailHtml', () => {
	it('renders the brief in one responsive Inkprint-style shell', () => {
		const html = buildDailyBriefEmailHtml({
			subject: 'BuildOS Daily Brief - Wednesday, August 26, 2026',
			contentHtml: '<h1>Aug 26, 2026</h1><h2>Executive Brief</h2><p>Clear day.</p>',
			briefUrl: 'https://build-os.com/projects?briefDate=2026-08-26',
			managePreferencesUrl: 'https://build-os.com/profile?tab=notifications',
			unsubscribeUrl: 'https://build-os.com/api/email-tracking/tracking-id/unsubscribe',
			primaryActionLabel: 'View in BuildOS →',
			postalAddressHtml: '<p>BuildOS mailing address</p>'
		});

		expect(html).toContain('BuildOS&nbsp;&nbsp;<span');
		expect(html).toContain('Daily Brief</span>');
		expect(html).toContain('class="email-content brief-content"');
		expect(html).toContain('max-width: 620px');
		expect(html).toContain('@media only screen and (max-width: 620px)');
		expect(html).toContain('<h1>Aug 26, 2026</h1>');
		expect(html).toContain('View in BuildOS →');
		expect(html).toContain('Manage preferences');
		expect(html).toContain('Turn off daily briefs');
		expect(html).toContain('BuildOS mailing address');
		expect(html).not.toContain('>|</span>');
	});

	it('escapes values placed in the document title and link attributes', () => {
		const html = buildDailyBriefEmailHtml({
			subject: '<Daily & Brief>',
			contentHtml: '<p>Sanitized upstream</p>',
			briefUrl: 'https://build-os.com/projects?day=1&view=brief',
			managePreferencesUrl: 'https://build-os.com/profile?tab=notifications',
			unsubscribeUrl: 'https://build-os.com/unsubscribe',
			primaryActionLabel: 'Open <brief>'
		});

		expect(html).toContain('<title>&lt;Daily &amp; Brief&gt;</title>');
		expect(html).toContain('day=1&amp;view=brief');
		expect(html).toContain('Open &lt;brief&gt;');
	});
});
