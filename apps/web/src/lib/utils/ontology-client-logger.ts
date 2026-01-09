// apps/web/src/lib/utils/ontology-client-logger.ts
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { supabase } from '$lib/supabase';

type OntologyClientErrorContext = {
	endpoint: string;
	method: string;
	projectId?: string;
	entityType?: string;
	entityId?: string;
	operation?: string;
	metadata?: Record<string, unknown>;
};

export async function logOntologyClientError(
	error: unknown,
	context: OntologyClientErrorContext
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
			projectId: context.projectId,
			endpoint: context.endpoint,
			httpMethod: context.method,
			operationType: context.operation,
			recordId: context.entityId,
			metadata: {
				source: 'ontology_ui',
				entityType: context.entityType,
				...context.metadata
			}
		});
	} catch (logError) {
		console.error('[Ontology UI] Failed to log error:', logError);
	}
}
