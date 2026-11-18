// apps/web/src/lib/server/agent-call/knowledge-ask-email.test.ts
//
// Tasker 168: when a connected agent's request_knowledge_access creates a NEW ask, the entry's
// owner gets the same email the web Ask button sends. A merged ask, a refusal, or any other op
// sends nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeGatewayOpMock = vi.hoisted(() => vi.fn());
const sendShareAskedEmailMock = vi.hoisted(() => vi.fn(async () => 'sent'));

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', async (importOriginal) => ({
	...(await importOriginal<
		typeof import('@buildos/shared-agent-ops/gateway/op-execution-gateway')
	>()),
	executeGatewayOp: executeGatewayOpMock
}));

vi.mock('$lib/server/knowledge/sharing.server', () => ({
	sendShareAskedEmail: sendShareAskedEmailMock
}));

import { executeBuildosAgentGatewayTool } from './external-tool-gateway';

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const ENTITY = '55555555-5555-4555-8555-555555555555';
const SHARE = '77777777-7777-4777-8777-777777777777';
const admin = { from: vi.fn(), rpc: vi.fn() };

function askResponse(status: string, newRequest: boolean) {
	return {
		op: 'knowledge.request_access',
		ok: true,
		result: {
			knowledge_ask: {
				status,
				entity_id: ENTITY,
				project_id: PROJECT,
				what: 'contact',
				id: SHARE,
				new_request: newRequest
			},
			message: 'Asked.'
		}
	};
}

function callAsk() {
	return executeBuildosAgentGatewayTool({
		admin,
		userId: USER,
		callerId: 'caller-1',
		callSessionId: 'session-1',
		// Read-only grants can ask, like request_project_access.
		scope: { mode: 'read_only', project_ids: [PROJECT] },
		toolName: 'request_knowledge_access',
		arguments: { entity_id: ENTITY, project_id: PROJECT }
	});
}

describe('agent knowledge asks notify the owner', () => {
	beforeEach(() => {
		executeGatewayOpMock.mockReset();
		sendShareAskedEmailMock.mockClear();
	});

	it('emails the owner for a brand-new ask, from a read-only connection', async () => {
		executeGatewayOpMock.mockResolvedValue(askResponse('sent', true));
		const result = await callAsk();
		expect(result).toMatchObject({ ok: true, result: { knowledge_ask: { status: 'sent' } } });
		expect(executeGatewayOpMock.mock.calls[0]![0].arguments).toMatchObject({
			op: 'knowledge.request_access',
			args: { entity_id: ENTITY, project_id: PROJECT }
		});
		expect(sendShareAskedEmailMock).toHaveBeenCalledWith(SHARE, { admin });
	});

	it('stays quiet for a merged ask, a refusal, or a failed call', async () => {
		executeGatewayOpMock.mockResolvedValueOnce(askResponse('already_waiting', false));
		await callAsk();
		executeGatewayOpMock.mockResolvedValueOnce(askResponse('owner_said_no', false));
		await callAsk();
		executeGatewayOpMock.mockResolvedValueOnce({
			op: 'knowledge.request_access',
			ok: false,
			error: { code: 'FORBIDDEN', message: 'Agents are off here.' }
		});
		await callAsk();
		expect(sendShareAskedEmailMock).not.toHaveBeenCalled();
	});
});
