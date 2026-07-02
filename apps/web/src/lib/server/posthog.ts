// apps/web/src/lib/server/posthog.ts
// Server-side PostHog capture for SvelteKit API routes. Uses captureImmediate
// so events are actually sent before the serverless function freezes (Vercel
// gives no reliable post-response execution window). Safe no-op without
// PUBLIC_POSTHOG_KEY. See docs/marketing/growth/posthog-analytics-workflow.md.
import { PostHog } from 'posthog-node';
import { env } from '$env/dynamic/public';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

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
	status: 'captured' | 'skipped' | 'error',
	event: string,
	details?: Record<string, unknown>
): void {
	if (!FUNNEL_EVENTS.has(event)) return;
	console.info('[posthog-health]', {
		runtime: 'web-server',
		status,
		event,
		...details
	});
}

async function logCaptureFailure(
	error: unknown,
	distinctId: string,
	event: string,
	properties?: Record<string, unknown>
): Promise<void> {
	if (!FUNNEL_EVENTS.has(event)) return;

	try {
		const adminClient = createAdminSupabaseClient();
		await ErrorLoggerService.getInstance(adminClient as any).logError(
			error,
			{
				userId: distinctId,
				operationType: 'posthog_capture',
				operationPayload: { event, properties },
				metadata: {
					errorType: 'api_error',
					analyticsProvider: 'posthog',
					analyticsEvent: event,
					runtime: 'web-server'
				}
			},
			'warning'
		);
	} catch (loggingError) {
		console.error('[posthog-health] failed to persist capture failure:', loggingError);
	}
}

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
	const startedAt = Date.now();
	const posthog = getClient();
	if (!posthog) {
		logHealth('skipped', event, { reason: 'missing_key' });
		return;
	}
	try {
		await posthog.captureImmediate({ distinctId, event, properties });
		logHealth('captured', event, { duration_ms: Date.now() - startedAt });
	} catch (error) {
		logHealth('error', event, {
			duration_ms: Date.now() - startedAt,
			message: error instanceof Error ? error.message : String(error)
		});
		console.error(`[posthog] failed to capture ${event}:`, error);
		await logCaptureFailure(error, distinctId, event, properties);
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
