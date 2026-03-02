// apps/web/src/routes/api/profile/contacts/import/commit/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	commitUserContactCsvImportMock,
	insertUserContactAuditEventMock,
	resolveProfileActorIdMock
} = vi.hoisted(() => ({
	commitUserContactCsvImportMock: vi.fn(),
	insertUserContactAuditEventMock: vi.fn(),
	resolveProfileActorIdMock: vi.fn()
}));

vi.mock('$lib/server/user-contact.service', () => ({
	commitUserContactCsvImport: commitUserContactCsvImportMock,
	insertUserContactAuditEvent: insertUserContactAuditEventMock
}));

vi.mock('$lib/server/user-profile.service', () => ({
	resolveProfileActorId: resolveProfileActorIdMock
}));

import { POST } from './+server';

describe('POST /api/profile/contacts/import/commit', () => {
	beforeEach(() => {
		commitUserContactCsvImportMock.mockReset();
		insertUserContactAuditEventMock.mockReset();
		resolveProfileActorIdMock.mockReset();
	});

	it('commits ready rows and returns summary', async () => {
		commitUserContactCsvImportMock.mockResolvedValue({
			summary: { requested: 2, imported: 1, failed: 1 },
			results: [
				{ row_number: 2, success: true, contact_id: 'contact_1' },
				{ row_number: 3, success: false, error: 'invalid row' }
			]
		});
		insertUserContactAuditEventMock.mockResolvedValue(undefined);
		resolveProfileActorIdMock.mockResolvedValue('actor_1');

		const response = await POST({
			request: {
				json: vi.fn().mockResolvedValue({
					rows: [
						{
							row_number: 2,
							action: 'create_new',
							normalized_input: { display_name: 'Stacy', methods: [] }
						}
					]
				})
			},
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user_1' } }),
				supabase: {}
			}
		} as any);

		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.success).toBe(true);
		expect(json.data.summary.imported).toBe(1);
		expect(commitUserContactCsvImportMock).toHaveBeenCalledTimes(1);
		expect(insertUserContactAuditEventMock).toHaveBeenCalledTimes(1);
	});

	it('validates missing rows payload', async () => {
		const response = await POST({
			request: {
				json: vi.fn().mockResolvedValue({})
			},
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user_1' } }),
				supabase: {}
			}
		} as any);

		expect(response.status).toBe(400);
		expect(commitUserContactCsvImportMock).not.toHaveBeenCalled();
	});
});
