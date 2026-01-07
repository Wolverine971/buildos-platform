// apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts
/**
 * Utility Tool Definitions
 *
 * Tools for schema information, web search, and BuildOS documentation.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const UTILITY_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'get_field_info',
			description: `Get authoritative information about entity fields including data types, valid values, and descriptions.
Use this when users ask questions like:
- "What are the valid project statuses?"
- "What priority levels can tasks have?"
- "What fields can I set on a project?"
- Any question about valid values, field types, or entity schemas.`,
			parameters: {
				type: 'object',
				properties: {
					entity_type: {
						type: 'string',
						enum: [
							'ontology_project',
							'ontology_task',
							'ontology_plan',
							'ontology_goal'
						],
						description: 'Ontology entity type to inspect'
					},
					field_name: {
						type: 'string',
						description:
							'Specific field name (optional). If provided, returns info for that field only. If omitted, returns commonly-used fields summary.'
					}
				},
				required: ['entity_type']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'web_search',
			description: `Perform a live web search using the Tavily API for current or external information not present in BuildOS.
Use this to discover sources or answer broad research questions. If the user provides a specific URL, use web_visit instead.
Return the concise answer plus the most relevant sources so the assistant can cite URLs in its reply.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The search query to send to Tavily (required)'
					},
					search_depth: {
						type: 'string',
						enum: ['basic', 'advanced'],
						description:
							'Search depth. Use "basic" for fast lookups; "advanced" for more thorough research.'
					},
					max_results: {
						type: 'number',
						default: 5,
						maximum: 10,
						description: 'Maximum number of results to return (1-10)'
					},
					include_answer: {
						type: 'boolean',
						description:
							'Whether to request Tavily to synthesize an answer. Defaults to true.'
					},
					include_domains: {
						type: 'array',
						items: { type: 'string' },
						description: 'Restrict results to these domains.'
					},
					exclude_domains: {
						type: 'array',
						items: { type: 'string' },
						description: 'Exclude results from these domains.'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'web_visit',
			description: `Fetch and summarize a specific URL.
Use this when the user provides a direct link or asks to review a known page.
For discovery or multiple sources, use web_search first.`,
			parameters: {
				type: 'object',
				properties: {
					url: {
						type: 'string',
						description: 'Absolute http/https URL to fetch (required).'
					},
					mode: {
						type: 'string',
						enum: ['auto', 'reader', 'raw'],
						description:
							'Content extraction mode. "auto" uses reader-style extraction for HTML.'
					},
					max_chars: {
						type: 'number',
						default: 6000,
						maximum: 12000,
						description: 'Maximum number of characters to return.'
					},
					include_links: {
						type: 'boolean',
						description: 'Include a short list of outbound links when available.'
					},
					allow_redirects: {
						type: 'boolean',
						description: 'Follow redirects up to a fixed cap (default true).'
					},
					prefer_language: {
						type: 'string',
						description: 'Optional Accept-Language hint (e.g., "en-US").'
					}
				},
				required: ['url']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_buildos_overview',
			description: `Return the canonical BuildOS overview reference.
Use this whenever the user asks broad questions such as:
- "What is BuildOS?"
- "What workflows does BuildOS support?"
- "Point me to the docs about BuildOS."
The tool responds with a structured document that summarizes the mission, architecture, major features, and documentation entry points.`,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_buildos_usage_guide',
			description: `Return the hands-on BuildOS usage playbook.
Use this when the user needs step-by-step instructions for capturing brain dumps, creating ontology projects, connecting calendar integrations, or collaborating with the agentic chat system.
It responds with a structured guide that walks through onboarding, planning, automation, and agent workflows.`,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	}
];
