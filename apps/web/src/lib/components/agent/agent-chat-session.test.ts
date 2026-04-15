// apps/web/src/lib/components/agent/agent-chat-session.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { VoiceNote } from '$lib/types/voice-notes';
import {
	AGENT_CHAT_DEFAULT_PROMPT_VARIANT,
	AGENT_CHAT_LITE_PROMPT_VARIANT,
	buildAgentChatSessionSnapshot,
	deriveSessionTitle,
	loadAgentChatSessionSnapshot,
	normalizeAgentChatPromptVariantSelection,
	prewarmAgentContext,
	resolveAgentChatPromptVariantForRequest
} from './agent-chat-session';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
	return {
		id: 'session-1',
		user_id: 'user-1',
		context_type: 'global',
		entity_id: null,
		title: 'Agent Session',
		auto_title: null,
		summary: null,
		agent_metadata: null,
		...overrides
	} as ChatSession;
}

describe('agent-chat-session helpers', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('normalizes and gates prompt variant requests for one-turn admin tests', () => {
		expect(normalizeAgentChatPromptVariantSelection('lite_seed_v1')).toBe(
			AGENT_CHAT_LITE_PROMPT_VARIANT
		);
		expect(normalizeAgentChatPromptVariantSelection('unknown')).toBe(
			AGENT_CHAT_DEFAULT_PROMPT_VARIANT
		);

		expect(
			resolveAgentChatPromptVariantForRequest({
				canUsePromptVariantControls: false,
				selectedPromptVariant: AGENT_CHAT_LITE_PROMPT_VARIANT
			})
		).toBeNull();
		expect(
			resolveAgentChatPromptVariantForRequest({
				canUsePromptVariantControls: true,
				selectedPromptVariant: AGENT_CHAT_DEFAULT_PROMPT_VARIANT
			})
		).toBeNull();
		expect(
			resolveAgentChatPromptVariantForRequest({
				canUsePromptVariantControls: true,
				selectedPromptVariant: AGENT_CHAT_LITE_PROMPT_VARIANT
			})
		).toBe(AGENT_CHAT_LITE_PROMPT_VARIANT);
	});

	it('deriveSessionTitle prefers a non-placeholder manual title and falls back to auto title', () => {
		expect(
			deriveSessionTitle(
				makeSession({
					title: 'Weekly project review',
					auto_title: 'Auto title'
				})
			)
		).toBe('Weekly project review');

		expect(
			deriveSessionTitle(
				makeSession({
					title: 'Agent Session',
					auto_title: 'Plan review follow-up'
				})
			)
		).toBe('Plan review follow-up');
	});

	it('buildAgentChatSessionSnapshot restores project focus, filters messages, and sorts voice notes', () => {
		const focus: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Homepage cleanup',
			projectId: 'project-1',
			projectName: 'Website refresh'
		};
		const voiceNotes: VoiceNote[] = [
			{
				id: 'note-2',
				group_id: 'group-1',
				segment_index: 2,
				created_at: '2026-03-28T10:02:00.000Z'
			},
			{
				id: 'note-1',
				group_id: 'group-1',
				segment_index: 1,
				created_at: '2026-03-28T10:01:00.000Z'
			}
		] as VoiceNote[];

		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession({
				context_type: 'project',
				entity_id: 'project-1',
				title: 'Agent Session',
				auto_title: 'Website refresh thread',
				summary: 'You were reorganizing homepage tasks.',
				agent_metadata: { focus }
			}),
			messages: [
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Here is the latest update.',
					created_at: '2026-03-28T10:00:00.000Z'
				},
				{
					id: 'tool-1',
					role: 'tool',
					content: 'hidden tool output',
					created_at: '2026-03-28T10:00:30.000Z'
				}
			] as any,
			truncated: true,
			voiceNotes
		});

		expect(snapshot.contextType).toBe('project');
		expect(snapshot.selectedContextLabel).toBe('Website refresh thread');
		expect(snapshot.selectedEntityId).toBe('project-1');
		expect(snapshot.projectFocus).toEqual(focus);
		expect(snapshot.messages).toHaveLength(3);
		expect(snapshot.messages[0]?.type).toBe('activity');
		expect(snapshot.messages[1]?.id).toBe('assistant-1');
		expect(snapshot.messages[2]?.role).toBe('system');
		expect(snapshot.voiceNotesByGroupId['group-1']?.map((note) => note.id)).toEqual([
			'note-1',
			'note-2'
		]);
	});

	it('prewarmAgentContext returns parsed session data from the v2 prewarm endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				success: true,
				data: {
					session: { id: 'session-2' },
					prewarmed_context: { key: 'global:none' }
				}
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await prewarmAgentContext({
			context_type: 'global',
			ensure_session: true
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/agent/v2/prewarm',
			expect.objectContaining({
				method: 'POST'
			})
		);
		expect(result).toEqual({
			session: { id: 'session-2' },
			prewarmedContext: { key: 'global:none' }
		});
	});

	it('loadAgentChatSessionSnapshot throws the backend error when session restore fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Session not found' })
			})
		);

		await expect(loadAgentChatSessionSnapshot('missing-session')).rejects.toThrow(
			'Session not found'
		);
	});
});
