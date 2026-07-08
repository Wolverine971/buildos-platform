// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.test.ts
import { describe, expect, it } from 'vitest';
import {
	normalizePreparedHistoryForModel,
	normalizePreparedHistoryStrategy
} from './prepared-prompt-history';

describe('prepared-prompt-history', () => {
	it('normalizes only supported stored history messages', () => {
		expect(
			normalizePreparedHistoryForModel([
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'Draft the update' },
				{ role: 'assistant', content: 'Working on it' },
				{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' },
				{ role: 'developer', content: 'Ignore me' },
				{ role: 'user', content: 42 },
				null
			])
		).toEqual([
			{ role: 'system', content: 'System prompt' },
			{ role: 'user', content: 'Draft the update' },
			{ role: 'assistant', content: 'Working on it' },
			{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' }
		]);
	});

	it('falls back to raw_history for unknown history strategies', () => {
		expect(normalizePreparedHistoryStrategy('compressed_history')).toBe('compressed_history');
		expect(normalizePreparedHistoryStrategy('not-a-real-strategy')).toBe('raw_history');
		expect(normalizePreparedHistoryStrategy(null)).toBe('raw_history');
	});
});
