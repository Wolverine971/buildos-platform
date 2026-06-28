// apps/web/src/lib/services/ontology/instantiation.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resolveActorId, resolveFacets, validateProjectSpec } from './instantiation.service';
import { ProjectSpecSchema } from '../../types/onto';

function fakeRpcClient(impl: (name: string, args?: unknown) => { data: unknown; error?: unknown }) {
	return { rpc: vi.fn(impl) } as any;
}

describe('resolveActorId', () => {
	it('uses the session actor when current_actor_id() resolves (user-scoped client)', async () => {
		const client = fakeRpcClient((name) =>
			name === 'current_actor_id' ? { data: 'actor-session' } : { data: null }
		);

		await expect(resolveActorId(client, 'user-1')).resolves.toBe('actor-session');
		// ensure_actor_for_user should not be needed when a session actor exists.
		expect(client.rpc).toHaveBeenCalledTimes(1);
	});

	it('falls back to ensure_actor_for_user when current_actor_id() is null (admin/agent client)', async () => {
		// This is the remote-MCP / agent gateway path: the service-role admin client
		// has no auth.uid(), so current_actor_id() returns null. We must use the id
		// returned by ensure_actor_for_user rather than re-checking the session.
		const client = fakeRpcClient((name) =>
			name === 'ensure_actor_for_user' ? { data: 'actor-ensured' } : { data: null }
		);

		await expect(resolveActorId(client, 'user-1')).resolves.toBe('actor-ensured');
	});

	it('throws a clear error when the actor cannot be resolved at all', async () => {
		const client = fakeRpcClient((name) =>
			name === 'ensure_actor_for_user'
				? { data: null, error: { message: 'no actor' } }
				: { data: null }
		);

		await expect(resolveActorId(client, 'user-1')).rejects.toThrow(/Failed to resolve actor/);
	});
});

describe('resolveFacets', () => {
	it('applies template defaults when spec facets are missing', () => {
		const result = resolveFacets(
			{
				context: 'commercial',
				scale: 'medium',
				stage: 'planning'
			},
			undefined
		);

		expect(result).toEqual({
			context: 'commercial',
			scale: 'medium',
			stage: 'planning'
		});
	});

	it('lets spec facets override template defaults', () => {
		const result = resolveFacets(
			{
				context: 'commercial',
				scale: 'small',
				stage: 'planning'
			},
			{
				context: 'startup',
				scale: 'large'
			}
		);

		expect(result).toEqual({
			context: 'startup',
			scale: 'large',
			stage: 'planning'
		});
	});

	it('only returns defined keys', () => {
		const result = resolveFacets(undefined, { scale: 'micro' });
		expect(result).toEqual({ scale: 'micro' });
	});
});

describe('validateProjectSpec', () => {
	it('returns valid when spec matches schema', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Test Project',
				type_key: 'project.creative.book',
				props: {
					facets: {
						context: 'commercial'
					}
				}
			},
			entities: [],
			relationships: []
		});

		expect(valid).toBe(true);
		expect(errors).toHaveLength(0);
	});

	it('collects errors for invalid spec', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: '',
				type_key: 'INVALID_KEY'
			},
			entities: [],
			relationships: []
		});

		expect(valid).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('rejects legacy arrays', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Legacy Test',
				type_key: 'project.creative.book'
			},
			entities: [],
			relationships: [],
			goals: [{ name: 'Legacy goal' }]
		});

		expect(valid).toBe(false);
		expect(errors.some((error) => error.includes('Legacy ProjectSpec field "goals"'))).toBe(
			true
		);
	});

	it('allows multiple entities without explicit relationships', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Relationship Test',
				type_key: 'project.creative.book'
			},
			entities: [
				{ temp_id: 'goal-1', kind: 'goal', name: 'Goal 1' },
				{ temp_id: 'task-1', kind: 'task', title: 'Task 1' }
			],
			relationships: []
		});

		expect(valid).toBe(true);
		expect(errors).toHaveLength(0);
	});

	it('rejects literal undefined labels before instantiation', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Undefined Label Test',
				type_key: 'project.creative.book'
			},
			entities: [
				{ temp_id: 'goal-1', kind: 'goal', name: 'undefined' },
				{ temp_id: 'task-1', kind: 'task', title: 'null' }
			],
			relationships: []
		});

		expect(valid).toBe(false);
		expect(errors.some((error) => error.includes('must be a real label'))).toBe(true);
	});

	it('trims display labels when parsing project specs', () => {
		const parsed = ProjectSpecSchema.parse({
			project: {
				name: '  Trimmed Project  ',
				type_key: 'project.creative.book'
			},
			entities: [{ temp_id: 'task-1', kind: 'task', title: '  Trimmed Task  ' }],
			relationships: []
		});

		expect(parsed.project.name).toBe('Trimmed Project');
		expect(parsed.entities[0]?.kind).toBe('task');
		expect(parsed.entities[0]?.title).toBe('Trimmed Task');
	});

	it('accepts and normalizes capitalized risk impact values', () => {
		const spec = {
			project: {
				name: 'Impact Casing Test',
				type_key: 'project.business.launch'
			},
			entities: [
				{
					temp_id: 'risk-1',
					kind: 'risk',
					title: 'Timeline slips',
					impact: 'Medium'
				}
			],
			relationships: []
		};

		const { valid, errors } = validateProjectSpec(spec);
		expect(valid).toBe(true);
		expect(errors).toHaveLength(0);
		expect(ProjectSpecSchema.parse(spec).entities[0]?.impact).toBe('medium');
	});
});
