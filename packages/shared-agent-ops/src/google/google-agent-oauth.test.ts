// packages/shared-agent-ops/src/google/google-agent-oauth.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleAgentOAuthService, type GoogleAgentConnectionKind } from './google-agent-oauth';
import { GOOGLE_CALENDAR_SCOPES } from '../calendar/google-calendar-scopes';

const now = Date.parse('2026-11-09T12:00:00Z');
const callback = 'https://build-os.com/auth/google/agent/callback';
type Row = Record<string, any>;
function fixture(kind: GoogleAgentConnectionKind = 'gmail') {
	const target = {
		userId: 'owner',
		kind,
		connectionId: kind === 'calendar_legacy' ? 'owner' : 'connection'
	};
	const human = {
		id: 'connection',
		user_id: 'owner',
		provider: kind === 'gmail' ? 'google_gmail' : 'google_calendar',
		provider_account_id: 'google-owner',
		email_address: 'owner@example.com',
		status: 'active',
		read_enabled: true,
		deleted_at: null
	};
	const tables: Record<string, Row[]> = {
		user_email_connections: [{ ...human }],
		user_calendar_connections: [{ ...human }],
		user_calendar_tokens: [
			{
				user_id: 'owner',
				google_user_id: 'google-owner',
				google_email: 'owner@example.com',
				access_token: 'human-access',
				refresh_token: 'human-refresh'
			}
		],
		email_connection_credentials: [{ access_token_ciphertext: 'existing-human-gmail' }],
		calendar_connection_credentials: [{ access_token_ciphertext: 'existing-human-calendar' }],
		google_agent_grants: [],
		google_agent_oauth_states: []
	};
	const operations: Array<{ table: string; action: string }> = [];
	const db = {
		from: vi.fn((table: string) => {
			const filters: Array<(row: Row) => boolean> = [];
			let action = 'read';
			let values: Row = {};
			const run = (single = false) => {
				operations.push({ table, action });
				let rows = (tables[table] ?? []).filter((row) =>
					filters.every((test) => test(row))
				);
				if (action === 'insert') {
					rows = [{ ...values }];
					(tables[table] ??= []).push(...rows);
				}
				if (action === 'update') rows.forEach((row) => Object.assign(row, values));
				if (action === 'delete')
					tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row));
				return { data: single ? (rows[0] ?? null) : rows, error: null };
			};
			const chain = {
				select: () => chain,
				eq: (key: string, value: unknown) => {
					filters.push((row) => row[key] === value);
					return chain;
				},
				is: (key: string, value: unknown) => {
					filters.push((row) => row[key] === value);
					return chain;
				},
				lt: (key: string, value: string) => {
					filters.push((row) => row[key] < value);
					return chain;
				},
				insert: (row: Row) => {
					action = 'insert';
					values = row;
					return chain;
				},
				update: (row: Row) => {
					action = 'update';
					values = row;
					return chain;
				},
				delete: () => {
					action = 'delete';
					return chain;
				},
				maybeSingle: () => Promise.resolve(run(true)),
				then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve)
			};
			return chain;
		}),
		rpc: vi.fn(async (name: string, args: Row) => {
			const state = tables.google_agent_oauth_states!.find(
				(row) =>
					row.state_hash === args.p_state_hash &&
					row.user_id === args.p_user_id &&
					Date.parse(row.expires_at) > now
			);
			if (name === 'consume_google_agent_oauth_state') {
				if (!state || state.consumed_at) return { data: [], error: null };
				state.consumed_at = 'claimed';
				return { data: [{ ...state }], error: null };
			}
			if (name === 'save_google_agent_grant') {
				if (!state?.consumed_at)
					return { data: null, error: { message: 'google_agent_consent_cancelled' } };
				const grant = {
					id: 'grant',
					user_id: state.user_id,
					connection_kind: state.connection_kind,
					connection_id: state.connection_id,
					provider_account_id: state.provider_account_id,
					oauth_client_id: state.oauth_client_id,
					access_token_ciphertext: args.p_access_token_ciphertext,
					refresh_token_ciphertext: args.p_refresh_token_ciphertext,
					access_token_expires_at: args.p_access_token_expires_at,
					refresh_token_expires_at: args.p_refresh_token_expires_at,
					granted_scopes: args.p_granted_scopes,
					status: 'active',
					revision: 'initial'
				};
				tables.google_agent_grants = [grant];
				tables.google_agent_oauth_states = tables.google_agent_oauth_states!.filter(
					(row) => row !== state
				);
				return { data: null, error: null };
			}
			throw new Error(name);
		})
	};
	const env: Record<string, string> = {
		PRIVATE_GMAIL_AGENT_CLIENT_ID: 'gmail-agent',
		PRIVATE_GMAIL_AGENT_CLIENT_SECRET: 'gmail-agent-secret',
		PRIVATE_GOOGLE_CALENDAR_AGENT_CLIENT_ID: 'calendar-agent',
		PRIVATE_GOOGLE_CALENDAR_AGENT_CLIENT_SECRET: 'calendar-agent-secret',
		PRIVATE_GMAIL_READ_CLIENT_ID: 'gmail-human',
		PRIVATE_GOOGLE_CALENDAR_CLIENT_ID: 'calendar-human',
		PRIVATE_GOOGLE_CLIENT_ID: 'login-human',
		PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1: 'test-key-at-least-thirty-two-bytes-long',
		PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1: 'calendar-test-key-at-least-thirty-two-bytes-long'
	};
	const clientId = kind === 'gmail' ? 'gmail-agent' : 'calendar-agent';
	const scopes =
		kind === 'gmail'
			? ['https://www.googleapis.com/auth/gmail.readonly']
			: [...GOOGLE_CALENDAR_SCOPES];
	let authParams: Row = {};
	const oauth = {
		generateCodeVerifierAsync: vi.fn(async () => ({
			codeVerifier: 'verifier',
			codeChallenge: 'challenge'
		})),
		generateAuthUrl: vi.fn((params: Row) => {
			authParams = params;
			return `https://accounts.google.com/consent?state=${params.state}`;
		}),
		getToken: vi.fn(async () => ({
			tokens: {
				access_token: 'agent-access',
				refresh_token: 'agent-refresh',
				id_token: 'identity',
				expiry_date: now + 3_600_000
			}
		})),
		verifyIdToken: vi.fn(async () => ({
			getPayload: () => ({
				sub: 'google-owner',
				email: 'owner@example.com',
				email_verified: true,
				nonce: authParams.nonce,
				iss: 'https://accounts.google.com'
			})
		})),
		getTokenInfo: vi.fn(async () => ({
			aud: clientId,
			sub: 'google-owner',
			scopes,
			expiry_date: now + 3_600_000
		})),
		setCredentials: vi.fn(),
		refreshAccessToken: vi.fn(async () => ({
			credentials: { access_token: 'refreshed-agent-access', expiry_date: now + 3_600_000 }
		}))
	};
	const factory = vi.fn(() => oauth);
	const service = new GoogleAgentOAuthService(db as never, {
		readEnv: (name) => env[name],
		now: () => now,
		createOAuthClient: factory as never
	});
	const consent = async () => {
		await service.createAuthorizationUrl(target, callback);
		const state = await service.consumeState(authParams.state, target.userId);
		await service.exchangeCode(state, 'code', callback);
	};
	return {
		target,
		tables,
		operations,
		db,
		env,
		oauth,
		factory,
		service,
		consent,
		params: () => authParams
	};
}

describe('separate Google agent grants', () => {
	it.each(['gmail', 'calendar', 'calendar_legacy'] as const)(
		'adds %s agent consent without changing a human grant',
		async (kind) => {
			const f = fixture(kind);
			const before = JSON.stringify([
				f.tables.email_connection_credentials,
				f.tables.calendar_connection_credentials,
				f.tables.user_calendar_tokens
			]);
			await f.consent();
			expect(await f.service.getAccessToken(f.target)).toBe('agent-access');
			expect(await f.service.status(f.target)).toEqual({
				configured: true,
				status: 'active'
			});
			expect(
				JSON.stringify([
					f.tables.email_connection_credentials,
					f.tables.calendar_connection_credentials,
					f.tables.user_calendar_tokens
				])
			).toBe(before);
			expect(
				f.operations
					.filter((op) => !op.table.startsWith('google_agent_'))
					.every((op) => op.action === 'read')
			).toBe(true);
			expect(f.tables.google_agent_grants![0]!.access_token_ciphertext).not.toContain(
				'agent-access'
			);
			expect(f.params()).toMatchObject({
				include_granted_scopes: false,
				code_challenge_method: 'S256',
				prompt: 'consent'
			});
		}
	);
	it('refuses an existing human connection until separate consent, without reading its credentials', async () => {
		const f = fixture();
		await expect(f.service.getAccessToken(f.target)).rejects.toMatchObject({
			code: 'agent_authorization_required'
		});
		expect(f.db.from).not.toHaveBeenCalledWith('email_connection_credentials');
		expect(f.factory).not.toHaveBeenCalled();
	});
	it.each([
		'PRIVATE_GOOGLE_CLIENT_ID',
		'PRIVATE_GMAIL_READ_CLIENT_ID',
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
		'PRIVATE_GOOGLE_CALENDAR_AGENT_CLIENT_ID'
	])('rejects reuse of %s for the Gmail agent', async (key) => {
		const f = fixture();
		f.env.PRIVATE_GMAIL_AGENT_CLIENT_ID = f.env[key]!;
		await expect(f.service.createAuthorizationUrl(f.target, callback)).rejects.toMatchObject({
			code: 'not_configured'
		});
	});
	it('cannot authorize a connection belonging to another user', async () => {
		const f = fixture();
		await expect(
			f.service.createAuthorizationUrl({ ...f.target, userId: 'other-user' }, callback)
		).rejects.toMatchObject({ code: 'connection_not_found' });
		expect(f.factory).not.toHaveBeenCalled();
	});
	it('binds state to the signed-in user and allows only one consumption', async () => {
		const f = fixture();
		await f.service.createAuthorizationUrl(f.target, callback);
		await expect(f.service.consumeState(f.params().state, 'other')).rejects.toMatchObject({
			code: 'invalid_state'
		});
		await f.service.consumeState(f.params().state, 'owner');
		await expect(f.service.consumeState(f.params().state, 'owner')).rejects.toMatchObject({
			code: 'invalid_state'
		});
	});
	it('rejects the wrong Google account, audience, and extra Gmail action scope', async () => {
		for (const info of [
			{ sub: 'wrong-account' },
			{ aud: 'gmail-human' },
			{
				scopes: [
					'https://www.googleapis.com/auth/gmail.readonly',
					'https://www.googleapis.com/auth/gmail.modify'
				]
			}
		]) {
			const f = fixture();
			const base = await f.oauth.getTokenInfo();
			f.oauth.getTokenInfo.mockResolvedValue({ ...base, ...info });
			await expect(f.consent()).rejects.toBeInstanceOf(Error);
			expect(f.tables.google_agent_grants).toHaveLength(0);
		}
	});
	it('requires a fresh agent refresh token instead of borrowing the human token', async () => {
		const f = fixture();
		f.oauth.getToken.mockResolvedValue({
			tokens: { access_token: 'agent', id_token: 'id', expiry_date: now }
		} as never);
		await expect(f.consent()).rejects.toMatchObject({ code: 'agent_authorization_required' });
		expect(f.db.from).not.toHaveBeenCalledWith('email_connection_credentials');
	});
	it('refreshes using the issuing agent client and preserves the human connection on invalid_grant', async () => {
		const f = fixture();
		await f.consent();
		expect(await f.service.getAccessToken(f.target, true)).toBe('refreshed-agent-access');
		expect(f.factory).toHaveBeenLastCalledWith('gmail-agent', 'gmail-agent-secret');
		expect(f.oauth.setCredentials).toHaveBeenLastCalledWith({ refresh_token: 'agent-refresh' });
		f.oauth.refreshAccessToken.mockRejectedValue({
			response: { data: { error: 'invalid_grant' } }
		});
		await expect(f.service.getAccessToken(f.target, true)).rejects.toMatchObject({
			code: 'agent_authorization_required'
		});
		expect(f.tables.google_agent_grants![0]!.status).toBe('reconnect_required');
		expect(f.tables.user_email_connections![0]!.status).toBe('active');
	});
	it('fails closed when the configured client changes or ciphertext is moved to another account', async () => {
		const f = fixture();
		await f.consent();
		f.env.PRIVATE_GMAIL_AGENT_CLIENT_ID = 'replacement-agent';
		await expect(f.service.getAccessToken(f.target)).rejects.toMatchObject({
			code: 'agent_authorization_required'
		});
		f.env.PRIVATE_GMAIL_AGENT_CLIENT_ID = 'gmail-agent';
		f.tables.user_email_connections![0]!.provider_account_id = 'replacement-account';
		f.tables.google_agent_grants![0]!.provider_account_id = 'replacement-account';
		await expect(f.service.getAccessToken(f.target)).rejects.toMatchObject({
			code: 'database_error'
		});
	});
	it('does not revive a grant disabled while its refresh is in flight', async () => {
		const f = fixture();
		await f.consent();
		f.oauth.refreshAccessToken.mockImplementation(async () => {
			await f.service.disconnect(f.target);
			return { credentials: { access_token: 'late-token', expiry_date: now + 3_600_000 } };
		});
		await expect(f.service.getAccessToken(f.target, true)).rejects.toMatchObject({
			code: 'agent_authorization_required'
		});
		expect(f.tables.google_agent_grants).toHaveLength(0);
		expect(f.tables.user_email_connections![0]!.status).toBe('active');
	});
	it('cancels consent already claimed by a callback when agent access is disabled', async () => {
		const f = fixture();
		await f.service.createAuthorizationUrl(f.target, callback);
		const state = await f.service.consumeState(f.params().state, 'owner');
		await f.service.disconnect(f.target);
		await expect(f.service.exchangeCode(state, 'code', callback)).rejects.toMatchObject({
			code: 'database_error'
		});
		expect(f.tables.google_agent_grants).toHaveLength(0);
	});
});
