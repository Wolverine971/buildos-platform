// packages/shared-types/src/agentic-chat-tool.types.test.ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
	ChatToolDefinition,
	RegistryOp,
	ToolContextScope,
	ToolJsonObjectSchema,
	ToolJsonValue
} from './index';

describe('Agentic Chat tool contracts', () => {
	it('keeps recursive parameter schemas JSON-serializable', () => {
		const schema: ToolJsonObjectSchema = {
			type: 'object',
			additionalProperties: false,
			properties: {
				filters: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							value: { type: ['string', 'null'], default: null }
						}
					}
				}
			}
		};

		expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
		expectTypeOf(schema.properties.filters?.default).toEqualTypeOf<ToolJsonValue | undefined>();
	});

	it('shares exact context and schema types across definitions and registry entries', () => {
		expectTypeOf<
			ChatToolDefinition['function']['parameters']
		>().toEqualTypeOf<ToolJsonObjectSchema>();
		expectTypeOf<
			NonNullable<RegistryOp['contexts']>[number]
		>().toEqualTypeOf<ToolContextScope>();
		expectTypeOf<RegistryOp['parameters_schema']>().toEqualTypeOf<ToolJsonObjectSchema>();
		expectTypeOf<RegistryOp['chat_discoverable']>().toEqualTypeOf<boolean>();
	});
});
