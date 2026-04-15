// apps/web/src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts
import { describe, expect, it } from 'vitest';
import { getToolSchema } from '../registry/tool-schema';
import { CHAT_TOOL_DEFINITIONS } from './tool-definitions';

const FORBIDDEN_TOP_LEVEL_KEYS = ['oneOf', 'anyOf', 'allOf', 'not', 'enum'] as const;

describe('Chat tool schema compatibility', () => {
	it('uses OpenRouter/OpenAI-compatible top-level function parameter schemas', () => {
		for (const tool of CHAT_TOOL_DEFINITIONS) {
			const toolName = tool.function?.name ?? 'unknown_tool';
			const parameters = tool.function?.parameters as Record<string, unknown> | undefined;

			expect(parameters, `${toolName} should define function.parameters`).toBeDefined();
			expect(parameters?.type, `${toolName} must have top-level type=object`).toBe('object');

			for (const key of FORBIDDEN_TOP_LEVEL_KEYS) {
				expect(
					Object.prototype.hasOwnProperty.call(parameters ?? {}, key),
					`${toolName} cannot use top-level "${key}" in function.parameters`
				).toBe(false);
			}
		}
	});

	it('does not require content for create_onto_document', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'create_onto_document'
		);
		const parameters = tool?.function?.parameters as { required?: string[] } | undefined;
		const required = Array.isArray(parameters?.required) ? parameters.required : [];

		expect(required).toContain('project_id');
		expect(required).toContain('title');
		expect(required).toContain('description');
		expect(required).not.toContain('content');
	});

	it('returns exact create_onto_project schema details through tool_schema', () => {
		const schema = getToolSchema('onto.project.create', {
			include_examples: true,
			include_schema: true
		}) as Record<string, any>;

		expect(schema.type).toBe('tool_schema');
		expect(schema.tool_name).toBe('create_onto_project');
		expect(schema.usage).toBe('create_onto_project({ ... })');
		expect(schema.required_args).toEqual(['project', 'entities', 'relationships']);
		expect(schema.schema.required).toEqual(['project', 'entities', 'relationships']);
		expect(schema.schema.properties.project.required).toEqual(['name', 'type_key']);
		expect(schema.schema.properties.entities.items.required).toEqual(['temp_id', 'kind']);
		expect(schema.schema.properties.project.properties.type_key.description).toContain(
			'Starts with project.'
		);
		expect(schema.schema.properties.entities.description).toContain('goal/plan/metric name');
		expect(schema.example_tool_call.name).toBe('create_onto_project');
	});
});
