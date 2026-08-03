// apps/web/src/lib/services/admin/chat-session-flow-targets.test.ts
import { describe, expect, it } from 'vitest';
import {
	auditEventTargetId,
	conversationMessageTargetId,
	conversationToolTargetId,
	conversationTurnTargetId
} from './chat-session-flow-targets';

describe('chat-session-flow-targets', () => {
	it('produces stable DOM-safe destinations for request-flow records', () => {
		expect(conversationTurnTargetId('turn:3')).toBe('chat-flow-turn-turn%3A3');
		expect(conversationMessageTargetId('message/user 1')).toBe(
			'chat-flow-message-message%2Fuser%201'
		);
		expect(conversationToolTargetId('turn:3', 'call:abc')).toBe(
			'chat-flow-tool-turn%3A3-call%3Aabc'
		);
		expect(auditEventTargetId('llm:usage-1')).toBe('chat-flow-audit-llm%3Ausage-1');
	});

	it('does not collide encoded delimiters with literal underscore text', () => {
		expect(conversationTurnTargetId('turn:3')).not.toBe(conversationTurnTargetId('turn_3A3'));
	});
});
