// apps/worker/src/workers/knowledge/knowledgeSpendAlerts.ts
//
// Every 15 minutes: has anyone's knowledge spend reached a cap today (chat wrap-up, "Find
// more" research), or has everyone's together passed the daily total? Each threshold alerts
// every admin once per UTC day, in-app, through the admin-only `billing_ops_anomaly` event.
// Users never see caps or these alerts (DJ, 2026-11-18). Free: database reads only.

import {
	type KnowledgeDataClient,
	knowledgeSpendAlerts,
	knowledgeSpendToday
} from '@buildos/shared-agent-ops/knowledge';
import { createTrackedInAppNotification } from '@buildos/shared-agent-ops/ops/tracked-in-app-notification.service';

const ALERT_EVENT = 'billing_ops_anomaly';

export type KnowledgeSpendAlertResult = { alerts: number; sent: number; skipped: number };

export async function runKnowledgeSpendAlerts(deps: {
	db: KnowledgeDataClient;
	now?: Date;
	notify?: typeof createTrackedInAppNotification;
}): Promise<KnowledgeSpendAlertResult> {
	const { db } = deps;
	const now = deps.now ?? new Date();
	const notify = deps.notify ?? createTrackedInAppNotification;
	const day = await knowledgeSpendToday(db, now);
	if (!day.users.length) return { alerts: 0, sent: 0, skipped: 0 };

	const { data: people, error: peopleError } = await db
		.from('users')
		.select('id, name, email')
		.in(
			'id',
			day.users.map((u) => u.userId)
		);
	if (peopleError) throw new Error(`Load names: ${peopleError.message}`);
	const names = new Map(
		((people ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map(
			(p) => [p.id, p.name?.trim() || p.email?.split('@')[0] || p.id.slice(0, 8)]
		)
	);
	const alerts = knowledgeSpendAlerts(day, (id) => names.get(id) ?? id.slice(0, 8));
	if (!alerts.length) return { alerts: 0, sent: 0, skipped: 0 };

	// Already alerted today: the key rides on the event's metadata.
	const { data: sentRows, error: sentError } = await db
		.from('notification_events')
		.select('metadata')
		.eq('event_type', ALERT_EVENT)
		.gte('created_at', day.since)
		.in(
			'metadata->>alert_key',
			alerts.map((a) => a.key)
		);
	if (sentError) throw new Error(`Load sent alerts: ${sentError.message}`);
	const already = new Set(
		((sentRows ?? []) as Array<{ metadata: Record<string, unknown> | null }>).map(
			(row) => row.metadata?.alert_key
		)
	);
	const fresh = alerts.filter((alert) => !already.has(alert.key));
	if (!fresh.length) return { alerts: alerts.length, sent: 0, skipped: alerts.length };

	const { data: admins, error: adminError } = await db
		.from('users')
		.select('id')
		.eq('is_admin', true);
	if (adminError) throw new Error(`Load admins: ${adminError.message}`);

	let sent = 0;
	for (const alert of fresh) {
		for (const admin of (admins ?? []) as Array<{ id: string }>) {
			const result = await notify({
				supabase: db as never,
				recipientUserId: admin.id,
				eventType: ALERT_EVENT,
				eventSource: 'cron_scheduler',
				type: 'billing_ops_alert',
				title: alert.title,
				message: alert.message,
				priority: 'high',
				actionUrl: '/admin/chat#llm-usage',
				expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
				payload: { kind: 'knowledge_spend', alert_key: alert.key },
				data: { kind: 'knowledge_spend', alert_key: alert.key },
				metadata: { alert_key: alert.key }
			});
			if (result.success) sent++;
			else console.warn('[knowledge spend] alert not sent:', result.error);
		}
	}
	return { alerts: alerts.length, sent, skipped: alerts.length - fresh.length };
}
