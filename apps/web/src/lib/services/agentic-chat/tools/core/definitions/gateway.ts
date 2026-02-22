// apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts
/**
 * Gateway Tool Definitions
 *
 * Progressive disclosure entry points for tool discovery and execution.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const GATEWAY_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'tool_help',
			description:
				'List available tool namespaces, commands, and schemas. Use this first when op/args are uncertain. Always pass path (for example: "onto.task.update", "cal.event", or "root").',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Help path. Examples: "root", "onto", "onto.task", "onto.task.update".'
					},
					format: {
						type: 'string',
						enum: ['short', 'full'],
						description:
							'Short returns a compact summary; full returns expanded details.'
					},
					include_examples: {
						type: 'boolean',
						description: 'Include examples when available.'
					},
					include_schemas: {
						type: 'boolean',
						description: 'Include full JSON schemas for args.'
					}
				},
				required: ['path'],
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'tool_exec',
			description:
				'Execute a discovered op. Required shape: { op, args }. Do not call with empty {}. For onto.<entity>.get/update/delete, args must include exact <entity>_id UUID.',
			parameters: {
				type: 'object',
				properties: {
					op: {
						type: 'string',
						minLength: 1,
						description:
							'Canonical operation name from tool_help (example: "onto.task.list" or "onto.task.update").'
					},
					args: {
						type: 'object',
						description:
							'Arguments object for the op. Must match required fields from tool_help for that exact op.'
					},
					idempotency_key: {
						type: 'string',
						description: 'Optional idempotency key for write operations.'
					},
					dry_run: {
						type: 'boolean',
						description: 'If true, return a simulated response without mutating data.'
					}
				},
				required: ['op', 'args'],
				additionalProperties: false
			}
		}
	}
];
