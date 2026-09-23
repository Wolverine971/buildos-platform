// apps/web/src/lib/server/background.ts
import { waitUntil } from '@vercel/functions';

/**
 * Keep post-response work alive on Vercel. A bare fire-and-forget promise is
 * frozen or killed once the function returns its response; `waitUntil` extends
 * the invocation until the promise settles.
 *
 * Outside Vercel (local dev, tests, the worker) there is no request context, so
 * `waitUntil` is a no-op and the already-started promise simply runs to
 * completion in-process. Rejections are always logged here and never surface
 * as unhandled rejections.
 */
export function runAfterResponse(promise: Promise<unknown>, label: string): void {
	const guarded = Promise.resolve(promise).catch((error) => {
		console.error(`[background] ${label} failed:`, error);
	});
	try {
		waitUntil(guarded);
	} catch (error) {
		console.warn(`[background] waitUntil unavailable for ${label}:`, error);
	}
}
