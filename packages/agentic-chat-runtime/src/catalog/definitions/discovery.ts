// packages/agentic-chat-runtime/src/catalog/definitions/discovery.ts
/**
 * Gateway discovery tool definitions.
 *
 * These meta-tools remain separate from direct definitions and semantic
 * controls so hosts opt into each surface explicitly.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const GATEWAY_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'domain_search',
			description: 'Find BuildOS subject domains for the current task.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Natural-language domain query.'
					},
					limit: {
						type: 'integer',
						default: 6,
						minimum: 1,
						maximum: 12,
						description: 'Maximum matches.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'domain_load',
			description: 'Load one domain card.',
			parameters: {
				type: 'object',
				properties: {
					domain: {
						type: 'string',
						description: 'Domain id.'
					}
				},
				required: ['domain']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'outcome_card_search',
			description:
				'Find specialized outcome cards after the domain is known and before choosing skills.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Natural-language outcome search, e.g. "cold email campaign", "YouTube growth plan", or "UI screen review".'
					},
					domain: {
						type: 'string',
						description:
							'Optional BuildOS domain id such as "sales_and_growth.cold_email" or "marketing.youtube_growth".'
					},
					buildosCapability: {
						type: 'string',
						description:
							'Optional BuildOS runtime capability id such as "planning", "documents", or "project_audit".'
					},
					limit: {
						type: 'integer',
						default: 8,
						minimum: 1,
						maximum: 20,
						description: 'Maximum matches.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'outcome_card_load',
			description:
				'Load one outcome card with its skills, resources, outputs, quality criteria, and tool hints.',
			parameters: {
				type: 'object',
				properties: {
					outcomeCard: {
						type: 'string',
						description:
							'Canonical outcome card id such as "cold_email_campaign_build", "youtube_growth_strategy_plan", or "ui_ux_screen_review".'
					}
				},
				required: ['outcomeCard']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'skill_search',
			description: 'Find BuildOS workflow playbooks relevant to the task.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Natural-language workflow query.'
					},
					domain: {
						type: 'string',
						description: 'Optional domain id.'
					},
					capability: {
						type: 'string',
						description: 'Optional BuildOS capability id.'
					},
					limit: {
						type: 'integer',
						default: 8,
						minimum: 1,
						maximum: 20,
						description: 'Maximum matches.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'resource_search',
			description: 'Find domain resources.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string'
					},
					domain: {
						type: 'string'
					},
					skill: {
						type: 'string'
					},
					limit: {
						type: 'integer',
						default: 8,
						minimum: 1,
						maximum: 20,
						description: 'Maximum matches.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'resource_load',
			description: 'Load one resource.',
			parameters: {
				type: 'object',
				properties: {
					resource: {
						type: 'string'
					}
				},
				required: ['resource']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'skill_load',
			description:
				'Load a BuildOS skill playbook for a multi-step, stateful, or error-prone task before choosing tools. Do not reload a skill already loaded this session unless full markdown or examples are needed. Prefer root skills; load a child only for a clear niche match.',
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
							"Short returns a compact summary; full returns the full playbook. Omit so the runtime picks the skill's recommended format."
					},
					include_examples: {
						type: 'boolean',
						default: true,
						description:
							'Include examples when available; set false for a leaner response.'
					}
				},
				required: ['skill']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'skill_reference_load',
			description:
				'Load a reference module listed by skill_load when the task needs deferred source, template, example, or edge-case detail.',
			parameters: {
				type: 'object',
				properties: {
					skill: {
						type: 'string',
						description:
							'Canonical root skill id or legacy skill alias that declared the reference module.'
					},
					reference: {
						type: 'string',
						description:
							'Declared reference module id or path from the skill_load reference_modules index.'
					}
				},
				required: ['skill', 'reference']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'tool_search',
			description:
				'Discover BuildOS tools only when the exact operation remains unknown after context and skill guidance. Do not rediscover a direct tool already present. Search for an operation, not workspace data; to browse a category, omit query and pass group or entity.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Natural-language description of the operation you need (e.g. "update existing task state"), not project/task content.'
					},
					capability: {
						type: 'string',
						description:
							'Optional BuildOS capability id or path such as "overview" or "capabilities.calendar".'
					},
					group: {
						type: 'string',
						enum: ['onto', 'util', 'cal', 'email', 'search', 'x'],
						description: 'Optional top-level tool family filter.'
					},
					kind: {
						type: 'string',
						enum: ['read', 'write'],
						description: 'Optional read/write filter.'
					},
					entity: {
						type: 'string',
						description: 'Optional entity filter such as "task", "project", "document".'
					},
					limit: {
						type: 'integer',
						default: 8,
						minimum: 1,
						maximum: 25,
						description: 'Maximum matches.'
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
						default: true,
						description: 'Include example calls when available.'
					},
					include_schema: {
						type: 'boolean',
						default: true,
						description: 'Include the full JSON schema for the op arguments.'
					}
				},
				required: ['op']
			}
		}
	}
];
