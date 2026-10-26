// apps/web/src/lib/components/email-campaigns/ReviewList.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import ReviewList from './ReviewList.svelte';
import type { CampaignRecipientView } from '$lib/email-campaigns/types';

function person(overrides: Partial<CampaignRecipientView>): CampaignRecipientView {
	return {
		id: 'r1',
		email: 'kay@example.com',
		name: 'Kay Dee',
		first_name: 'Kay',
		user_id: null,
		beta_signup_id: null,
		segment: 'no_project',
		context: { signup_month: 'July 2025' },
		subject_override: null,
		body_override: null,
		override_source: null,
		tailor_status: 'none',
		tailor_error: null,
		included: true,
		status: 'draft',
		skip_reason: null,
		scheduled_for: null,
		sent_at: null,
		replied_at: null,
		bounced_at: null,
		error_message: null,
		opened_at: null,
		open_count: 0,
		first_clicked_at: null,
		click_count: 0,
		unsubscribed_at: null,
		last_contacted_at: null,
		...overrides
	};
}

const recipients = [
	person({ id: 'template', name: 'Kay Dee', email: 'kay@example.com', first_name: 'Kay' }),
	person({
		id: 'tailored',
		name: 'Jack Kimmel',
		email: 'jack@example.com',
		first_name: 'Jack',
		subject_override: 'prioritizing, finally',
		body_override: '<p>Hi Jack, you said prioritizing was the hard part.</p>',
		override_source: 'tailored',
		tailor_status: 'done'
	}),
	person({
		id: 'imported',
		name: 'Eric',
		email: 'eric@example.com',
		first_name: 'Eric',
		segment: 'imported',
		subject_override: 'you signed up for buildos a year ago',
		body_override: '<p>Hi Eric, back in July 2025…</p>',
		override_source: 'imported',
		last_contacted_at: new Date(Date.now() - 3 * 86_400_000).toISOString()
	}),
	person({
		id: 'failed',
		name: 'Fay',
		email: 'fay@example.com',
		first_name: 'Fay',
		tailor_status: 'failed',
		tailor_error: 'link missing',
		included: false
	})
];

afterEach(() => cleanup());

describe('ReviewList', () => {
	it("shows every person's own subject and opening, with what shaped it", () => {
		render(ReviewList, {
			props: {
				subjectTemplate: 'hey {{first_name}}',
				bodyTemplate: '<p>Hi {{first_name}}, you signed up in {{signup_month}}.</p>',
				recipients,
				editable: true,
				onopen: vi.fn(),
				ontoggle: vi.fn()
			}
		});

		expect(screen.getByText('hey Kay')).toBeInTheDocument();
		expect(screen.getByText('Hi Kay, you signed up in July 2025.')).toBeInTheDocument();
		expect(screen.getByText('prioritizing, finally')).toBeInTheDocument();
		expect(screen.getByText('Tailored')).toBeInTheDocument();
		expect(
			screen.getByText('Imported', { selector: 'span.rounded-full.border.bg-muted' })
		).toBeInTheDocument();
		expect(screen.getByText('Emailed 3 days ago')).toBeInTheDocument();
		expect(screen.getByText('Tailoring failed')).toBeInTheDocument();
	});

	it('toggles a person in or out and opens their email', async () => {
		const ontoggle = vi.fn();
		const onopen = vi.fn();
		render(ReviewList, {
			props: {
				subjectTemplate: 'hey {{first_name}}',
				bodyTemplate: '<p>Hi</p>',
				recipients,
				editable: true,
				onopen,
				ontoggle
			}
		});

		await fireEvent.click(screen.getByLabelText('Skip Kay Dee'));
		expect(ontoggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'template' }), false);

		await fireEvent.click(screen.getByLabelText('Include Fay'));
		expect(ontoggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'failed' }), true);

		await fireEvent.click(screen.getByText('prioritizing, finally'));
		expect(onopen).toHaveBeenCalledWith('tailored');
	});

	it('filters to people who need a look', async () => {
		render(ReviewList, {
			props: {
				subjectTemplate: '',
				bodyTemplate: '',
				recipients,
				editable: true,
				onopen: vi.fn(),
				ontoggle: vi.fn()
			}
		});

		// Kay gets the (empty) template, so she needs a look; Fay is skipped.
		await fireEvent.click(screen.getByRole('tab', { name: /Needs a look/ }));
		const list = screen.getByRole('list');
		expect(within(list).getByText('Kay Dee')).toBeInTheDocument();
		expect(within(list).queryByText('Jack Kimmel')).not.toBeInTheDocument();
		expect(within(list).queryByText('Fay')).not.toBeInTheDocument();
	});

	it('locks the include toggles when not editable', () => {
		render(ReviewList, {
			props: {
				subjectTemplate: 'hi',
				bodyTemplate: '<p>hi</p>',
				recipients,
				editable: false,
				onopen: vi.fn(),
				ontoggle: vi.fn()
			}
		});
		expect(screen.getByLabelText('Skip Kay Dee')).toBeDisabled();
	});
});
