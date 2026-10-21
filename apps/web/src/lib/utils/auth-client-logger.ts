// apps/web/src/lib/utils/auth-client-logger.ts
import { browser } from '$app/environment';

type AuthClientErrorContext = {
	endpoint: string;
	method: string;
	operation?: string;
	metadata?: Record<string, unknown>;
};

export async function logAuthClientError(
	error: unknown,
	context: AuthClientErrorContext
): Promise<void> {
	if (!browser) return;

	try {
		// Error reporting must not pull the database SDK into the auth page's
		// initial bundle. Keep loading failures inside this best-effort logger.
		const [{ ErrorLoggerService }, { supabase }] = await Promise.all([
			import('$lib/services/errorLogger.service'),
			import('$lib/supabase')
		]);
		if (!supabase) return;

		const logger = ErrorLoggerService.getInstance(supabase);
		let userId: string | undefined;

		try {
			const { data } = await supabase.auth.getUser();
			userId = data?.user?.id;
		} catch {
			userId = undefined;
		}

		await logger.logError(error, {
			userId,
			endpoint: context.endpoint,
			httpMethod: context.method,
			operationType: context.operation,
			metadata: {
				source: 'auth_ui',
				...context.metadata
			}
		});
	} catch (logError) {
		console.error('[Auth UI] Failed to log error:', logError);
	}
}
