// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import {
	buildPreparedPromptSurface,
	compactPreparedPromptContextPayload,
	isPreparedPromptPrewarmEnabled,
	isPreparedPromptSurfaceCurrent
} from './prepared-prompt-cache';

function tool(name: string, description: string): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	};
}

describe('isPreparedPromptPrewarmEnabled', () => {
	afterEach(() => {
		delete process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED;
	});

	it('is enabled by default (2026-06-11 trial)', () => {
		delete process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED;
		expect(isPreparedPromptPrewarmEnabled()).toBe(true);
	});

	it('can be turned off via env for rollback', () => {
		process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED = 'false';
		expect(isPreparedPromptPrewarmEnabled()).toBe(false);
	});

	it('treats unparseable values as the default (on)', () => {
		process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED = 'banana';
		expect(isPreparedPromptPrewarmEnabled()).toBe(true);
	});
});

describe('prepared-prompt-cache', () => {
	it('stores compact section summaries instead of duplicating section content', () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			tools
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile: 'global_basic',
			contextType: 'global',
			contextPayload: { contextType: 'global' },
			conversationSummary: null,
			tools,
			envelope,
			createdAt: '2026-05-11T00:00:00.000Z'
		});

		expect(surface.system_prompt).toBe(envelope.systemPrompt);
		expect(surface.sections.length).toBe(envelope.sections.length);
		expect(surface.sections[0]).toEqual(
			expect.objectContaining({
				content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
				content_chars: expect.any(Number)
			})
		);
		expect(JSON.stringify(surface.sections)).not.toContain('"content"');
		expect(JSON.stringify(surface.sections)).not.toContain(envelope.sections[0]?.content);
	});

	it('defensively compacts focus_entity_full before prepared prompt storage', () => {
		const compacted = compactPreparedPromptContextPayload({
			contextType: 'project',
			data: {
				focus_entity_full: {
					id: 'doc-1',
					project_id: 'project-1',
					title: 'Strategy Doc',
					description: 'd'.repeat(2_000),
					content: 'full body '.repeat(1_000),
					props: { secret: 'do not persist' },
					content_length: 9_000,
					content_preview: 'preview'
				}
			}
		});

		const focus = (compacted.data as Record<string, any>).focus_entity_full;
		expect(focus).toMatchObject({
			id: 'doc-1',
			project_id: 'project-1',
			title: 'Strategy Doc',
			content_length: 9_000,
			content_preview: 'preview'
		});
		expect(focus.description.length).toBeLessThanOrEqual(1_503);
		expect(focus).not.toHaveProperty('content');
		expect(focus).not.toHaveProperty('props');
	});

	it('accepts a prepared surface when the current prompt and tool surface still match', () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			tools
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile: 'global_basic',
			contextType: 'global',
			contextPayload: { contextType: 'global' },
			conversationSummary: null,
			tools,
			envelope,
			createdAt: '2026-05-11T00:00:00.000Z'
		});

		expect(
			isPreparedPromptSurfaceCurrent({
				surface,
				contextType: 'global',
				contextPayload: { contextType: 'global' },
				conversationSummary: null,
				tools
			})
		).toBe(true);
	});

	it('rejects a prepared surface when a tool definition changes without a tool-name change', () => {
		const preparedTools = [tool('get_workspace_overview', 'Old description.')];
		const currentTools = [tool('get_workspace_overview', 'New description.')];
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			tools: preparedTools
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile: 'global_basic',
			contextType: 'global',
			contextPayload: { contextType: 'global' },
			conversationSummary: null,
			tools: preparedTools,
			envelope,
			createdAt: '2026-05-11T00:00:00.000Z'
		});

		expect(
			isPreparedPromptSurfaceCurrent({
				surface,
				contextType: 'global',
				contextPayload: { contextType: 'global' },
				conversationSummary: null,
				tools: currentTools
			})
		).toBe(false);
	});

	it('rejects a prepared surface when the cached harness fingerprint no longer matches the live builder output', () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			tools
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile: 'global_basic',
			contextType: 'global',
			contextPayload: { contextType: 'global' },
			conversationSummary: null,
			tools,
			envelope,
			createdAt: '2026-05-11T00:00:00.000Z'
		});

		const staleSurface = {
			...surface,
			harness_sha256: 'deadbeef'
		};

		expect(
			isPreparedPromptSurfaceCurrent({
				surface: staleSurface,
				contextType: 'global',
				contextPayload: { contextType: 'global' },
				conversationSummary: null,
				tools
			})
		).toBe(false);
	});
});
