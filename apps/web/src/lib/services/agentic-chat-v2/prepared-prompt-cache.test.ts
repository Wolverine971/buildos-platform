// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import {
	buildPreparedPromptSurface,
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

describe('prepared-prompt-cache', () => {
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
