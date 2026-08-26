// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/schema-validator.test.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import {
	getToolDefinition,
	getToolParameterSchema,
	getValidationToolDefinitions,
	toolDefinitionSupportsProjectId,
	validateToolArguments
} from './schema-validator';

function directDefinition(
	name: string,
	properties: Record<string, unknown>,
	required?: string[]
): ChatToolDefinition {
	return {
		name,
		description: `${name} test definition`,
		parameters: { type: 'object', properties, required }
	} as unknown as ChatToolDefinition;
}

describe('schema-validator', () => {
	it('uses canonical gateway definitions when the selected surface omits the tool', () => {
		expect(validateToolArguments('tool_schema', { op: 'onto.task.update' }, []).isValid).toBe(
			true
		);
		expect(validateToolArguments('tool_schema', {}, []).errors).toEqual([
			'Missing required parameter: op'
		]);
	});

	it('lets canonical gateway definitions win over stale supplied definitions', () => {
		const stale = directDefinition('tool_schema', {});
		const resolved = getValidationToolDefinitions('tool_schema', [stale]);
		const definition = getToolDefinition('tool_schema', resolved);

		expect(definition).toBeDefined();
		expect(definition).not.toBe(stale);
		expect(validateToolArguments('tool_schema', {}, [stale]).errors).toEqual([
			'Missing required parameter: op'
		]);
	});

	it('resolves direct and nested definitions without mutating them', () => {
		const direct = directDefinition('direct_tool', { query: { type: 'string' } });
		const nested = {
			type: 'function',
			function: {
				name: 'nested_tool',
				description: 'Nested test definition',
				parameters: {
					type: 'object',
					properties: { project_id: { type: 'string' } }
				}
			}
		} as ChatToolDefinition;
		const before = JSON.stringify([direct, nested]);

		expect(getToolDefinition('direct_tool', [direct, nested])).toBe(direct);
		expect(getToolDefinition('nested_tool', [direct, nested])).toBe(nested);
		expect(toolDefinitionSupportsProjectId(nested)).toBe(true);
		expect(
			toolDefinitionSupportsProjectId(directDefinition('required_scope', {}, ['project_id']))
		).toBe(true);
		expect(JSON.stringify([direct, nested])).toBe(before);
	});

	it('enforces the supported object, array, string, number, integer, and boolean types', () => {
		const definition = directDefinition('typed_tool', {
			object_value: { type: 'object' },
			array_value: { type: 'array' },
			string_value: { type: 'string' },
			number_value: { type: 'number' },
			integer_value: { type: 'integer' },
			boolean_value: { type: 'boolean' }
		});

		expect(
			validateToolArguments(
				'typed_tool',
				{
					object_value: {},
					array_value: [],
					string_value: 'value',
					number_value: 2.5,
					integer_value: 2,
					boolean_value: true
				},
				[definition]
			)
		).toEqual({ isValid: true, errors: [] });

		expect(
			validateToolArguments(
				'typed_tool',
				{
					object_value: [],
					array_value: {},
					string_value: 1,
					number_value: '2',
					integer_value: 2.5,
					boolean_value: 'true'
				},
				[definition]
			).errors
		).toEqual([
			'Invalid type for parameter object_value: expected object, got array',
			'Invalid type for parameter array_value: expected array, got object',
			'Invalid type for parameter string_value: expected string, got number',
			'Invalid type for parameter number_value: expected number, got string',
			'Invalid type for parameter integer_value: expected integer, got number',
			'Invalid type for parameter boolean_value: expected boolean, got string'
		]);
	});

	it('preserves required, enum, minItems, null-union, and nested-schema behavior', () => {
		const definition = directDefinition(
			'bounded_tool',
			{
				kind: { type: 'string', enum: ['read', 'write'] },
				items: { type: 'array', minItems: 2 },
				optional_id: { type: ['string', 'null'] },
				options: {
					type: 'object',
					properties: { enabled: { type: 'boolean' } }
				}
			},
			['kind', 'items']
		);

		expect(validateToolArguments('bounded_tool', {}, [definition]).errors).toEqual([
			'Missing required parameter: kind',
			'Missing required parameter: items'
		]);
		expect(
			validateToolArguments(
				'bounded_tool',
				{ kind: 'delete', items: [], optional_id: null, options: { enabled: 'legacy' } },
				[definition]
			).errors
		).toEqual([
			'Invalid value for parameter kind: expected one of "read", "write", got "delete"',
			'Invalid length for parameter items: expected at least 2 items'
		]);
		expect(
			getToolParameterSchema(definition)?.properties?.options?.properties?.enabled?.type
		).toBe('boolean');
	});

	it('enforces published string, array, and numeric bounds', () => {
		const definition = directDefinition('constrained_tool', {
			code: { type: 'string', maxLength: 5, pattern: '^ok' },
			email: { type: 'string', format: 'email' },
			items: { type: 'array', maxItems: 2 },
			count: { type: 'integer', minimum: 1, maximum: 3 },
			cost: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }
		});

		expect(
			validateToolArguments(
				'constrained_tool',
				{ code: 'okay', email: 'a@b.co', items: ['a'], count: 2, cost: 0.5 },
				[definition]
			)
		).toEqual({ isValid: true, errors: [] });
		expect(
			validateToolArguments(
				'constrained_tool',
				{
					code: 'wrong!',
					email: 'not-an-email',
					items: ['a', 'b', 'c'],
					count: 0,
					cost: 1
				},
				[definition]
			).errors
		).toEqual([
			'Invalid length for parameter code: expected at most 5 characters',
			'Invalid format for parameter code: must match ^ok',
			'Invalid format for parameter email: expected email',
			'Invalid length for parameter items: expected at most 2 items',
			'Invalid value for parameter count: expected at least 1',
			'Invalid value for parameter cost: expected less than 1'
		]);
	});

	it('preserves UUID and graph-specific validation strings', () => {
		const updateDefinition = directDefinition('update_onto_task', {
			task_id: { type: 'string' },
			description: { type: 'string' }
		});
		expect(
			validateToolArguments(
				'update_onto_task',
				{ task_id: 'deadbeef', description: 'Updated' },
				[updateDefinition]
			).errors
		).toEqual(['Invalid task_id: expected UUID']);

		const graphDefinition = directDefinition(
			'reorganize_onto_project_graph',
			{ project_id: { type: 'string' }, nodes: { type: 'array', minItems: 1 } },
			['project_id', 'nodes']
		);
		expect(
			validateToolArguments(
				'reorganize_onto_project_graph',
				{
					project_id: '153dea7b-1fc7-4f68-b014-cd2b00c572ec',
					nodes: [{ kind: 'task', id: 'not-a-uuid', connections: [] }]
				},
				[graphDefinition]
			).errors
		).toEqual([
			'Invalid task id at nodes[0]: expected UUID',
			'Use get_onto_project_graph to fetch entity UUIDs before calling reorganize_onto_project_graph.'
		]);
	});

	it('requires an event identity and at least one calendar update field', () => {
		const getDefinition = directDefinition('get_calendar_event_details', {
			onto_event_id: { type: 'string' },
			event_id: { type: 'string' }
		});
		const updateDefinition = directDefinition('update_calendar_event', {
			onto_event_id: { type: 'string' },
			event_id: { type: 'string' },
			title: { type: 'string' }
		});

		expect(
			validateToolArguments('get_calendar_event_details', {}, [getDefinition]).errors
		).toEqual(['Missing required parameter: onto_event_id or event_id']);
		expect(
			validateToolArguments('update_calendar_event', { event_id: 'google-event' }, [
				updateDefinition
			]).errors
		).toEqual(['No update fields provided for update_calendar_event']);
		expect(
			validateToolArguments(
				'update_calendar_event',
				{ event_id: 'google-event', title: 'New title' },
				[updateDefinition]
			)
		).toEqual({ isValid: true, errors: [] });
	});

	it('returns the legacy unknown-tool validation result', () => {
		expect(validateToolArguments('missing_tool', {}, [])).toEqual({
			isValid: false,
			errors: ['Unknown tool: missing_tool']
		});
	});
});
