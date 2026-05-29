// apps/web/src/lib/services/agentic-chat-v2/tool-project-id.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

const mocks = vi.hoisted(() => ({ extractTools: vi.fn() }));

// `toolCallRequiresProjectId` falls back to extractTools() when the tool name
// isn't in the precomputed set; mock it so the unit stays pure.
vi.mock('$lib/services/agentic-chat/tools/core/tools.config', () => ({
	extractTools: mocks.extractTools
}));

import {
	getToolsRequiringProjectId,
	maybeInjectProjectId,
	toolCallRequiresProjectId,
	toolDefinitionRequiresProjectId
} from './tool-project-id';

function def(name: string, required: string[] = []): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: name,
			parameters: { type: 'object', properties: {}, required }
		}
	} as ChatToolDefinition;
}

function call(name: string, args: Record<string, unknown> | string = {}): ChatToolCall {
	return {
		id: `call-${name}`,
		type: 'function',
		function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }
	} as ChatToolCall;
}

describe('toolDefinitionRequiresProjectId', () => {
	it('is false for undefined or non-requiring tools', () => {
		expect(toolDefinitionRequiresProjectId(undefined)).toBe(false);
		expect(toolDefinitionRequiresProjectId(def('x', ['name']))).toBe(false);
	});

	it('is true when project_id is in the required list', () => {
		expect(toolDefinitionRequiresProjectId(def('x', ['project_id']))).toBe(true);
	});
});

describe('getToolsRequiringProjectId', () => {
	it('collects only the names of tools requiring project_id', () => {
		const set = getToolsRequiringProjectId([
			def('a', ['project_id']),
			def('b', ['name']),
			def('c', ['project_id', 'name'])
		]);
		expect([...set].sort()).toEqual(['a', 'c']);
	});
});

describe('toolCallRequiresProjectId', () => {
	it('returns true when the name is in the precomputed set (no extractTools call)', () => {
		mocks.extractTools.mockReset();
		expect(toolCallRequiresProjectId('a', new Set(['a']))).toBe(true);
		expect(mocks.extractTools).not.toHaveBeenCalled();
	});

	it('falls back to extractTools lookup when not in the set', () => {
		mocks.extractTools.mockReset();
		mocks.extractTools.mockReturnValue([def('b', ['project_id'])]);
		expect(toolCallRequiresProjectId('b', new Set())).toBe(true);
		expect(mocks.extractTools).toHaveBeenCalledWith(['b']);
	});
});

describe('maybeInjectProjectId', () => {
	it('returns the call unchanged when no projectId is provided', () => {
		const c = call('a', {});
		expect(maybeInjectProjectId(c, undefined, new Set(['a']))).toBe(c);
	});

	it('returns the call unchanged when the tool does not require project_id', () => {
		mocks.extractTools.mockReset();
		mocks.extractTools.mockReturnValue([undefined]);
		const c = call('readonly', {});
		expect(maybeInjectProjectId(c, 'p1', new Set())).toBe(c);
	});

	it('injects project_id into args when missing', () => {
		const c = call('a', { foo: 1 });
		const out = maybeInjectProjectId(c, 'p1', new Set(['a']));
		expect(JSON.parse(out.function.arguments)).toEqual({ foo: 1, project_id: 'p1' });
	});

	it('does not overwrite an existing non-empty project_id', () => {
		const c = call('a', { project_id: 'existing' });
		const out = maybeInjectProjectId(c, 'p1', new Set(['a']));
		expect(out).toBe(c);
	});

	it('injects when existing project_id is blank', () => {
		const c = call('a', { project_id: '   ' });
		const out = maybeInjectProjectId(c, 'p1', new Set(['a']));
		expect(JSON.parse(out.function.arguments).project_id).toBe('p1');
	});

	it('returns the call unchanged when arguments are invalid JSON', () => {
		const c = call('a', 'not json{');
		expect(maybeInjectProjectId(c, 'p1', new Set(['a']))).toBe(c);
	});
});
