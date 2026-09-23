// apps/web/src/lib/services/calendar-webhook-check.test.ts
import { describe, expect, it, vi } from 'vitest';

const registerWebhook = vi.fn().mockResolvedValue({ success: true });
vi.mock('./calendar-webhook-service', () => ({
	CalendarWebhookService: vi.fn(function () {
		return { registerWebhook };
	})
}));

import { batchCheckAndRegisterWebhooks } from './calendar-webhook-check';

function createSupabase(options: {
	tokenUserIds: string[];
	channelUserIds: string[];
	channelError?: unknown;
}) {
	const ranges: Array<[number, number]> = [];
	const orders: string[] = [];
	const from = (table: string) => {
		const builder: any = {
			select: () => builder,
			not: () => builder,
			order: (column: string) => (orders.push(column), builder),
			range: (start: number, end: number) => {
				ranges.push([start, end]);
				return Promise.resolve({
					data: options.tokenUserIds
						.slice(start, end + 1)
						.map((user_id) => ({ user_id })),
					error: null
				});
			},
			in: (_column: string, ids: string[]) =>
				Promise.resolve({
					data: options.channelError
						? null
						: ids
								.filter((id) => options.channelUserIds.includes(id))
								.map((user_id) => ({ user_id })),
					error: options.channelError ?? null
				})
		};
		if (table !== 'user_calendar_tokens' && table !== 'calendar_webhook_channels') {
			throw new Error(`unexpected table ${table}`);
		}
		return builder;
	};
	return { supabase: { from } as any, ranges, orders };
}

describe('batchCheckAndRegisterWebhooks', () => {
	it('pages past users who already have webhooks to reach ones who do not', async () => {
		registerWebhook.mockClear();
		const healthy = Array.from({ length: 600 }, (_, i) => `a-${String(i).padStart(4, '0')}`);
		const { supabase, ranges, orders } = createSupabase({
			tokenUserIds: [...healthy, 'z-missing'],
			channelUserIds: healthy
		});

		const result = await batchCheckAndRegisterWebhooks(supabase, 'https://build-os.test', 5);

		expect(orders).toContain('user_id');
		expect(ranges).toEqual([
			[0, 499],
			[500, 999]
		]);
		expect(registerWebhook).toHaveBeenCalledWith(
			'z-missing',
			'https://build-os.test/webhooks/calendar-events',
			'primary'
		);
		expect(result).toEqual({ total: 601, registered: 1, failures: 0 });
	});

	it('reports a channel lookup error instead of treating everyone as missing', async () => {
		registerWebhook.mockClear();
		const { supabase } = createSupabase({
			tokenUserIds: ['u-1'],
			channelUserIds: [],
			channelError: { message: 'boom' }
		});

		const result = await batchCheckAndRegisterWebhooks(supabase, 'https://build-os.test', 5);

		expect(registerWebhook).not.toHaveBeenCalled();
		expect(result.failures).toBeGreaterThan(0);
	});
});
