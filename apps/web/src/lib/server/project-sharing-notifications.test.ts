// apps/web/src/lib/server/project-sharing-notifications.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmailMock, adminMock } = vi.hoisted(() => ({
	sendEmailMock: vi.fn(),
	adminMock: vi.fn()
}));

vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://app.test' }));
vi.mock('$lib/services/email-service', () => ({
	EmailService: class {
		sendEmail = sendEmailMock;
	}
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: adminMock }));
vi.mock('$lib/utils/emailTemplate', () => ({
	generateMinimalEmailHTML: ({ content }: { content: string }) => `<html>${content}</html>`
}));

import {
	notifyMembersProjectDeleted,
	notifyMembersProjectRestored,
	notifyOwnershipReceived
} from './project-sharing-notifications';

const tables = {
	onto_project_members: [{ actor_id: 'a1' }, { actor_id: 'a2' }, { actor_id: 'a3' }],
	onto_actors: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }],
	users: [
		{ id: 'u2', email: 'two@example.com' },
		{ id: 'u3', email: 'three@example.com' }
	]
};

function makeAdmin() {
	return {
		from: (table: keyof typeof tables) => {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				is: () => builder,
				in: (_col: string, values: string[]) =>
					Promise.resolve({
						data:
							table === 'users'
								? tables.users.filter((row) => values.includes(row.id))
								: tables[table],
						error: null
					}),
				then: (resolve: any) => resolve({ data: tables[table], error: null })
			};
			return builder;
		}
	};
}

describe('project sharing notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		adminMock.mockReset();
		adminMock.mockReturnValue(makeAdmin());
		sendEmailMock.mockReset();
		sendEmailMock.mockResolvedValue({ success: true });
	});

	it('emails every active member except the excluded user', async () => {
		await notifyMembersProjectDeleted({
			projectId: 'p1',
			projectName: 'Apollo',
			ownerName: 'Owner',
			excludeUserId: 'u1',
			restorableUntil: '2026-11-03T12:00:00.000Z',
			reason: 'deleted',
			senderUserId: 'u1'
		});

		expect(sendEmailMock).toHaveBeenCalledTimes(2);
		expect(sendEmailMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				body: expect.stringContaining('restore it until November 3, 2026'),
				to: 'two@example.com'
			})
		);
	});

	it('uses the account deletion wording without a restore date', async () => {
		await notifyMembersProjectDeleted({
			projectId: 'p1',
			projectName: 'Apollo',
			ownerName: 'Owner',
			excludeUserId: 'u1',
			restorableUntil: null,
			reason: 'account_deleted',
			senderUserId: 'u1'
		});

		expect(sendEmailMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				body: expect.stringContaining('deleting their BuildOS account')
			})
		);
	});

	it('sends the restore notice with a project link', async () => {
		await notifyMembersProjectRestored({
			projectId: 'p1',
			projectName: 'Apollo',
			ownerName: 'Owner',
			excludeUserId: 'u1',
			senderUserId: 'u1'
		});

		expect(sendEmailMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				body: expect.stringContaining('https://app.test/projects/p1')
			})
		);
	});

	it('emails the new owner on handoff', async () => {
		await notifyOwnershipReceived({
			projectId: 'p1',
			projectName: 'Apollo',
			newOwnerUserId: 'u2',
			fromName: 'Owner',
			senderUserId: 'u1'
		});

		expect(sendEmailMock).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ subject: `You're now the owner of "Apollo"` })
		);
	});

	it('swallows send and lookup errors', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sendEmailMock.mockRejectedValue(new Error('smtp down for two@example.com'));
		await expect(
			notifyMembersProjectRestored({
				projectId: 'p1',
				projectName: 'Apollo',
				ownerName: 'Owner',
				excludeUserId: 'u1',
				senderUserId: 'u1'
			})
		).resolves.toBeUndefined();

		adminMock.mockImplementation(() => {
			throw new Error('no admin');
		});
		await expect(
			notifyOwnershipReceived({
				projectId: 'p1',
				projectName: 'Apollo',
				newOwnerUserId: 'u2',
				fromName: 'Owner',
				senderUserId: 'u1'
			})
		).resolves.toBeUndefined();

		expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('@example.com');
		errorSpy.mockRestore();
	});
});
