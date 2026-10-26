// apps/web/src/lib/components/email-campaigns/SendPanel.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import SendPanel from './SendPanel.svelte';
import type { CampaignRecipientView } from '$lib/email-campaigns/types';

function people(count: number): CampaignRecipientView[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `r${index}`,
		email: `p${index}@example.com`,
		name: `Person ${index}`,
		first_name: `Person`,
		user_id: null,
		beta_signup_id: null,
		segment: 'no_project',
		context: {},
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
		last_contacted_at: null
	}));
}

beforeEach(() => {
	Object.defineProperty(window, 'scrollTo', {
		configurable: true,
		writable: true,
		value: vi.fn()
	});
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		writable: true,
		value: vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve(), play: vi.fn() }))
	});
});

afterEach(() => cleanup());

describe('SendPanel', () => {
	it('explains the wave plan and queues after confirming', async () => {
		const onqueue = vi.fn();
		render(SendPanel, {
			props: {
				subjectTemplate: 'hi {{first_name}}',
				bodyTemplate: '<p>Hello</p>',
				fromName: 'DJ',
				recipients: people(83),
				waveSize: 20,
				waveIntervalMinutes: 60,
				startsAt: null,
				editable: true,
				onplan: vi.fn(),
				onqueue,
				ontest: vi.fn()
			}
		});

		expect(
			screen.getAllByText(/83 emails in 5 waves of up to 20, 1 hour apart/).length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: /Queue 83 emails/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Queue 83' }));
		expect(onqueue).toHaveBeenCalledTimes(1);
	});

	it('blocks queueing and says why', () => {
		render(SendPanel, {
			props: {
				subjectTemplate: '',
				bodyTemplate: '',
				fromName: 'DJ',
				recipients: people(2),
				waveSize: 20,
				waveIntervalMinutes: 60,
				startsAt: null,
				editable: true,
				onplan: vi.fn(),
				onqueue: vi.fn(),
				ontest: vi.fn()
			}
		});

		expect(screen.getByText('Add a subject line.')).toBeInTheDocument();
		expect(screen.getByText('Write the email body.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Queue 2 emails/ })).toBeDisabled();
	});

	it('sends plan changes up', async () => {
		const onplan = vi.fn();
		render(SendPanel, {
			props: {
				subjectTemplate: 'hi',
				bodyTemplate: '<p>hi</p>',
				fromName: 'DJ',
				recipients: people(3),
				waveSize: 20,
				waveIntervalMinutes: 60,
				startsAt: null,
				editable: true,
				onplan,
				onqueue: vi.fn(),
				ontest: vi.fn()
			}
		});

		const size = screen.getByLabelText('People per wave') as HTMLInputElement;
		await fireEvent.change(size, { target: { value: '500' } });
		expect(onplan).toHaveBeenCalledWith({ wave_size: 200 });

		await fireEvent.click(screen.getByLabelText(/Pick a time/));
		expect(onplan).toHaveBeenCalledWith({ starts_at: expect.any(String) });
	});
});
