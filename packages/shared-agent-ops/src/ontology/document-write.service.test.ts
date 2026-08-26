// packages/shared-agent-ops/src/ontology/document-write.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	DOCUMENT_VERSION_WRITE_WARNING,
	writeDocumentHeadAndVersion
} from './document-write.service';

type EqFilter = { column: string; value: unknown };

function createSupabaseMock(outcome: { data: Record<string, unknown> | null; error: any }) {
	const eqFilters: EqFilter[] = [];
	let updatePayload: Record<string, unknown> | null = null;

	const builder = {
		update(payload: Record<string, unknown>) {
			updatePayload = payload;
			return this;
		},
		eq(column: string, value: unknown) {
			eqFilters.push({ column, value });
			return this;
		},
		is() {
			return this;
		},
		select() {
			return this;
		},
		async single() {
			return outcome;
		}
	};

	return {
		supabase: { from: vi.fn(() => builder) } as any,
		eqFilters,
		getUpdatePayload: () => updatePayload
	};
}

const documentRow = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Updated',
	description: null,
	content: 'Body',
	props: {},
	state_key: 'draft',
	type_key: 'document.default',
	updated_at: '2026-08-26T12:01:00.000Z'
};

describe('writeDocumentHeadAndVersion', () => {
	it('guards the head update and records exactly one version after it succeeds', async () => {
		const fixture = createSupabaseMock({ data: documentRow, error: null });
		const versionWriter = vi.fn(async () => ({ status: 'created' as const }) as any);

		const result = await writeDocumentHeadAndVersion({
			supabase: fixture.supabase,
			documentId: 'doc-1',
			projectId: 'project-1',
			update: { title: 'Updated' },
			expectedUpdatedAt: '2026-08-26T12:00:00.000Z',
			actorId: 'actor-1',
			changeSource: 'ui',
			versionWriter
		});

		expect(result).toMatchObject({ status: 'updated', versionWarning: null });
		expect(fixture.eqFilters).toEqual(
			expect.arrayContaining([
				{ column: 'id', value: 'doc-1' },
				{ column: 'project_id', value: 'project-1' },
				{ column: 'updated_at', value: '2026-08-26T12:00:00.000Z' }
			])
		);
		expect(fixture.getUpdatePayload()).toEqual({ title: 'Updated' });
		expect(versionWriter).toHaveBeenCalledTimes(1);
		expect(versionWriter).toHaveBeenCalledWith(
			expect.objectContaining({
				documentId: 'doc-1',
				actorId: 'actor-1',
				changeSource: 'ui'
			})
		);
	});

	it('returns a conflict without versioning when the guarded update matches no row', async () => {
		const fixture = createSupabaseMock({
			data: null,
			error: { code: 'PGRST116', message: 'No rows' }
		});
		const versionWriter = vi.fn();

		const result = await writeDocumentHeadAndVersion({
			supabase: fixture.supabase,
			documentId: 'doc-1',
			projectId: 'project-1',
			update: { title: 'Updated' },
			expectedUpdatedAt: '2026-08-26T12:00:00.000Z',
			actorId: 'actor-1',
			versionWriter: versionWriter as any
		});

		expect(result).toEqual({ status: 'conflict' });
		expect(versionWriter).not.toHaveBeenCalled();
	});

	it('returns the committed document with a warning when versioning fails', async () => {
		const fixture = createSupabaseMock({ data: documentRow, error: null });
		const versionError = new Error('version insert failed');

		const result = await writeDocumentHeadAndVersion({
			supabase: fixture.supabase,
			documentId: 'doc-1',
			projectId: 'project-1',
			update: { title: 'Updated' },
			actorId: 'actor-1',
			versionWriter: vi.fn(async () => {
				throw versionError;
			})
		});

		expect(result).toMatchObject({
			status: 'updated',
			versionWarning: DOCUMENT_VERSION_WRITE_WARNING,
			versionError
		});
	});
});
