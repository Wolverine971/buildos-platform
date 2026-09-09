// apps/worker/tests/ontologyClassifierDocument.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), getJSONResponse: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
	}
}));
import { classifyOntologyEntity } from '../src/workers/ontology/ontologyClassifier';

const originalTimestamp = '2026-09-09T19:13:13.591690+00:00';
const newerTimestamp = '2026-09-09T19:13:13.591691+00:00';
const request = {
	entityType: 'document' as const,
	entityId: '2580d11d-966c-4be1-8791-66c08c73bb8a',
	userId: '85eba71b-56c9-4561-9dae-3828cf9922c4',
	classificationSource: 'create_modal' as const
};
const classification = {
	type_key: 'document.context.workflow',
	tags: ['testing'],
	confidence: 0.72
};
let row: Record<string, unknown>;
let beforeWrite: (() => void) | null;
let writes: Query[];

class Query {
	filters: [string, unknown][] = [];
	payload: Record<string, unknown> | null = null;
	select() {
		return this;
	}
	eq(key: string, value: unknown) {
		this.filters.push([key, value]);
		return this;
	}
	is(key: string, value: unknown) {
		return this.eq(key, value);
	}
	single() {
		return this;
	}
	overrideTypes() {
		return Promise.resolve({ data: structuredClone(row), error: null });
	}
	update(payload: Record<string, unknown>) {
		this.payload = payload;
		writes.push(this);
		beforeWrite?.();
		return this;
	}
	then(resolve: (result: { data: unknown[]; error: null }) => void) {
		const matches = this.filters.every(([key, value]) => row[key] === value);
		if (matches && this.payload) row = { ...row, ...this.payload };
		return Promise.resolve({ data: matches ? [{ id: row.id }] : [], error: null }).then(
			resolve
		);
	}
}

describe('document classification concurrency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes = [];
		beforeWrite = null;
		row = {
			id: request.entityId,
			title: 'Acceptance plan',
			content: 'Original draft',
			state_key: 'draft',
			type_key: 'document.default',
			deleted_at: null,
			updated_at: originalTimestamp,
			props: {
				body_markdown: 'Original draft',
				tags: ['existing'],
				agent_workspace: 'preserve'
			}
		};
		mocks.from.mockImplementation(() => new Query());
		mocks.getJSONResponse.mockResolvedValue(classification);
	});

	it.each(['document.default', null])(
		'classifies an unchanged document with type %s',
		async (typeKey) => {
			row.type_key = typeKey;
			expect(await classifyOntologyEntity(request)).toMatchObject({
				success: true,
				...classification
			});
			expect(row).toMatchObject({
				type_key: classification.type_key,
				props: {
					body_markdown: 'Original draft',
					tags: ['existing', 'testing'],
					agent_workspace: 'preserve'
				}
			});
			expect(writes[0]?.filters).toContainEqual(['updated_at', originalTimestamp]);
			expect(writes[0]?.filters).toContainEqual(['deleted_at', null]);
		}
	);

	it('skips classification when the user edits while the model is running', async () => {
		mocks.getJSONResponse.mockImplementationOnce(async () => {
			row = {
				...row,
				updated_at: newerTimestamp,
				content: 'My newer draft',
				props: { body_markdown: 'My newer draft' }
			};
			return classification;
		});
		expect(await classifyOntologyEntity(request)).toMatchObject({
			success: true,
			skipped: true
		});
		expect(writes).toHaveLength(0);
		expect(row.content).toBe('My newer draft');
		expect(row.type_key).toBe('document.default');
	});

	it('cannot overwrite newer props between its final read and update, even in the same millisecond', async () => {
		beforeWrite = () => {
			row = {
				...row,
				updated_at: newerTimestamp,
				props: { body_markdown: 'New draft', tags: ['my-tag'] }
			};
		};
		expect(await classifyOntologyEntity(request)).toMatchObject({
			success: true,
			skipped: true
		});
		expect(writes).toHaveLength(1);
		expect(row.props).toEqual({ body_markdown: 'New draft', tags: ['my-tag'] });
		expect(row.type_key).toBe('document.default');
	});

	it('does not classify a document deleted before its update', async () => {
		beforeWrite = () => {
			row.deleted_at = newerTimestamp;
		};
		expect(await classifyOntologyEntity(request)).toMatchObject({
			success: true,
			skipped: true
		});
		expect(row.type_key).toBe('document.default');
	});
});
