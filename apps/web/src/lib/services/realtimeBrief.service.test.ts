// apps/web/src/lib/services/realtimeBrief.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn() }
}));

import { get } from 'svelte/store';
import { RealtimeBriefService, briefNotificationStatus } from './realtimeBrief.service';

function createClient() {
	const statusCallbacks: Array<(status: string) => void> = [];
	const channels: any[] = [];
	const client: any = {
		channel: vi.fn((topic: string) => {
			const channel: any = {
				topic,
				on: vi.fn(() => channel),
				subscribe: vi.fn((callback: (status: string) => void) => {
					statusCallbacks.push(callback);
					return channel;
				})
			};
			channels.push(channel);
			return channel;
		}),
		removeChannel: vi.fn().mockResolvedValue('ok'),
		from: vi.fn(() => {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				in: () => builder,
				order: () => builder,
				limit: () => Promise.resolve({ data: [], error: null })
			};
			return builder;
		})
	};
	return { client, channels, statusCallbacks };
}

describe('RealtimeBriefService reconnect', () => {
	afterEach(async () => {
		await RealtimeBriefService.cleanup();
		vi.useRealTimers();
	});

	it('removes the errored channel before subscribing a fresh one', async () => {
		vi.useFakeTimers();
		const { client, channels, statusCallbacks } = createClient();

		await RealtimeBriefService.initialize('user-1', client, 'UTC');
		expect(channels).toHaveLength(1);

		statusCallbacks[0]?.('CHANNEL_ERROR');
		await vi.advanceTimersByTimeAsync(1000);

		expect(client.removeChannel).toHaveBeenCalledWith(channels[0]);
		expect(channels).toHaveLength(2);
		const removeOrder = client.removeChannel.mock.invocationCallOrder[0];
		const recreateOrder = client.channel.mock.invocationCallOrder[1];
		expect(removeOrder).toBeLessThan(recreateOrder);
	});

	it('binds postgres_changes only to queue_jobs (published for realtime)', async () => {
		const { client, channels } = createClient();

		await RealtimeBriefService.initialize('user-1', client, 'UTC');

		// One unpublished table makes Realtime reject every table binding on the channel.
		const tables = channels[0].on.mock.calls
			.filter(([type]: [string]) => type === 'postgres_changes')
			.map(([, config]: [string, { table: string }]) => config.table);
		expect(tables).toEqual(['queue_jobs']);
	});
});

describe('RealtimeBriefService.clearStatusForDate', () => {
	it('clears the nav indicator only for the matching brief date', () => {
		briefNotificationStatus.set({ isGenerating: true, briefDate: '2026-10-05', progress: 10 });

		RealtimeBriefService.clearStatusForDate('2026-10-04');
		expect(get(briefNotificationStatus).isGenerating).toBe(true);

		RealtimeBriefService.clearStatusForDate('2026-10-05');
		expect(get(briefNotificationStatus).isGenerating).toBe(false);
	});
});

describe('RealtimeBriefService terminal job signals', () => {
	afterEach(() => {
		briefNotificationStatus.set({ isGenerating: false });
		(RealtimeBriefService as any).state.activeJobsByDate.clear();
		(RealtimeBriefService as any).state.shownNotifications.clear();
	});

	// The daily-brief card (daily-brief-notification.bridge) reads these
	// verdicts off the status store; a silent clear would leave it spinning
	// with nothing to say.
	it('publishes completed with the job and date instead of clearing silently', () => {
		(RealtimeBriefService as any).handleJobCompleted(
			{ queue_job_id: 'job-1', completed_at: '2026-10-29T12:00:00.000Z' },
			'2026-10-29'
		);

		expect(get(briefNotificationStatus)).toMatchObject({
			isGenerating: false,
			status: 'completed',
			briefDate: '2026-10-29',
			jobId: 'job-1',
			completedAt: '2026-10-29T12:00:00.000Z'
		});
	});

	it('publishes failed with the error message', () => {
		(RealtimeBriefService as any).handleJobFailed(
			{ queue_job_id: 'job-2', error_message: 'LLM timed out' },
			'2026-10-29'
		);

		expect(get(briefNotificationStatus)).toMatchObject({
			isGenerating: false,
			status: 'failed',
			briefDate: '2026-10-29',
			jobId: 'job-2',
			error: 'LLM timed out'
		});
	});
});
