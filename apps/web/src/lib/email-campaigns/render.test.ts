// apps/web/src/lib/email-campaigns/render.test.ts
import { describe, expect, it } from 'vitest';
import { BUILDOS_MAILING_ADDRESS } from '@buildos/shared-types';
import {
	extractLinks,
	findUnknownMergeFields,
	firstNameFrom,
	formatSignupMonth,
	htmlToPlainText,
	renderCampaignEmail,
	renderCampaignEmailDocument,
	renderMergeFields
} from './render';

describe('renderMergeFields', () => {
	it('fills known fields and uses fallbacks when a value is missing', () => {
		expect(
			renderMergeFields(
				'Hi {{first_name}}, since {{ signup_month }} — {{last_project|that idea}}',
				{
					first_name: 'Kay',
					signup_month: 'July 2025'
				},
				{ escapeHtml: false }
			)
		).toBe('Hi Kay, since July 2025 — that idea');
		expect(renderMergeFields('Hi {{first_name}}', {}, { escapeHtml: false })).toBe('Hi there');
	});

	it('escapes values placed into HTML', () => {
		expect(
			renderMergeFields(
				'<p>{{first_name}}</p>',
				{ first_name: '<b>Al</b>' },
				{ escapeHtml: true }
			)
		).toBe('<p>&lt;b&gt;Al&lt;/b&gt;</p>');
	});

	it('leaves unknown fields visible and reports them', () => {
		expect(renderMergeFields('Hi {{firstname}}', {}, { escapeHtml: false })).toBe(
			'Hi {{firstname}}'
		);
		expect(findUnknownMergeFields('{{firstname}} {{first_name}} {{plan}}')).toEqual([
			'firstname',
			'plan'
		]);
	});
});

describe('htmlToPlainText', () => {
	it('keeps paragraphs, breaks, lists, and link targets', () => {
		const text = htmlToPlainText(
			'<p>Hi Kay,</p><p>It&rsquo;s ready.<br>Try it: <a href="https://build-os.com/s/start">start here</a></p><ul><li>one</li><li>two</li></ul>'
		);
		expect(text).toBe(
			'Hi Kay,\n\nIt’s ready.\nTry it: start here (https://build-os.com/s/start)\n\n- one\n\n- two'
		);
	});

	it('does not repeat a link whose label is the URL', () => {
		expect(
			htmlToPlainText('<p><a href="https://build-os.com">https://build-os.com</a></p>')
		).toBe('https://build-os.com');
	});
});

describe('renderCampaignEmail', () => {
	const campaign = {
		subject_template: 'quick note, {{first_name}}',
		body_template: '<p>Hi {{first_name}},</p><p>You started {{last_project}}.</p>'
	};

	it('merges the template for people without their own version', () => {
		const rendered = renderCampaignEmail(campaign, {
			first_name: 'Kay',
			context: { last_project: 'Ætherian Faith' }
		});
		expect(rendered.subject).toBe('quick note, Kay');
		expect(rendered.bodyHtml).toBe('<p>Hi Kay,</p><p>You started Ætherian Faith.</p>');
		expect(rendered.text).toBe('Hi Kay,\n\nYou started Ætherian Faith.');
		expect(rendered.usesOverride).toBe(false);
	});

	it("prefers the person's own subject and body", () => {
		const rendered = renderCampaignEmail(campaign, {
			first_name: 'Kay',
			context: {},
			subject_override: 'your source of truth doc',
			body_override: '<p>Hi {{first_name}} — tailored.</p>'
		});
		expect(rendered.subject).toBe('your source of truth doc');
		expect(rendered.bodyHtml).toBe('<p>Hi Kay — tailored.</p>');
		expect(rendered.usesOverride).toBe(true);
	});

	it('works with an empty template when everyone has their own version', () => {
		const rendered = renderCampaignEmail(
			{ subject_template: '', body_template: '' },
			{ first_name: null, context: null, subject_override: 'hi', body_override: '<p>x</p>' }
		);
		expect(rendered.subject).toBe('hi');
		expect(rendered.bodyHtml).toBe('<p>x</p>');
	});
});

describe('renderCampaignEmailDocument', () => {
	it('uses the plain template with the mailing address and an unsubscribe preview', () => {
		const html = renderCampaignEmailDocument(
			{ subject: 'hi', bodyHtml: '<p>Hello</p>' },
			{ unsubscribeUrl: '#unsubscribe-preview' }
		);
		expect(html).toContain('<p>Hello</p>');
		expect(html).toContain(BUILDOS_MAILING_ADDRESS.replace(/,/g, ','));
		expect(html).toContain('#unsubscribe-preview');
		expect(html).toContain('You can opt out of these BuildOS emails');
	});
});

describe('helpers', () => {
	it('extracts links in order', () => {
		expect(
			extractLinks(
				'<a href="https://a.com/x?y=1&amp;z=2">a</a> <a class="b" href=\'/s/start\'>b</a>'
			)
		).toEqual(['https://a.com/x?y=1&z=2', '/s/start']);
	});

	it('derives first names and signup months', () => {
		expect(firstNameFrom('kay dee')).toBe('Kay');
		expect(firstNameFrom('DJ Wayne')).toBe('DJ');
		expect(firstNameFrom('  ')).toBeNull();
		expect(formatSignupMonth('2025-07-14T12:00:00Z')).toBe('July 2025');
		expect(formatSignupMonth(null)).toBeNull();
	});
});

describe('footer order', () => {
	it('puts the unsubscribe line above the mailing address', () => {
		const html = renderCampaignEmailDocument(
			{ subject: 'hi', bodyHtml: '<p>Hello</p>' },
			{ unsubscribeUrl: '#unsubscribe-preview' }
		);
		expect(html.indexOf('#unsubscribe-preview')).toBeLessThan(
			html.indexOf('BuildOS mailing address:')
		);
		expect(html.match(/BuildOS mailing address:/g)).toHaveLength(1);
	});
});
