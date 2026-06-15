// apps/web/src/lib/services/agentic-chat-v2/stream-request.test.ts
import { describe, expect, it } from 'vitest';
import { parseFastAgentStreamRequestBody } from './stream-request';
import { normalizeFastAgentStreamRequest } from './types';

describe('parseFastAgentStreamRequestBody', () => {
	it('accepts a minimal valid body', () => {
		const result = parseFastAgentStreamRequestBody({
			message: 'Hello',
			context_type: 'global'
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.input.message).toBe('Hello');
		}
	});

	it('passes through unknown keys instead of rejecting them', () => {
		const result = parseFastAgentStreamRequestBody({
			message: 'Hello',
			some_future_field: { nested: true }
		});
		expect(result.ok).toBe(true);
	});

	it('accepts deprecated snake_case aliases', () => {
		const result = parseFastAgentStreamRequestBody({
			message: 'Hello',
			prepared_prompt_key: 'pp_v1.abc.def',
			voice_note_group_id: 'group-1',
			last_turn_context: { summary: 'prior turn' },
			prewarmed_context: { key: 'v2|global', version: 2 }
		});
		expect(result.ok).toBe(true);
	});

	it('accepts null voice note group ids as absent optional values', () => {
		const result = parseFastAgentStreamRequestBody({
			message: 'Hello',
			voiceNoteGroupId: null,
			voice_note_group_id: null
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.input.voiceNoteGroupId).toBeNull();
			expect(result.input.voice_note_group_id).toBeNull();
			expect(normalizeFastAgentStreamRequest(result.input).voiceNoteGroupId).toBeUndefined();
		}
	});

	it('rejects a non-object body with a path-labelled issue', () => {
		const result = parseFastAgentStreamRequestBody('not an object');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]).toContain('(root)');
		}
	});

	it('rejects wrong field shapes (message as object, attachments as string)', () => {
		const badMessage = parseFastAgentStreamRequestBody({ message: { text: 'hi' } });
		expect(badMessage.ok).toBe(false);
		if (!badMessage.ok) {
			expect(badMessage.issues[0]).toContain('message');
		}

		const badAttachments = parseFastAgentStreamRequestBody({
			message: 'hi',
			attachments: 'nope'
		});
		expect(badAttachments.ok).toBe(false);
		if (!badAttachments.ok) {
			expect(badAttachments.issues[0]).toContain('attachments');
		}
	});

	it('caps reported issues at five', () => {
		const result = parseFastAgentStreamRequestBody({
			message: 1,
			session_id: 2,
			context_type: 3,
			entity_id: 4,
			client_turn_id: 5,
			voiceNoteGroupId: 6
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.length).toBeLessThanOrEqual(5);
		}
	});
});
