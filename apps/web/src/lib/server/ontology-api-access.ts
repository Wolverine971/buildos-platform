// apps/web/src/lib/server/ontology-api-access.ts
import { ApiResponse } from '$lib/utils/api-response';
import {
	logOntologyApiError,
	type OntologyApiErrorContext
} from '$lib/server/ontology-api-error-logging';

export type OntologyProjectAccessLevel = 'read' | 'write' | 'admin';

type OntologySupabase = App.Locals['supabase'];
type AuthenticatedUser = { id: string };
type ErrorResponseFactory = (error: unknown) => Response;

export type AccessAuditContext = Omit<
	OntologyApiErrorContext,
	'supabase' | 'error' | 'userId' | 'operation' | 'tableName'
> & {
	consoleLabel?: string;
};

type AccessQueryResult<T> = {
	data: T | null;
	error: unknown | null;
};

export type ResolvedOntologyActor = {
	actorId: string;
	userId: string;
};

export type OntologyActorResult =
	| { ok: true; actor: ResolvedOntologyActor }
	| { ok: false; response: Response };

export type OntologyProjectAccessResult =
	| { ok: true; actor: ResolvedOntologyActor; projectId: string }
	| { ok: false; response: Response };

export type OntologyEntityAccessResult<T> =
	| {
			ok: true;
			actorId: string;
			entity: T;
			projectId: string;
	  }
	| { ok: false; response: Response };

async function reportAccessError({
	supabase,
	error,
	actor,
	projectId,
	operation,
	tableName,
	audit,
	consoleMessage
}: {
	supabase: OntologySupabase;
	error: unknown;
	actor?: ResolvedOntologyActor;
	projectId?: string;
	operation: string;
	tableName?: string;
	audit: AccessAuditContext;
	consoleMessage: string;
}): Promise<void> {
	console.error(`[${audit.consoleLabel ?? 'Ontology Access'}] ${consoleMessage}:`, error);

	try {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: audit.endpoint,
			method: audit.method,
			userId: actor?.userId,
			projectId: projectId ?? audit.projectId,
			entityType: audit.entityType,
			entityId: audit.entityId,
			operation,
			tableName,
			metadata: audit.metadata
		});
	} catch (loggingError) {
		// The logger already fails open. Keep the access boundary fail-open for
		// logging even if that implementation or a test double changes.
		console.error('[Ontology Access] Failed to report access error:', loggingError);
	}
}

export async function requireOntologyActor({
	supabase,
	user,
	audit,
	operation,
	failureMessage = 'Failed to resolve user identity',
	errorResponse = (error) => ApiResponse.internalError(error, failureMessage)
}: {
	supabase: OntologySupabase;
	user: AuthenticatedUser;
	audit: AccessAuditContext;
	operation: string;
	failureMessage?: string;
	errorResponse?: ErrorResponseFactory;
}): Promise<OntologyActorResult> {
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: user.id
	});

	if (actorError || !actorId) {
		const error = actorError || new Error('Failed to resolve user actor');
		await reportAccessError({
			supabase,
			error,
			actor: { actorId: '', userId: user.id },
			operation,
			audit,
			consoleMessage: 'Failed to resolve actor'
		});
		return { ok: false, response: errorResponse(error) };
	}

	return {
		ok: true,
		actor: {
			actorId,
			userId: user.id
		}
	};
}

export async function requireCurrentActorProjectAccess({
	supabase,
	actor,
	projectId,
	requiredAccess,
	audit,
	operation,
	forbiddenMessage,
	failureMessage = 'Failed to check project access',
	errorResponse = (error) => ApiResponse.internalError(error, failureMessage)
}: {
	supabase: OntologySupabase;
	actor: ResolvedOntologyActor;
	projectId: string;
	requiredAccess: OntologyProjectAccessLevel;
	audit: AccessAuditContext;
	operation: string;
	forbiddenMessage: string;
	failureMessage?: string;
	errorResponse?: ErrorResponseFactory;
}): Promise<OntologyProjectAccessResult> {
	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_member_access',
		{
			p_project_id: projectId,
			p_required_access: requiredAccess
		}
	);

	if (accessError) {
		await reportAccessError({
			supabase,
			error: accessError,
			actor,
			projectId,
			operation,
			audit,
			consoleMessage: 'Failed to check project access'
		});
		return { ok: false, response: errorResponse(accessError) };
	}

	if (!hasAccess) {
		return { ok: false, response: ApiResponse.forbidden(forbiddenMessage) };
	}

	return { ok: true, actor, projectId };
}

export async function requireProjectEntityAccess<T extends { project_id: string }>({
	supabase,
	user,
	loadEntity,
	requiredAccess,
	audit,
	actorOperation,
	entityOperation,
	accessOperation,
	tableName,
	notFoundResource,
	forbiddenMessage,
	actorFailureMessage,
	accessFailureMessage,
	actorErrorResponse,
	accessErrorResponse
}: {
	supabase: OntologySupabase;
	user: AuthenticatedUser;
	loadEntity: () => PromiseLike<AccessQueryResult<T>>;
	requiredAccess: OntologyProjectAccessLevel;
	audit: AccessAuditContext;
	actorOperation: string;
	entityOperation: string;
	accessOperation: string;
	tableName: string;
	notFoundResource: string;
	forbiddenMessage: string;
	actorFailureMessage?: string;
	accessFailureMessage?: string;
	actorErrorResponse?: ErrorResponseFactory;
	accessErrorResponse?: ErrorResponseFactory;
}): Promise<OntologyEntityAccessResult<T>> {
	const actorResult = await requireOntologyActor({
		supabase,
		user,
		audit,
		operation: actorOperation,
		failureMessage: actorFailureMessage,
		errorResponse: actorErrorResponse
	});
	if (!actorResult.ok) return actorResult;

	const { data: entity, error: entityError } = await loadEntity();
	if (entityError) {
		await reportAccessError({
			supabase,
			error: entityError,
			actor: actorResult.actor,
			operation: entityOperation,
			tableName,
			audit,
			consoleMessage: `Failed to fetch ${audit.entityType ?? 'entity'}`
		});
		return { ok: false, response: ApiResponse.databaseError(entityError) };
	}

	if (!entity) {
		return { ok: false, response: ApiResponse.notFound(notFoundResource) };
	}

	const accessResult = await requireCurrentActorProjectAccess({
		supabase,
		actor: actorResult.actor,
		projectId: entity.project_id,
		requiredAccess,
		audit,
		operation: accessOperation,
		forbiddenMessage,
		failureMessage: accessFailureMessage,
		errorResponse: accessErrorResponse
	});
	if (!accessResult.ok) return accessResult;

	return {
		ok: true,
		actorId: actorResult.actor.actorId,
		entity,
		projectId: entity.project_id
	};
}
