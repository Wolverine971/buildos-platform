// apps/worker/src/workers/agentic-chat/provider/tool-surface.test.ts
import { describe, expect, it } from 'vitest';
import { UTILITY_TOOL_DEFINITIONS } from '@buildos/agentic-chat-runtime/catalog';
import { reviewedWorkerProviderToolDefinitionV1 } from './tool-surface';

describe('worker provider tool surface', () => {
	it('advertises only web_visit arguments implemented by the worker executor', () => {
		const canonical = UTILITY_TOOL_DEFINITIONS.find(
			(definition) => definition.function.name === 'web_visit'
		);
		expect(canonical).toBeDefined();
		const reviewed = reviewedWorkerProviderToolDefinitionV1(canonical as never);
		const parameters = reviewed?.function.parameters as {
			properties?: Record<string, unknown>;
			additionalProperties?: boolean;
		};
		expect(Object.keys(parameters.properties ?? {}).sort()).toEqual([
			'allow_redirects',
			'max_chars',
			'prefer_language',
			'url'
		]);
		expect(parameters.additionalProperties).toBe(false);
		expect(reviewed?.function.description).toContain('plain text');
	});
});
