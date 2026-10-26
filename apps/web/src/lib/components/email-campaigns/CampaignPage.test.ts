// apps/web/src/lib/components/email-campaigns/CampaignPage.test.ts
// @vitest-environment jsdom
// The old composer sent the last *saved* version, silently dropping fresh edits.
// The campaign page must flush the pending save before anything is queued.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import CampaignPage from './CampaignPage.svelte';
import type { CampaignDetail } from '$lib/email-campaigns/types';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const counts = {
	total: 1,
	included: 1,
	draft: 1,
	queued: 0,
	sending: 0,
	sent: 0,
	failed: 0,
	skipped: 0,
	canceled: 0,
	opened: 0,
	clicked: 0,
	replied: 0,
	unsubscribed: 0,
	bounced: 0,
	tailored: 0,
	edited: 0
};

function detail(overrides: Partial<CampaignDetail['campaign']> = {}): CampaignDetail {
	return {
		campaign: {
			id: 'c1',
			name: 'Signed up, no project',
			status: 'draft',
			subject_template: 'old subject',
			body_template: '<p>Hi {{first_name}}</p>',
			from_name: 'DJ',
			audience: { segments: ['no_project'], people: [], removed_emails: [] },
			tailoring_instructions: null,
			wave_size: 20,
			wave_interval_minutes: 60,
			starts_at: null,
			queued_at: null,
			completed_at: null,
			canceled_at: null,
			source: 'admin',
			created_at: '2026-10-25T12:00:00.000Z',
			updated_at: '2026-10-25T12:00:00.000Z',
			...overrides
		},
		recipients: [
			{
				id: 'r1',
				email: 'kay@example.com',
				name: 'Kay Dee',
				first_name: 'Kay',
				user_id: 'u1',
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
			}
		],
		counts,
		exclusions: []
	};
}

function ok(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: true, data }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function fail(message: string, status = 500): Response {
	return new Response(JSON.stringify({ success: false, error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

let calls: { method: string; url: string; body: unknown }[] = [];

function installFetch(options: { patchFails?: boolean } = {}) {
	calls = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			const body = init?.body ? JSON.parse(String(init.body)) : null;
			calls.push({ method, url, body });

			if (url.endsWith('/segments')) {
				return ok({
					segments: [
						{ segment: 'no_project', label: 'x', description: 'y', count: 88 },
						{ segment: 'went_quiet', label: 'x', description: 'y', count: 35 },
						{ segment: 'beta_no_account', label: 'x', description: 'y', count: 67 }
					]
				});
			}
			if (url.endsWith('/c1') && method === 'GET') return ok(detail());
			if (url.endsWith('/c1') && method === 'PATCH') {
				if (options.patchFails) return fail('Database unavailable');
				return ok({ campaign: { ...detail().campaign, ...body } });
			}
			if (url.endsWith('/c1/queue')) {
				return ok(detail({ status: 'sending', queued_at: '2026-10-25T12:01:00.000Z' }));
			}
			return fail(`unexpected ${method} ${url}`, 404);
		})
	);
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
		value: vi.fn(() => ({
			cancel: vi.fn(),
			commitStyles: vi.fn(),
			finished: Promise.resolve(),
			play: vi.fn(),
			onfinish: null
		}))
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function typeSubjectAndQueue() {
	render(CampaignPage, { props: { campaignId: 'c1', adminEmail: 'dj@example.com' } });
	const subject = (await screen.findByLabelText(/Subject/)) as HTMLInputElement;
	await fireEvent.input(subject, { target: { value: 'fresh subject' } });

	await fireEvent.click(screen.getByRole('button', { name: /Queue 1 email/ }));
	const confirm = await screen.findByRole('button', { name: 'Queue 1' });
	await fireEvent.click(confirm);
}

describe('CampaignPage', () => {
	it('saves the latest edit before queueing', async () => {
		installFetch();
		await typeSubjectAndQueue();

		await waitFor(() =>
			expect(calls.some((call) => call.url.endsWith('/c1/queue'))).toBe(true)
		);
		const patchIndex = calls.findIndex(
			(call) =>
				call.method === 'PATCH' && (call.body as any)?.subject_template === 'fresh subject'
		);
		const queueIndex = calls.findIndex((call) => call.url.endsWith('/c1/queue'));
		expect(patchIndex).toBeGreaterThan(-1);
		expect(patchIndex).toBeLessThan(queueIndex);
		expect(calls[queueIndex]?.body).toEqual({
			starts_at: null,
			wave_size: 20,
			wave_interval_minutes: 60
		});
	});

	it('does not queue when the save fails', async () => {
		installFetch({ patchFails: true });
		await typeSubjectAndQueue();

		await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(calls.some((call) => call.url.endsWith('/c1/queue'))).toBe(false);
		expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument();
	});
});
