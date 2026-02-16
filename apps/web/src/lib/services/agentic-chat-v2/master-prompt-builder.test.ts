// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { buildMasterPrompt } from './master-prompt-builder';

afterEach(() => {
	delete mockEnv.AGENTIC_CHAT_TOOL_GATEWAY;
});

describe('buildMasterPrompt gateway tool instructions', () => {
	it('includes gateway query pattern guidance when enabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).toContain('Gateway query pattern (default)');
		expect(prompt).toContain(
			'For any onto.*.search op (including onto.search), use args.query.'
		);
		expect(prompt).toContain('Calendar events are under cal.event.* (not onto.event.*).');
		expect(prompt).not.toContain('tool_batch');
		expect(prompt).toContain(
			'Project context events are time-boxed to the last 7 days and next 14 days (UTC).'
		);
		expect(prompt).toContain(
			'To inspect events outside that context window, call cal.event.list with args.timeMin and args.timeMax.'
		);
		expect(prompt).not.toContain('Common ops you can often use directly');
	});

	it('omits the tool discovery block when gateway mode is disabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).not.toContain('<tool_discovery>');
		expect(prompt).not.toContain('Gateway query pattern (default)');
	});

	it('falls back project_id to entity_id for project context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: null,
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
		});

		expect(prompt).toContain('<project_id>05c40ed8-9dbe-4893-bd64-8aeec90eab40</project_id>');
	});
});
