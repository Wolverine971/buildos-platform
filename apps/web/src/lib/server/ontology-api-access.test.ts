// apps/web/src/lib/server/ontology-api-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logOntologyApiErrorMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/ontology-api-error-logging', () => ({
	logOntologyApiError: logOntologyApiErrorMock
}));

import {
	requireCurrentActorProjectAccess,
	requireOntologyActor,
	requireProjectEntityAccess,
	type ResolvedOntologyActor
} from './ontology-api-access';

const user = { id: 'user-1' };
const actor: ResolvedOntologyActor = { actorId: 'actor-1', userId: user.id };
const audit = {
	endpoint: '/api/onto/documents/document-1',
	method: 'PATCH',
	entityType: 'document',
	entityId: 'document-1',
	consoleLabel: 'Document API'
};

function responseBody(response: Response): Promise<Record<string, unknown>> {
	return response.json() as Promise<Record<string, unknown>>;
}

describe('ontology API access primitives', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		logOntologyApiErrorMock.mockReset().mockResolvedValue(undefined);
	});

	it('maps and logs actor RPC failures without exposing the database error', async () => {
		const rpcError = { message: 'database detail' };
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: rpcError })
		};

		const result = await requireOntologyActor({
			supabase: supabase as never,
			user,
			audit,
			operation: 'document_actor_resolve'
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected actor resolution to fail');
		expect(result.response.status).toBe(500);
		expect(await responseBody(result.response)).toMatchObject({
			error: 'Failed to resolve user identity',
			code: 'INTERNAL_ERROR'
		});
		expect(logOntologyApiErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				error: rpcError,
				userId: user.id,
				operation: 'document_actor_resolve'
			})
		);
	});

	it('does not let a logging failure replace the access response', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		logOntologyApiErrorMock.mockRejectedValueOnce(new Error('logger unavailable'));
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: null })
		};

		const result = await requireOntologyActor({
			supabase: supabase as never,
			user,
			audit,
			operation: 'document_actor_resolve'
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected actor resolution to fail');
		expect(result.response.status).toBe(500);
	});

	it('requires actor resolution to finish before loading an RLS-protected entity', async () => {
		let resolveActor!: (value: { data: string; error: null }) => void;
		const actorPromise = new Promise<{ data: string; error: null }>((resolve) => {
			resolveActor = resolve;
		});
		const rpc = vi
			.fn()
			.mockImplementationOnce(() => actorPromise)
			.mockResolvedValueOnce({ data: true, error: null });
		const loadEntity = vi.fn().mockResolvedValue({
			data: { id: 'document-1', project_id: 'project-1' },
			error: null
		});

		const pendingResult = requireProjectEntityAccess({
			supabase: { rpc } as never,
			user,
			loadEntity,
			requiredAccess: 'write',
			audit,
			actorOperation: 'document_actor_resolve',
			entityOperation: 'document_fetch',
			accessOperation: 'document_access_check',
			tableName: 'onto_documents',
			notFoundResource: 'Document',
			forbiddenMessage: 'No document access'
		});

		await Promise.resolve();
		expect(loadEntity).not.toHaveBeenCalled();
		resolveActor({ data: 'actor-1', error: null });

		const result = await pendingResult;
		expect(result).toMatchObject({
			ok: true,
			actorId: 'actor-1',
			projectId: 'project-1'
		});
		expect(rpc).toHaveBeenLastCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});

	it('logs entity query errors and preserves the database response contract', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const entityError = { message: 'query failed', code: 'XX000' };
		const rpc = vi.fn().mockResolvedValue({ data: 'actor-1', error: null });

		const result = await requireProjectEntityAccess({
			supabase: { rpc } as never,
			user,
			loadEntity: async () => ({ data: null, error: entityError }),
			requiredAccess: 'read',
			audit,
			actorOperation: 'document_actor_resolve',
			entityOperation: 'document_fetch',
			accessOperation: 'document_access_check',
			tableName: 'onto_documents',
			notFoundResource: 'Document',
			forbiddenMessage: 'No document access'
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected entity access to fail');
		expect(await responseBody(result.response)).toMatchObject({
			error: 'Database operation failed',
			code: 'DATABASE_ERROR'
		});
		expect(logOntologyApiErrorMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				error: entityError,
				operation: 'document_fetch',
				tableName: 'onto_documents'
			})
		);
	});

	it('returns 404 without checking access or logging when RLS hides the entity', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: 'actor-1', error: null });

		const result = await requireProjectEntityAccess({
			supabase: { rpc } as never,
			user,
			loadEntity: async () => ({ data: null, error: null }),
			requiredAccess: 'read',
			audit,
			actorOperation: 'document_actor_resolve',
			entityOperation: 'document_fetch',
			accessOperation: 'document_access_check',
			tableName: 'onto_documents',
			notFoundResource: 'Document',
			forbiddenMessage: 'No document access'
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected entity access to fail');
		expect(result.response.status).toBe(404);
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(logOntologyApiErrorMock).not.toHaveBeenCalled();
	});

	it('returns the configured 403 without logging expected access denials', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: false, error: null })
		};

		const result = await requireCurrentActorProjectAccess({
			supabase: supabase as never,
			actor,
			projectId: 'project-1',
			requiredAccess: 'admin',
			audit,
			operation: 'document_access_check',
			forbiddenMessage: 'Admin access required'
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected project access to fail');
		expect(await responseBody(result.response)).toMatchObject({
			error: 'Admin access required',
			code: 'FORBIDDEN'
		});
		expect(logOntologyApiErrorMock).not.toHaveBeenCalled();
	});

	it('logs access RPC errors and supports an exact route response factory', async () => {
		const accessError = { message: 'access RPC unavailable' };
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: accessError })
		};

		const result = await requireCurrentActorProjectAccess({
			supabase: supabase as never,
			actor,
			projectId: 'project-1',
			requiredAccess: 'read',
			audit,
			operation: 'document_access_check',
			forbiddenMessage: 'Access denied',
			errorResponse: () => new Response('legacy response', { status: 500 })
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected project access to fail');
		expect(await result.response.text()).toBe('legacy response');
		expect(logOntologyApiErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				error: accessError,
				projectId: 'project-1',
				operation: 'document_access_check'
			})
		);
	});
});
