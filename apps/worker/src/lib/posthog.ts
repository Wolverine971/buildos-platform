// apps/worker/src/lib/posthog.ts
// Server-side PostHog capture for the long-running Railway worker. Events are
// batched (flushed every 5s) since the process stays alive. Safe no-op without
// PUBLIC_POSTHOG_KEY. See docs/marketing/growth/posthog-analytics-workflow.md.
import { PostHog } from 'posthog-node';
import { logWorkerError } from './errorLogger';

let client: PostHog | null | undefined;

const FUNNEL_EVENTS = new Set([
	'signup',
	'onboarding_started',
	'onboarding_completed',
	'brain_dump_created',
	'project_created',
	'brief_generated',
	'brief_viewed',
	'task_completed'
]);

function logHealth(
	status: 'queued' | 'skipped' | 'error',
	event: string,
	details?: Record<string, unknown>
): void {
	if (!FUNNEL_EVENTS.has(event)) return;
	console.info('[posthog-health]', {
		runtime: 'worker',
		status,
		event,
		...details
	});
}

function getClient(): PostHog | null {
	if (client !== undefined) return client;
	const key = process.env.PUBLIC_POSTHOG_KEY;
	client = key
		? new PostHog(key, {
				host: process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
				flushAt: 5,
				flushInterval: 5000
			})
		: null;
	return client;
}

/** Fire-and-forget worker event tied to a user. Never throws. */
export function captureWorkerEvent(
	distinctId: string,
	event: string,
	properties?: Record<string, unknown>
): void {
	const posthog = getClient();
	if (!posthog) {
		logHealth('skipped', event, { reason: 'missing_key' });
		return;
	}
	try {
		posthog.capture({ distinctId, event, properties });
		logHealth('queued', event);
	} catch (error) {
		logHealth('error', event, {
			message: error instanceof Error ? error.message : String(error)
		});
		console.error(`[posthog] failed to capture ${event}:`, error);
		void logWorkerError(error, {
			userId: distinctId,
			operationType: 'posthog_capture',
			operationPayload: { event, properties } as any,
			errorType: 'api_error',
			severity: 'warning',
			metadata: {
				analyticsProvider: 'posthog',
				analyticsEvent: event,
				runtime: 'worker'
			}
		});
	}
}

/** Flush pending events; call from graceful shutdown. Bounded to 3s. */
export async function shutdownPostHog(): Promise<void> {
	if (client) {
		await client.shutdown(3000).catch(() => {});
	}
}
