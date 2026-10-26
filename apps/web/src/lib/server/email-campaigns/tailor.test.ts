// apps/web/src/lib/server/email-campaigns/tailor.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn(function () {
		throw new Error('tests must inject a fake model; never call a real one');
	})
}));

import { FakeDb } from './fake-db.test-helper';
import {
	TAILOR_OPERATION_TYPE,
	buildTailorSystemPrompt,
	buildTailorUserPrompt,
	tailorRecipients,
	toBasicRecipientView,
	validateTailoredEmail
} from './tailor';

const BASE_BODY =
	'<p>Hi Kay,</p><p>BuildOS is ready. <a href="https://build-os.com/s/welcome-back">Come back</a>.</p><p>DJ</p>';

const campaign = {
	id: 'campaign-1',
	name: 'Reactivation',
	subject_template: 'about your buildos signup',
	body_template:
		'<p>Hi {{first_name}},</p><p>BuildOS is ready. <a href="https://build-os.com/s/welcome-back">Come back</a>.</p><p>DJ</p>',
	from_name: 'DJ'
};

function recipient(id: string, overrides: Record<string, any> = {}) {
	return {
		id,
		campaign_id: 'campaign-1',
		email: `${id}@example.com`,
		name: 'Kay Dee',
		first_name: 'Kay',
		user_id: null,
		beta_signup_id: 'signup-1',
		segment: 'beta_no_account',
		context: {
			has_account: false,
			signup_month: 'July 2025',
			why_interested: 'I lose track of research threads',
			productivity_tools: ['Notion', 'Obsidian']
		},
		subject_override: null,
		body_override: null,
		override_source: null,
		tailor_status: 'none',
		tailor_error: null,
		tailored_at: null,
		included: true,
		status: 'draft',
		skip_reason: null,
		scheduled_for: null,
		sent_at: null,
		replied_at: null,
		bounced_at: null,
		error_message: null,
		...overrides
	};
}

describe('validateTailoredEmail', () => {
	it('accepts a clean email that keeps every link', () => {
		const result = validateTailoredEmail(
			{
				subject: '  your research threads ',
				body_html:
					'<p>Hi Kay,</p><p>You told me you lose track of research threads. <a href="https://build-os.com/s/welcome-back">Come back</a>.</p><p>DJ</p>'
			},
			BASE_BODY
		);
		expect(result).toMatchObject({ ok: true, subject: 'your research threads' });
	});

	it('rejects an email that dropped or changed a link', () => {
		const result = validateTailoredEmail(
			{
				subject: 'hi',
				body_html: '<p>Come back: <a href="https://build-os.com/welcome-back">here</a></p>'
			},
			BASE_BODY
		);
		expect(result).toEqual({
			ok: false,
			error: 'The AI dropped or changed a link: https://build-os.com/s/welcome-back'
		});
	});

	it('rejects leftover merge fields, empty parts, and long subjects', () => {
		const link = '<a href="https://build-os.com/s/welcome-back">x</a>';
		expect(
			validateTailoredEmail(
				{ subject: 'hi {{first_name}}', body_html: `<p>${link}</p>` },
				BASE_BODY
			)
		).toMatchObject({ ok: false });
		expect(
			validateTailoredEmail({ subject: '', body_html: `<p>${link}</p>` }, BASE_BODY)
		).toMatchObject({ ok: false });
		expect(
			validateTailoredEmail({ subject: 'hi', body_html: '<p> </p>' }, BASE_BODY)
		).toMatchObject({ ok: false });
		expect(
			validateTailoredEmail(
				{ subject: 'x'.repeat(121), body_html: `<p>${link}</p>` },
				BASE_BODY
			)
		).toMatchObject({ ok: false });
		expect(validateTailoredEmail(null, BASE_BODY)).toMatchObject({ ok: false });
	});

	it('wraps plain-text bodies in paragraphs and strips unsafe markup', () => {
		const plain = validateTailoredEmail(
			{ subject: 'hi', body_html: 'Hi Kay,\n\nCome back: https://build-os.com' },
			'<p>no links</p>'
		);
		expect(plain).toMatchObject({
			ok: true,
			body_html: '<p>Hi Kay,</p>\n<p>Come back: https://build-os.com</p>'
		});

		const unsafe = validateTailoredEmail(
			{
				subject: 'hi',
				body_html:
					'<p onclick="x()">Hi</p><script>alert(1)</script><img src="x"><a href="javascript:alert(1)">bad</a><a href="https://build-os.com/s/welcome-back" target="_blank">ok</a>'
			},
			BASE_BODY
		);
		expect(unsafe.ok).toBe(true);
		if (unsafe.ok) {
			expect(unsafe.body_html).not.toMatch(/script|onclick|<img|javascript:|target=/);
			expect(unsafe.body_html).toContain('href="https://build-os.com/s/welcome-back"');
		}
	});
});

describe('tailoring prompts', () => {
	it('gives the model the base email, DJ’s instructions, and only the person’s facts', () => {
		const prompt = buildTailorUserPrompt({
			campaign,
			recipient: recipient('r1'),
			instructions: 'Mention their tools if they listed any.'
		});
		expect(prompt).toContain('Mention their tools if they listed any.');
		expect(prompt).toContain('Subject: about your buildos signup');
		expect(prompt).toContain('Hi Kay,');
		expect(prompt).toContain('Signed up: July 2025');
		expect(prompt).toContain('Signup form, tools they use: Notion, Obsidian');
		expect(prompt).not.toContain('r1@example.com');
		expect(buildTailorSystemPrompt()).toContain('Keep every link');
	});
});

describe('tailorRecipients', () => {
	function db(rows: Record<string, any>[]) {
		return new FakeDb({ email_campaign_recipients: rows });
	}

	it('saves each valid rewrite as that person’s own version', async () => {
		const fake = db([recipient('r1')]);
		const llm = {
			getJSONResponse: vi.fn(async () => ({
				subject: 'your research threads',
				body_html:
					'<p>Hi Kay,</p><p><a href="https://build-os.com/s/welcome-back">Come back</a></p><p>DJ</p>'
			}))
		};
		const outcomes = await tailorRecipients({
			supabase: fake as any,
			campaign,
			recipients: [recipient('r1')],
			instructions: 'short',
			adminUserId: 'admin-1',
			llm: llm as any,
			now: () => new Date('2026-10-27T14:00:00.000Z')
		});

		expect(outcomes).toEqual([
			expect.objectContaining({ id: 'r1', ok: true, subject: 'your research threads' })
		]);
		expect(llm.getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				operationType: TAILOR_OPERATION_TYPE,
				profile: 'balanced',
				userId: 'admin-1'
			})
		);
		expect(fake.table('email_campaign_recipients')[0]).toMatchObject({
			subject_override: 'your research threads',
			override_source: 'tailored',
			tailor_status: 'done',
			tailored_at: '2026-10-27T14:00:00.000Z',
			tailor_error: null
		});
	});

	it('records a failure and leaves the existing version alone', async () => {
		const fake = db([
			recipient('r1', { subject_override: 'kept', body_override: '<p>kept</p>' }),
			recipient('r2')
		]);
		const llm = {
			getJSONResponse: vi
				.fn()
				.mockResolvedValueOnce({ subject: 'x', body_html: '<p>no link</p>' })
				.mockRejectedValueOnce(new Error('rate limited'))
		};
		const outcomes = await tailorRecipients({
			supabase: fake as any,
			campaign: { ...campaign, body_template: BASE_BODY },
			recipients: [
				recipient('r1', { subject_override: 'kept', body_override: BASE_BODY }),
				recipient('r2')
			],
			instructions: null,
			adminUserId: 'admin-1',
			llm: llm as any,
			concurrency: 1
		});

		expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, false]);
		const [first, second] = fake.table('email_campaign_recipients');
		expect(first).toMatchObject({
			subject_override: 'kept',
			tailor_status: 'failed',
			tailor_error: expect.stringContaining('dropped or changed a link')
		});
		expect(second).toMatchObject({
			tailor_status: 'failed',
			tailor_error: 'Tailoring failed: rate limited'
		});
	});

	it('never changes someone whose email is already going out', async () => {
		const fake = db([recipient('r1', { status: 'sent' })]);
		const llm = {
			getJSONResponse: vi.fn(async () => ({
				subject: 'new',
				body_html: '<p><a href="https://build-os.com/s/welcome-back">x</a></p>'
			}))
		};
		await tailorRecipients({
			supabase: fake as any,
			campaign,
			recipients: [recipient('r1', { status: 'sent' })],
			instructions: null,
			adminUserId: 'admin-1',
			llm: llm as any
		});
		expect(fake.table('email_campaign_recipients')[0]).toMatchObject({
			subject_override: null,
			tailor_status: 'none'
		});
	});

	it('maps rows to the recipient view with empty engagement', () => {
		expect(toBasicRecipientView(recipient('r1') as any)).toMatchObject({
			id: 'r1',
			segment: 'beta_no_account',
			open_count: 0,
			click_count: 0,
			opened_at: null,
			last_contacted_at: null
		});
	});
});
