// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { selectFastChatTools } from './tool-selector';

const TOOL_GATEWAY_ENV = 'AGENTIC_CHAT_TOOL_GATEWAY';
const previousGatewayEnv = process.env[TOOL_GATEWAY_ENV];

afterEach(() => {
	if (previousGatewayEnv === undefined) {
		delete process.env[TOOL_GATEWAY_ENV];
		return;
	}
	process.env[TOOL_GATEWAY_ENV] = previousGatewayEnv;
});

describe('selectFastChatTools', () => {
	it('returns only gateway tools when gateway flag is enabled', () => {
		process.env[TOOL_GATEWAY_ENV] = 'true';

		const tools = selectFastChatTools({
			contextType: 'global',
			message: 'what is going on with my projects'
		});
		const names = tools.map((tool) => tool.function?.name);

		expect(names).toEqual(['tool_help', 'tool_exec', 'tool_batch']);
	});

	it('returns legacy tools when gateway flag is disabled', () => {
		process.env[TOOL_GATEWAY_ENV] = 'false';

		const tools = selectFastChatTools({
			contextType: 'global',
			message: 'what is going on with my projects'
		});
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names.length).toBeGreaterThan(3);
		expect(names).not.toContain('tool_help');
		expect(names).not.toContain('tool_exec');
	});
});
