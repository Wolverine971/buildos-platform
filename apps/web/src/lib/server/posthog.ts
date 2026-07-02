// apps/web/src/lib/server/posthog.ts
// Server-side PostHog capture for SvelteKit API routes. Uses captureImmediate
// so events are actually sent before the serverless function freezes (Vercel
// gives no reliable post-response execution window). Safe no-op without
// PUBLIC_POSTHOG_KEY. See docs/marketing/growth/posthog-analytics-workflow.md.
import { PostHog } from 'posthog-node';
import { env } from '$env/dynamic/public';

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
	if (client !== undefined) return client;
	client = env.PUBLIC_POSTHOG_KEY
		? new PostHog(env.PUBLIC_POSTHOG_KEY, {
				host: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
				flushAt: 1,
				flushInterval: 0
			})
		: null;
	return client;
}

/**
 * Capture a server-side event tied to a user. Never throws; awaiting it adds
 * one HTTP round-trip (~50-150ms), acceptable on the funnel endpoints we
 * instrument (signup, braindump, project create, task complete).
 */
export async function captureServerEvent(
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

/**
 * Set person properties (e.g. signup attribution) without an accompanying
 * event. $set_once semantics for first-touch fields.
 */
export async function setPersonPropertiesOnce(
	distinctId: string,
	properties: Record<string, unknown>
): Promise<void> {
	const posthog = getClient();
	if (!posthog) return;
	try {
		await posthog.captureImmediate({
			distinctId,
			event: '$set',
			properties: { $set_once: properties }
		});
	} catch (error) {
		console.error('[posthog] failed to set person properties:', error);
	}
}
