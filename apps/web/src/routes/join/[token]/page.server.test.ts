// apps/web/src/routes/join/[token]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: { getInstance: vi.fn(() => ({ logError: vi.fn() })) }
}));
vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SUPABASE_SERVICE_KEY: 'test-secret' } }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$app/environment', () => ({ dev: false }));

import { load } from './+page.server';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

function event(rpcResult: unknown, user: unknown = null, token = TOKEN) {
	const rpc = vi.fn().mockResolvedValue(rpcResult);
	return {
		rpc,
		args: {
			params: { token },
			locals: { supabase: { rpc }, safeGetSession: vi.fn().mockResolvedValue({ user }) },
			url: new URL(`https://build-os.com/join/${token}`)
		} as any
	};
}

describe('/join/[token] load', () => {
	it('previews by the token hash, signed out, and keeps the path for sign-in', async () => {
		const { rpc, args } = event({
			data: {
				status: 'active',
				project_name: '9takes',
				inviter_name: 'DJ',
				role_key: 'viewer',
				agent_access: 'read',
				expires_at: '2026-10-30T12:00:00.000Z'
			},
			error: null
		});
		const result: any = await load(args);

		expect(rpc).toHaveBeenCalledWith('get_project_invite_link_preview', {
			p_token_hash: createHash('sha256').update(TOKEN).digest('hex')
		});
		expect(result).toMatchObject({
			token: TOKEN,
			viewer: null,
			redirectTo: `/join/${TOKEN}`,
			preview: {
				status: 'active',
				project_name: '9takes',
				inviter_name: 'DJ',
				role_key: 'viewer',
				already_member: false
			}
		});
	});

	it('reads a malformed token as not found without a database call', async () => {
		const { rpc, args } = event({ data: null, error: null }, null, 'nope');
		const result: any = await load(args);
		expect(rpc).not.toHaveBeenCalled();
		expect(result.preview).toEqual({ status: 'not_found' });
	});

	it('passes dead-link statuses through and knows who is signed in', async () => {
		const { args } = event(
			{ data: { status: 'turned_off' }, error: null },
			{
				id: 'u1',
				email: 'sam@example.com',
				name: 'Sam'
			}
		);
		const result: any = await load(args);
		expect(result.preview).toEqual({ status: 'turned_off' });
		expect(result.viewer).toEqual({ email: 'sam@example.com', name: 'Sam' });
	});

	it('flags a failed preview so the page can offer a retry', async () => {
		const { args } = event({ data: null, error: { message: 'boom' } });
		const result: any = await load(args);
		expect(result).toMatchObject({ preview: { status: 'not_found' }, loadError: true });
	});
});
