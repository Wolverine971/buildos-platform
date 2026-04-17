// apps/web/src/lib/server/comment-public-access.test.ts
import { describe, expect, it, vi } from 'vitest';
import { canAccessPublicComments, isDocumentLiveAndPublic } from './comment-public-access';

type RowShape = {
	id?: string;
	status?: string;
	public_status?: string;
	visibility?: string;
	deleted_at?: string | null;
};

function makeSupabase(row: RowShape | null) {
	const filters: Record<string, unknown> = {};
	const builder: any = {
		select: vi.fn(() => builder),
		eq: vi.fn((key: string, value: unknown) => {
			filters[key] = value;
			return builder;
		}),
		is: vi.fn((key: string, value: unknown) => {
			filters[`is:${key}`] = value;
			return builder;
		}),
		limit: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => {
			if (!row) return { data: null, error: null };
			const keys: Array<keyof RowShape> = ['status', 'public_status', 'visibility'];
			for (const key of keys) {
				if (filters[key] !== undefined && filters[key] !== row[key]) {
					return { data: null, error: null };
				}
			}
			if (
				filters['is:deleted_at'] !== undefined &&
				row.deleted_at !== filters['is:deleted_at']
			) {
				return { data: null, error: null };
			}
			return { data: row, error: null };
		})
	};
	return {
		from: vi.fn(() => builder),
		__filters: filters
	};
}

describe('canAccessPublicComments', () => {
	it('returns true for a live, public, non-deleted document', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'published',
			public_status: 'live',
			visibility: 'public',
			deleted_at: null
		});
		await expect(canAccessPublicComments(supabase, 'document', 'doc-1')).resolves.toBe(true);
	});

	it('returns false for an unlisted document', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'published',
			public_status: 'live',
			visibility: 'unlisted',
			deleted_at: null
		});
		await expect(canAccessPublicComments(supabase, 'document', 'doc-1')).resolves.toBe(false);
	});

	it('returns false when the document has no public page row', async () => {
		const supabase = makeSupabase(null);
		await expect(canAccessPublicComments(supabase, 'document', 'doc-1')).resolves.toBe(false);
	});

	it('returns false when the document is unpublished', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'unpublished',
			public_status: 'unpublished',
			visibility: 'public',
			deleted_at: null
		});
		await expect(canAccessPublicComments(supabase, 'document', 'doc-1')).resolves.toBe(false);
	});

	it('returns false when the public page row is soft-deleted', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'published',
			public_status: 'live',
			visibility: 'public',
			deleted_at: '2026-04-17T00:00:00Z'
		});
		await expect(canAccessPublicComments(supabase, 'document', 'doc-1')).resolves.toBe(false);
	});

	it('returns false for a non-document entity type', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'published',
			public_status: 'live',
			visibility: 'public',
			deleted_at: null
		});
		await expect(canAccessPublicComments(supabase, 'project', 'proj-1')).resolves.toBe(false);
		// should short-circuit before touching the table
		expect(supabase.from).not.toHaveBeenCalled();
	});
});

describe('isDocumentLiveAndPublic', () => {
	it('returns false when the row is unlisted', async () => {
		const supabase = makeSupabase({
			id: 'pg-1',
			status: 'published',
			public_status: 'live',
			visibility: 'unlisted',
			deleted_at: null
		});
		await expect(isDocumentLiveAndPublic(supabase, 'doc-1')).resolves.toBe(false);
	});
});
