// apps/web/src/lib/utils/ontology-client-logger.ts
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createSupabaseBrowser, type TypedSupabaseClient } from '@buildos/supabase-client';

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
	const supabase = getOntologyLoggerSupabase();
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

let ontologyLoggerSupabase: TypedSupabaseClient | null | undefined;

function getOntologyLoggerSupabase(): TypedSupabaseClient | null {
	if (!browser) return null;
	if (ontologyLoggerSupabase !== undefined) return ontologyLoggerSupabase;

	try {
		ontologyLoggerSupabase = createSupabaseBrowser(
			PUBLIC_SUPABASE_URL,
			PUBLIC_SUPABASE_ANON_KEY
		);
	} catch {
		ontologyLoggerSupabase = null;
	}

	return ontologyLoggerSupabase;
}
