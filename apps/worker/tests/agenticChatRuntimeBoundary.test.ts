// apps/worker/tests/agenticChatRuntimeBoundary.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('agentic chat runtime boundary', () => {
	it('keeps shared read dispatch package-owned and typed at the worker boundary', async () => {
		const source = await readFile(
			new URL('../src/workers/agentic-chat/readOnlyTool.ts', import.meta.url),
			'utf8'
		);

		expect(source).toContain('executeAgenticChatSharedReadToolV1');
		expect(source).toContain('AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1');
		expect(source).not.toContain('SHARED_READ_TOOL_RUNNERS');
		expect(source).not.toContain('args as never');
	});
});
