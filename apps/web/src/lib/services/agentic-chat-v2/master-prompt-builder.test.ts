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

		expect(prompt).toContain('Canonical ontology CRUD/search family');
		expect(prompt).toContain('In tool_exec.op, use only canonical ops.');
		expect(prompt).toContain('Never use legacy op strings in tool_exec.op');
		expect(prompt).toContain(
			'Use targeted discovery first: tool_help("onto.<entity>") or tool_help("cal.event").'
		);
		expect(prompt).toContain(
			'For first-time or complex writes in a turn, call tool_help("<exact op>", { format: "full", include_schemas: true }) before tool_exec.'
		);
		expect(prompt).toContain(
			'For any onto.*.search op (including onto.search), always pass args.query and include args.project_id when known.'
		);
		expect(prompt).toContain('Calendar ops are under cal.event.* and cal.project.*');
		expect(prompt).not.toContain('tool_batch');
		expect(prompt).toContain(
			'Project context events are time-boxed to the last 7 days and next 14 days (UTC).'
		);
		expect(prompt).toContain(
			'To inspect events outside that context window, call cal.event.list with args.timeMin and args.timeMax.'
		);
		expect(prompt).toContain(
			'Use new_parent_id only when nesting under a parent (omit it for root moves).'
		);
		expect(prompt).toContain(
			'For "link unlinked docs" requests, call onto.document.tree.get once, then issue onto.document.tree.move for each unlinked document ID.'
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
		expect(prompt).not.toContain('Canonical ontology CRUD/search family');
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
