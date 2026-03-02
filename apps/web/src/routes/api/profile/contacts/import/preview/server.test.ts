// apps/web/src/routes/api/profile/contacts/import/preview/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	previewUserContactCsvImportMock,
	insertUserContactAuditEventMock,
	resolveProfileActorIdMock
} = vi.hoisted(() => ({
	previewUserContactCsvImportMock: vi.fn(),
	insertUserContactAuditEventMock: vi.fn(),
	resolveProfileActorIdMock: vi.fn()
}));

vi.mock('$lib/server/user-contact.service', () => ({
	previewUserContactCsvImport: previewUserContactCsvImportMock,
	insertUserContactAuditEvent: insertUserContactAuditEventMock
}));

vi.mock('$lib/server/user-profile.service', () => ({
	resolveProfileActorId: resolveProfileActorIdMock
}));

import { POST } from './+server';

describe('POST /api/profile/contacts/import/preview', () => {
	beforeEach(() => {
		previewUserContactCsvImportMock.mockReset();
		insertUserContactAuditEventMock.mockReset();
		resolveProfileActorIdMock.mockReset();
	});

	it('returns preview payload for authenticated user', async () => {
		const previewResult = {
			summary: { total: 1, ready: 1, skipped: 0, errors: 0 },
			rows: [
				{
					row_number: 2,
					status: 'ready',
					action: 'create_new'
				}
			]
		};
		previewUserContactCsvImportMock.mockResolvedValue(previewResult);
		insertUserContactAuditEventMock.mockResolvedValue(undefined);
		resolveProfileActorIdMock.mockResolvedValue('actor_1');

		const formData = new FormData();
		formData.append(
			'file',
			new File(['display_name,email\nStacy,stacy@example.com'], 'contacts.csv')
		);

		const response = await POST({
			request: {
				formData: vi.fn().mockResolvedValue(formData)
			},
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user_1' } }),
				supabase: {}
			}
		} as any);

		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.success).toBe(true);
		expect(json.data.summary.ready).toBe(1);
		expect(previewUserContactCsvImportMock).toHaveBeenCalledTimes(1);
		expect(insertUserContactAuditEventMock).toHaveBeenCalledTimes(1);
	});

	it('returns 401 when unauthenticated', async () => {
		const formData = new FormData();
		formData.append('file', new File(['display_name\nStacy'], 'contacts.csv'));

		const response = await POST({
			request: { formData: vi.fn().mockResolvedValue(formData) },
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null }),
				supabase: {}
			}
		} as any);

		expect(response.status).toBe(401);
		expect(previewUserContactCsvImportMock).not.toHaveBeenCalled();
	});
});
