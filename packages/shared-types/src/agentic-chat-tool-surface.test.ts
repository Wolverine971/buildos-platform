// packages/shared-types/src/agentic-chat-tool-surface.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from './chat.types';
import {
	AGENTIC_CHAT_TOOL_SURFACE_MAX_BYTES,
	AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS,
	buildAgenticChatToolSurfaceV1,
	decodeAgenticChatToolSurfaceV1
} from './agentic-chat-tool-surface';

function definition(name: string): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `Use ${name}.`,
			parameters: {
				type: 'object',
				properties: { id: { type: 'string' } }
			}
		}
	};
}

describe('AgenticChatToolSurfaceV1', () => {
	it('builds an ordered V1 surface with observability versions', () => {
		const surface = buildAgenticChatToolSurfaceV1({
			surfaceProfile: 'project_write',
			definitions: [definition('get_onto_task_details'), definition('update_onto_task')],
			registryVersion: 'tool-registry/abc123',
			discoveryPolicyVersion: 'tool-discovery-policy/def456'
		});

		expect(surface).toMatchObject({
			version: 1,
			surfaceProfile: 'project_write',
			toolNames: ['get_onto_task_details', 'update_onto_task'],
			registryVersion: 'tool-registry/abc123',
			discoveryPolicyVersion: 'tool-discovery-policy/def456'
		});
	});

	it('normalizes the retained unversioned production shape', () => {
		const decoded = decodeAgenticChatToolSurfaceV1({
			surfaceProfile: 'project_basic',
			toolNames: ['get_project_overview'],
			definitions: [definition('get_project_overview')]
		});

		expect(decoded).toMatchObject({
			ok: true,
			source: 'legacy_v0',
			surface: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview']
			}
		});
	});

	it('does not accept legacy shapes when the writer requires V1', () => {
		expect(
			decodeAgenticChatToolSurfaceV1(
				{ surfaceProfile: 'global_basic', toolNames: [], definitions: [] },
				{ allowLegacy: false }
			)
		).toMatchObject({ ok: false, code: 'unsupported_version' });
		expect(
			decodeAgenticChatToolSurfaceV1({
				version: 2,
				surfaceProfile: 'global_basic',
				toolNames: [],
				definitions: []
			})
		).toMatchObject({ ok: false, code: 'unsupported_version' });
		expect(() =>
			buildAgenticChatToolSurfaceV1({
				surfaceProfile: 'global_basic',
				definitions: [],
				registryVersion: ''
			})
		).toThrow(/invalid_observability_version/);
	});

	it.each([
		{
			label: 'duplicate names',
			value: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview', 'get_project_overview'],
				definitions: [
					definition('get_project_overview'),
					definition('get_project_overview')
				]
			},
			code: 'duplicate_tool_name'
		},
		{
			label: 'name and definition mismatch',
			value: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview'],
				definitions: [definition('get_workspace_overview')]
			},
			code: 'name_definition_mismatch'
		},
		{
			label: 'empty descriptions',
			value: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview'],
				definitions: [
					{
						...definition('get_project_overview'),
						function: {
							...definition('get_project_overview').function,
							description: '  '
						}
					}
				]
			},
			code: 'invalid_definition'
		},
		{
			label: 'non-object top-level schemas',
			value: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview'],
				definitions: [
					{
						type: 'function',
						function: {
							name: 'get_project_overview',
							description: 'Read the project.',
							parameters: { type: 'string' }
						}
					}
				]
			},
			code: 'invalid_definition'
		},
		{
			label: 'non-JSON schema values',
			value: {
				version: 1,
				surfaceProfile: 'project_basic',
				toolNames: ['get_project_overview'],
				definitions: [
					{
						...definition('get_project_overview'),
						function: {
							...definition('get_project_overview').function,
							parameters: {
								type: 'object',
								properties: { score: { type: 'number', default: Number.NaN } }
							}
						}
					}
				]
			},
			code: 'not_json_compatible'
		}
	])('rejects $label', ({ value, code }) => {
		expect(decodeAgenticChatToolSurfaceV1(value)).toMatchObject({ ok: false, code });
	});

	it('enforces tool-count and serialized-byte bounds', () => {
		const tooMany = Array.from(
			{ length: AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS + 1 },
			(_, index) => `tool_${index}`
		);
		expect(
			decodeAgenticChatToolSurfaceV1({
				version: 1,
				surfaceProfile: 'global_basic',
				toolNames: tooMany,
				definitions: []
			})
		).toMatchObject({ ok: false, code: 'tool_count_exceeded' });

		const oversized = definition('large_tool');
		oversized.function.description = 'x'.repeat(AGENTIC_CHAT_TOOL_SURFACE_MAX_BYTES);
		expect(
			decodeAgenticChatToolSurfaceV1({
				version: 1,
				surfaceProfile: 'global_basic',
				toolNames: ['large_tool'],
				definitions: [oversized]
			})
		).toMatchObject({ ok: false, code: 'surface_too_large' });
	});
});
