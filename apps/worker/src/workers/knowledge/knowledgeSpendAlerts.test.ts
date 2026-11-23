// apps/worker/src/workers/knowledge/knowledgeSpendAlerts.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { createTrackedInAppNotification } from '@buildos/shared-agent-ops/ops/tracked-in-app-notification.service';
import { runKnowledgeSpendAlerts } from './knowledgeSpendAlerts';

type Row = Record<string, any>;

/** Enough of the query builder for the spend reads, name/admin lookups and sent-alert check. */
function fakeDb(tables: Record<string, Row[]>) {
	return {
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let from = 0;
			let to = Infinity;
			const value = (row: Row, col: string) =>
				col.includes('->>') ? row[col.split('->>')[0]!]?.[col.split('->>')[1]!] : row[col];
			const query: any = {
				select: () => query,
				eq: (col: string, v: unknown) => (filters.push((r) => value(r, col) === v), query),
				in: (col: string, vs: unknown[]) => (
					filters.push((r) => vs.includes(value(r, col))),
					query
				),
				gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), query),
				order: () => query,
				range: (f: number, t: number) => ((from = f), (to = t), query),
				then(ok: (v: unknown) => unknown) {
					const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
					return Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(
						ok
					);
				}
			};
			return query;
		},
		rpc: vi.fn()
	};
}

const NOW = new Date('2026-11-18T20:00:00Z');
const TODAY = '2026-11-18T10:00:00Z';
const YESTERDAY = '2026-11-17T23:00:00Z';
const sent = {
	success: true,
	eventId: 'event',
	deliveryId: 'delivery',
	userNotificationId: 'notification',
	correlationId: 'correlation'
};

function tables(): Record<string, Row[]> {
	return {
		users: [
			{ id: 'u-dana', name: 'Dana', email: 'dana@x.test', is_admin: false },
			{ id: 'u-sam', name: 'Sam', email: 'sam@x.test', is_admin: false },
			{ id: 'u-dj', name: 'DJ', email: 'dj@x.test', is_admin: true }
		],
		llm_usage_logs: [
			// Dana: 0.12 of wrap-up today (over the 0.10 cap); yesterday's spend doesn't count.
			{
				id: 1,
				user_id: 'u-dana',
				operation_type: 'chat_checkpoint_knowledge',
				total_cost_usd: 0.08,
				created_at: TODAY
			},
			{
				id: 2,
				user_id: 'u-dana',
				operation_type: 'chat_checkpoint_knowledge_gate',
				total_cost_usd: 0.04,
				created_at: TODAY
			},
			{
				id: 3,
				user_id: 'u-sam',
				operation_type: 'chat_checkpoint_knowledge',
				total_cost_usd: 0.5,
				created_at: YESTERDAY
			},
			// Research-side model calls never count toward the wrap-up cap.
			{
				id: 4,
				user_id: 'u-sam',
				operation_type: 'knowledge_circle',
				total_cost_usd: 0.5,
				created_at: TODAY
			}
		],
		knowledge_runs: [
			{
				id: 1,
				owner_user_id: 'u-sam',
				run_type: 'enrichment',
				cost_usd: 0.2,
				created_at: TODAY
			}
		],
		notification_events: []
	};
}

describe('knowledge spend alerts', () => {
	it("alerts every admin once when someone's wrap-up reaches the cap, and stays quiet otherwise", async () => {
		const data = tables();
		const notify = vi.fn<typeof createTrackedInAppNotification>((input) => {
			data.notification_events!.push({
				event_type: input.eventType,
				created_at: NOW.toISOString(),
				metadata: input.metadata
			});
			return Promise.resolve(sent);
		});
		const first = await runKnowledgeSpendAlerts({ db: fakeDb(data), now: NOW, notify });
		expect(first).toEqual({ alerts: 1, sent: 1, skipped: 0 });
		expect(notify).toHaveBeenCalledWith(
			expect.objectContaining({
				recipientUserId: 'u-dj',
				eventType: 'billing_ops_anomaly',
				title: 'Chat wrap-up cap reached: Dana',
				metadata: { alert_key: 'knowledge_spend:2026-11-18:wrap_up:u-dana' }
			})
		);

		// The next sweep the same day sends nothing new.
		const second = await runKnowledgeSpendAlerts({ db: fakeDb(data), now: NOW, notify });
		expect(second).toEqual({ alerts: 1, sent: 0, skipped: 1 });
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('alerts on research budget and the daily total', async () => {
		const data = tables();
		data.knowledge_runs!.push(
			{
				id: 2,
				owner_user_id: 'u-sam',
				run_type: 'enrichment',
				cost_usd: 0.4,
				created_at: TODAY
			},
			{
				id: 3,
				owner_user_id: 'u-dj',
				run_type: 'enrichment',
				cost_usd: 4.5,
				created_at: TODAY
			}
		);
		const notify = vi.fn<typeof createTrackedInAppNotification>().mockResolvedValue(sent);
		await runKnowledgeSpendAlerts({ db: fakeDb(data), now: NOW, notify });
		const titles = notify.mock.calls.map(([input]) => input.title).sort();
		expect(titles).toEqual([
			'Chat wrap-up cap reached: Dana',
			'Knowledge spend today: $5.22',
			'Research budget reached: Sam'
		]);
	});
});
