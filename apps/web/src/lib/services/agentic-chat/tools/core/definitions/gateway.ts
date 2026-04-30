// apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts
/**
 * Gateway Tool Definitions
 *
 * Meta-tools for skill loading, tool discovery, and schema lookup.
 * Normal reads and writes execute through context-specific direct tools.
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
			name: 'libri_overview',
			description:
				'Return the Libri domain/capability overview from the cached Libri manifest, including stable domain ids such as books, people, and youtube_videos.',
			parameters: {
				type: 'object',
				properties: {
					refresh: {
						type: 'boolean',
						description: 'Force a Libri manifest refresh before returning the overview.'
					},
					includeDomains: {
						type: 'boolean',
						description: 'Include compact domain summaries. Defaults to true.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'libri_search_capabilities',
			description:
				'Search validated Libri capabilities by domain and query. Returns canonical ops and materialized direct tool names; use the direct Libri tool after it is loaded in the next model pass.',
			parameters: {
				type: 'object',
				properties: {
					domain: {
						type: 'string',
						description:
							'Optional Libri domain filter such as books, people, or youtube_videos.'
					},
					query: {
						type: 'string',
						description:
							'Natural-language operation search, e.g. "upload transcript analysis".'
					},
					resource: {
						type: 'string',
						description: 'Optional specific resource family such as video.import.'
					},
					kind: {
						type: 'string',
						enum: ['read', 'write'],
						description: 'Optional read/write filter.'
					},
					limit: {
						type: 'integer',
						description: 'Maximum number of matching operations to return.'
					},
					refresh: {
						type: 'boolean',
						description: 'Force a Libri manifest refresh before searching.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'libri_get_capability_schema',
			description:
				'Return the exact schema for one Libri op and materialize its direct tool for the next model pass.',
			parameters: {
				type: 'object',
				properties: {
					op: {
						type: 'string',
						minLength: 1,
						description:
							'Canonical Libri op or direct tool name, e.g. libri.video.import.preview.'
					},
					includeExamples: {
						type: 'boolean',
						description: 'Include examples when Libri provides them.'
					},
					refresh: {
						type: 'boolean',
						description: 'Force a Libri manifest refresh before loading the schema.'
					}
				},
				required: ['op']
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
	}
];
