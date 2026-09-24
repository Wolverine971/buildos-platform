// apps/web/src/lib/server/agent-call/caller-auth.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/security-event-logger', () => ({
	logSecurityEvent,
	getSecurityRequestContext: () => ({ requestId: null, ipAddress: null, userAgent: null })
}));

import { AgentCallAuthError, authenticateExternalAgentCaller } from './caller-auth';

const CALLER = {
	id: 'caller-1',
	user_id: 'user-1',
	status: 'trusted',
	provider: 'claude',
	caller_key: 'claude:1',
	policy: { scope_mode: 'read_only', allowed_ops: ['onto.task.get'] }
};

function fakeAdmin(user: Record<string, unknown> | null) {
	const updates: string[] = [];
	return {
		updates,
		from(table: string) {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				update: () => {
					updates.push(table);
					return builder;
				},
				maybeSingle: async () => ({
					data: table === 'users' ? user : CALLER,
					error: null
				}),
				then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null })
			};
			return builder;
		}
	};
}

function request() {
	return new Request('https://build-os.com/api/agent-call/buildos', {
		method: 'POST',
		headers: { authorization: 'Bearer boca_secret_value' }
	});
}

describe('authenticateExternalAgentCaller account deletion', () => {
	beforeEach(() => {
		logSecurityEvent.mockReset();
	});

	it('accepts a trusted caller whose account is active', async () => {
		const admin = fakeAdmin({ deletion_status: null });

		const caller = await authenticateExternalAgentCaller(admin, request());

		expect(caller.id).toBe('caller-1');
		expect(admin.updates).toEqual(['external_agent_callers']);
	});

	it.each([
		['pending', { deletion_status: 'pending' }],
		['processing', { deletion_status: 'processing' }]
	])('rejects a trusted caller once deletion is %s', async (_label, user) => {
		const admin = fakeAdmin(user);

		const error = await authenticateExternalAgentCaller(admin, request()).catch(
			(caught) => caught
		);

		expect(error).toBeInstanceOf(AgentCallAuthError);
		expect(error).toMatchObject({ status: 403, code: -32003 });
		expect(admin.updates).toEqual([]);
		expect(logSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'agent.auth.failed',
				outcome: 'denied',
				reason: 'account_deletion_pending'
			}),
			expect.anything()
		);
	});
});
