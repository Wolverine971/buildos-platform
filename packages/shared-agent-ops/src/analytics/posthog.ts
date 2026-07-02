// packages/shared-agent-ops/src/analytics/posthog.ts
// Product-analytics capture usable from any runtime this package runs in
// (Vercel serverless via the web app, long-running Railway worker). Reads
// PUBLIC_POSTHOG_KEY/PUBLIC_POSTHOG_HOST from process.env, same pattern as the
// calendar port credentials. Uses captureImmediate so events survive
// serverless freeze. Safe no-op when the key is unset.
// See docs/marketing/growth/posthog-analytics-workflow.md.
import { PostHog } from 'posthog-node';

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
	if (client !== undefined) return client;
	const key = process.env.PUBLIC_POSTHOG_KEY;
	client = key
		? new PostHog(key, {
				host: process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
				flushAt: 1,
				flushInterval: 0
			})
		: null;
	return client;
}

/** Capture a product event tied to a user. Never throws. */
export async function captureProductEvent(
	distinctId: string,
	event: string,
	properties?: Record<string, unknown>
): Promise<void> {
	const posthog = getClient();
	if (!posthog) return;
	try {
		await posthog.captureImmediate({ distinctId, event, properties });
	} catch (error) {
		console.error(`[posthog] failed to capture ${event}:`, error);
	}
}
