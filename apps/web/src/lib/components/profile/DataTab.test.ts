// apps/web/src/lib/components/profile/DataTab.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataTab from './DataTab.svelte';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function panel(overrides: { export?: unknown; remainingToday?: number; gmail?: unknown } = {}) {
	return {
		success: true,
		data: {
			summary: {
				generatedAt: '2026-09-24T12:00:00.000Z',
				workspace: {
					projects: 46,
					documents: 300,
					tasks: 624,
					chats: 1482,
					messages: 5096,
					voiceNotes: 194,
					dailyBriefs: 268,
					uploads: 0
				},
				traces: { toolTraces: 809, promptSnapshots: 64, aiUsageRecords: 20001 },
				connections: {
					gmail: overrides.gmail ?? {
						connected: false,
						needsReconnect: false,
						lastReadAt: null
					},
					calendar: { connected: true, lastSyncedAt: new Date().toISOString() },
					agents: [
						{
							id: 'agent-1',
							provider: 'claude-browser',
							name: 'Claude connector',
							lastUsedAt: new Date().toISOString()
						}
					]
				}
			},
			export: overrides.export ?? null,
			remainingToday: overrides.remainingToday ?? 3
		}
	};
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('DataTab', () => {
	it('shows the live counts, windows, and only true connection states', async () => {
		const fetcher = vi.fn(async () => jsonResponse(panel()));
		render(DataTab, { props: { fetcher: fetcher as unknown as typeof fetch } });

		expect(await screen.findByText(/46 projects · 300 docs · 624 tasks/)).toBeTruthy();
		expect(screen.getByText(/1,482 chats · 5,096 messages/)).toBeTruthy();
		expect(screen.getByText('809 tool traces')).toBeTruthy();
		expect(screen.getByText('13 months')).toBeTruthy();
		// Gmail is not connected: no read/retention claim for it.
		expect(screen.getByText('Not connected.')).toBeTruthy();
		expect(
			screen.getByText(
				/title and time of the events behind each suggestion, then deletes them within 30 days/
			)
		).toBeTruthy();
		expect(screen.getByText(/Claude connector/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Delete my account' }).getAttribute('href')).toBe(
			'/profile?section=delete'
		);
		expect(fetcher).toHaveBeenCalledWith('/api/account/data-summary');
	});

	it('starts an export, shows progress, and stops polling once it is ready', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const queued = {
			id: 'e1',
			status: 'queued',
			requestedAt: new Date().toISOString(),
			startedAt: null,
			completedAt: null,
			expiresAt: null,
			byteSize: null,
			errorCode: null,
			downloadPaths: []
		};
		const ready = {
			...queued,
			status: 'ready',
			byteSize: 5 * 1024 * 1024,
			completedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
			downloadPaths: ['/api/account/exports/e1/download?part=1']
		};
		let statusCalls = 0;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === '/api/account/data-summary') return jsonResponse(panel());
			if (url === '/api/account/exports' && init?.method === 'POST') {
				return jsonResponse({ success: true, data: { export: queued } }, 201);
			}
			statusCalls += 1;
			return jsonResponse({
				success: true,
				data: { export: statusCalls >= 2 ? ready : queued, remainingToday: 2 }
			});
		});
		render(DataTab, { props: { fetcher: fetcher as unknown as typeof fetch } });

		await fireEvent.click(await screen.findByRole('button', { name: /Download/ }));
		expect(await screen.findByText('Your export is in line…')).toBeTruthy();

		await vi.advanceTimersByTimeAsync(5_000);
		await waitFor(() => expect(screen.getByText(/Your export is ready · 5.0 MB/)).toBeTruthy());
		const link = screen.getByRole('link', { name: /Download zip/ });
		expect(link.getAttribute('href')).toBe('/api/account/exports/e1/download?part=1');

		const callsWhenReady = fetcher.mock.calls.length;
		await vi.advanceTimersByTimeAsync(20_000);
		expect(fetcher.mock.calls.length).toBe(callsWhenReady);
	});

	it('explains the daily limit instead of failing silently', async () => {
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
			init?.method === 'POST'
				? jsonResponse(
						{
							success: false,
							error: 'You can start 3 exports a day. Try again later.',
							details: { nextAllowedAt: '2026-09-25T15:04:00.000Z' }
						},
						429
					)
				: jsonResponse(panel({ remainingToday: 1 }))
		);
		render(DataTab, { props: { fetcher: fetcher as unknown as typeof fetch } });

		await fireEvent.click(await screen.findByRole('button', { name: /Download/ }));
		expect((await screen.findByRole('alert')).textContent).toMatch(
			/You've used today's 3 exports/
		);
	});
});
