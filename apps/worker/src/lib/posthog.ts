// apps/worker/src/lib/posthog.ts
// Server-side PostHog capture for the long-running Railway worker. Events are
// batched (flushed every 5s) since the process stays alive. Safe no-op without
// PUBLIC_POSTHOG_KEY. See docs/marketing/growth/posthog-analytics-workflow.md.
import { PostHog } from 'posthog-node';

let client: PostHog | null | undefined;

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
	if (!posthog) return;
	try {
		posthog.capture({ distinctId, event, properties });
	} catch (error) {
		console.error(`[posthog] failed to capture ${event}:`, error);
	}
}

/** Flush pending events; call from graceful shutdown. Bounded to 3s. */
export async function shutdownPostHog(): Promise<void> {
	if (client) {
		await client.shutdown(3000).catch(() => {});
	}
}
