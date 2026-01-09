// apps/web/src/routes/api/onto/shared/error-logging.ts
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export type OntologyApiErrorContext = {
	supabase: App.Locals['supabase'];
	error: unknown;
	endpoint: string;
	method: string;
	userId?: string;
	projectId?: string;
	entityType?: string;
	entityId?: string;
	operation?: string;
	tableName?: string;
	metadata?: Record<string, unknown>;
};

export async function logOntologyApiError(context: OntologyApiErrorContext): Promise<void> {
	try {
		const logger = ErrorLoggerService.getInstance(context.supabase);
		await logger.logError(context.error, {
			userId: context.userId,
			projectId: context.projectId,
			endpoint: context.endpoint,
			httpMethod: context.method,
			operationType: context.operation,
			tableName: context.tableName,
			recordId: context.entityId,
			metadata: {
				source: 'ontology_api',
				entityType: context.entityType,
				...context.metadata
			}
		});
	} catch (loggingError) {
		console.error('[Ontology API] Failed to log error:', loggingError);
	}
}
