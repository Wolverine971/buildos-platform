// apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts
/**
 * Gateway Tool Definitions
 *
 * Meta-tools for skill loading, tool discovery, schema lookup, and execution.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const GATEWAY_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'skill_load',
			description:
				'Load one BuildOS skill playbook by skill id. Use this when the task is multi-step, stateful, or easy to get wrong and you need workflow guidance before choosing tools.',
			parameters: {
				type: 'object',
				properties: {
					skill: {
						type: 'string',
						description:
							'Canonical skill id such as "project_creation", "calendar_management", "task_management", or "document_workspace". Legacy dotted skill aliases also work during migration.'
					},
					format: {
						type: 'string',
						enum: ['short', 'full'],
						description:
							'Short returns a compact summary; full returns the full playbook.'
					},
					include_examples: {
						type: 'boolean',
						description: 'Include examples when available.'
					}
				},
				required: ['skill']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'tool_search',
			description:
				'Discover candidate BuildOS tools on demand. Use this only when the exact op is still unknown after context and skill guidance. Search for the operation you need, not workspace data.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Natural-language description of the operation you need, not project/task content. Good examples: "workspace overview", "update existing task state", or "move document in tree". Bad example: "chapter 3 plans" when you are trying to find project data.'
					},
					capability: {
						type: 'string',
						description:
							'Optional BuildOS capability id or path such as "overview", "project_creation", or "capabilities.calendar". Prefer this when the capability family is already clear.'
					},
					group: {
						type: 'string',
						enum: ['onto', 'util', 'cal'],
						description:
							'Optional top-level tool family filter. Use this to narrow the search space once you know the tool family.'
					},
					kind: {
						type: 'string',
						enum: ['read', 'write'],
						description:
							'Optional read/write filter. Prefer this when you know whether you need a mutation or a lookup.'
					},
					entity: {
						type: 'string',
						description:
							'Optional entity filter such as "task", "project", or "document". For example: entity="task" with kind="write" for task mutations.'
					},
					limit: {
						type: 'integer',
						description: 'Maximum number of matches to return.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'tool_schema',
			description:
				'Return the exact schema, required arguments, examples, and usage guidance for one canonical BuildOS op.',
			parameters: {
				type: 'object',
				properties: {
					op: {
						type: 'string',
						minLength: 1,
						description:
							'Canonical operation name such as "onto.task.update", "util.project.overview", or "cal.event.create".'
					},
					include_examples: {
						type: 'boolean',
						description: 'Include example calls when available.'
					},
					include_schema: {
						type: 'boolean',
						description: 'Include the full JSON schema for the op arguments.'
					}
				},
				required: ['op']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'buildos_call',
			description:
				'Execute a canonical BuildOS op after you know the exact op and argument shape. Required shape: { op, args }. Focus on concrete op plus args. Do not call with empty {}.',
			parameters: {
				type: 'object',
				properties: {
					op: {
						type: 'string',
						minLength: 1,
						description:
							'Canonical operation name from tool_search or tool_schema, such as "onto.task.list" or "onto.task.update".'
					},
					args: {
						type: 'object',
						description:
							'Arguments object for the op. Must match the exact required fields from tool_schema for that op.'
					},
					dry_run: {
						type: 'boolean',
						description: 'If true, return a simulated response without mutating data.'
					}
				},
				required: ['op', 'args']
			}
		}
	}
];
