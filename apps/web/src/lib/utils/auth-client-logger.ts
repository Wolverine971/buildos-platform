// apps/web/src/lib/utils/auth-client-logger.ts
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { supabase } from '$lib/supabase';

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
	if (!supabase) return;

	try {
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
