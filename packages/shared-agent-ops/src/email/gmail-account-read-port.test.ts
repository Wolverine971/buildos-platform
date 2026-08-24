// packages/shared-agent-ops/src/email/gmail-account-read-port.test.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
	GmailAccountReadPort,
	GmailAccountReadPortError,
	MAX_GMAIL_CONNECTIONS
} from './gmail-account-read-port';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

function createQuery(result: QueryResult) {
	const query: Record<
		string,
		ReturnType<typeof vi.fn> | ((resolve: (value: QueryResult) => unknown) => Promise<unknown>)
	> = {};
	for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
		query[method] = vi.fn(() => query);
	}
	query.then = (resolve: (value: QueryResult) => unknown) =>
		Promise.resolve(result).then(resolve);
	return query as any;
}

function connection(id: string, emailAddress = `${id}@example.com`) {
	return {
		id,
		email_address: emailAddress,
		display_name: null,
		account_label: id,
		status: 'active',
		read_enabled: true,
		connected_at: '2026-08-24T12:00:00.000Z',
		last_verified_at: null,
		last_used_at: null
	};
}

function createAdmin(options: { connections?: QueryResult; capabilities?: QueryResult }) {
	const connectionQuery = createQuery(
		options.connections ?? { data: [connection(CONNECTION_ID)], error: null }
	);
	const capabilityQuery = createQuery(
		options.capabilities ?? {
			data: [{ connection_id: CONNECTION_ID, capability: 'read', status: 'enabled' }],
			error: null
		}
	);
	const admin = {
		from: vi.fn((table: string) =>
			table === 'user_email_connections' ? connectionQuery : capabilityQuery
		)
	} as unknown as SupabaseClient<Database>;
	return { admin, connectionQuery, capabilityQuery };
}

const configuredOptions = { available: true } as const;

describe('GmailAccountReadPort', () => {
	it('lists only user-owned Gmail connections and bounds the result', async () => {
		const { admin, connectionQuery, capabilityQuery } = createAdmin({});
		const payload = await new GmailAccountReadPort(admin, configuredOptions).listConnections(
			USER_ID
		);

		expect(connectionQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(connectionQuery.eq).toHaveBeenCalledWith('provider', 'google_gmail');
		expect(connectionQuery.is).toHaveBeenCalledWith('deleted_at', null);
		expect(connectionQuery.limit).toHaveBeenCalledWith(MAX_GMAIL_CONNECTIONS + 1);
		expect(capabilityQuery.in).toHaveBeenCalledWith('connection_id', [CONNECTION_ID]);
		expect(payload.connections[0]?.capabilities).toEqual([
			{ capability: 'read', status: 'enabled' }
		]);
		expect(payload).toMatchObject({
			available: true,
			maxConnections: 5,
			readOnly: true,
			connections: [
				{
					id: CONNECTION_ID,
					emailAddress: `${CONNECTION_ID}@example.com`,
					capabilities: [{ capability: 'read', status: 'enabled' }]
				}
			]
		});
	});

	it('does not query capability rows when the user owns no connections', async () => {
		const { admin, capabilityQuery } = createAdmin({
			connections: { data: [], error: null }
		});
		const payload = await new GmailAccountReadPort(admin, configuredOptions).listConnections(
			USER_ID
		);

		expect(capabilityQuery.select).not.toHaveBeenCalled();
		expect(payload.connections).toEqual([]);
	});

	it('requires every requested connection ID to resolve through the same user filter', async () => {
		const { admin, connectionQuery } = createAdmin({
			connections: { data: [connection(CONNECTION_ID)], error: null }
		});
		const port = new GmailAccountReadPort(admin, configuredOptions);

		await expect(
			port.requireOwnedReadableConnections(USER_ID, [CONNECTION_ID, OTHER_CONNECTION_ID])
		).rejects.toMatchObject({ code: 'connection_not_found' });
		expect(connectionQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(connectionQuery.in).toHaveBeenCalledWith('id', [CONNECTION_ID, OTHER_CONNECTION_ID]);
	});

	it.each([
		{ status: 'disabled', read_enabled: true },
		{ status: 'active', read_enabled: false }
	])('rejects connections that are not actively read-enabled', async (state) => {
		const { admin } = createAdmin({
			connections: { data: [{ ...connection(CONNECTION_ID), ...state }], error: null }
		});

		await expect(
			new GmailAccountReadPort(admin, configuredOptions).requireOwnedReadableConnections(
				USER_ID,
				[CONNECTION_ID]
			)
		).rejects.toMatchObject({ code: 'read_not_enabled' });
	});

	it('rejects oversized connection batches before querying Supabase', async () => {
		const { admin } = createAdmin({});
		const port = new GmailAccountReadPort(admin, configuredOptions);

		await expect(
			port.requireOwnedReadableConnections(
				USER_ID,
				Array.from(
					{ length: MAX_GMAIL_CONNECTIONS + 1 },
					(_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
				)
			)
		).rejects.toBeInstanceOf(GmailAccountReadPortError);
		expect(admin.from).not.toHaveBeenCalled();
	});

	it('stores only the explicit availability decision', () => {
		const { admin } = createAdmin({});
		const port = new GmailAccountReadPort(admin, { available: false });
		expect(port.isConfigured()).toBe(false);
		expect(JSON.stringify(port)).not.toContain('clientSecret');
		expect(JSON.stringify(port)).not.toContain('tokenEncryptionKey');
	});

	it('rejects malformed user and connection IDs before querying Supabase', async () => {
		const { admin } = createAdmin({});
		const port = new GmailAccountReadPort(admin, configuredOptions);

		await expect(port.listConnections('user-1')).rejects.toMatchObject({
			code: 'invalid_request'
		});
		await expect(
			port.requireOwnedReadableConnections(USER_ID, ['gmail-1'])
		).rejects.toMatchObject({ code: 'invalid_request' });
		expect(admin.from).not.toHaveBeenCalled();
	});

	it('fails closed when the database invariant exceeds the five-account cap', async () => {
		const { admin } = createAdmin({
			connections: {
				data: Array.from({ length: MAX_GMAIL_CONNECTIONS + 1 }, (_, index) =>
					connection(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
				),
				error: null
			}
		});

		await expect(
			new GmailAccountReadPort(admin, configuredOptions).listConnections(USER_ID)
		).rejects.toMatchObject({ code: 'database_error' });
	});

	it('maps database errors to a content-free port error', async () => {
		const { admin } = createAdmin({
			connections: { data: null, error: { message: 'sensitive database detail' } }
		});

		await expect(
			new GmailAccountReadPort(admin, configuredOptions).listConnections(USER_ID)
		).rejects.toEqual(
			expect.objectContaining({
				code: 'database_error',
				message: 'Failed to load Gmail connections'
			})
		);
	});
});
