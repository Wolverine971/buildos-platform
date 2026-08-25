// apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts
/**
 * Gateway Tool Definitions
 *
 * Meta-tools for skill loading, tool discovery, and schema lookup.
 * Normal reads and writes execute through context-specific direct tools.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const TURN_CONTRACT_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'declare_turn_contract',
		description:
			'Declare durable outcomes when reads must precede writes; call alongside the first reads. Omit for answer-only turns, research for a possible later change, or an immediate direct write. This records intent, not a mutation. After reading, request clarification only for an unresolved required choice; otherwise complete every outcome or report the blocker. Separate outcomes when targets receive different values.',
		parameters: {
			type: 'object',
			properties: {
				summary: {
					type: 'string',
					maxLength: 300,
					description: 'A short description of the user-visible durable result.'
				},
				outcomes: {
					type: 'array',
					minItems: 1,
					maxItems: 20,
					description:
						'Required durable effects, described as outcomes rather than steps or tool names. Use separate outcomes for targets receiving different values (e.g. A/B state_key=done versus C priority=1).',
					items: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								maxLength: 80,
								description: 'Optional stable label for this outcome.'
							},
							action: {
								type: 'string',
								enum: [
									'create',
									'update',
									'move',
									'organize',
									'link',
									'unlink',
									'delete',
									'schedule',
									'set',
									'assign',
									'complete',
									'archive',
									'restore',
									'tag'
								]
							},
							entity_kind: {
								type: 'string',
								enum: [
									'project',
									'task',
									'document',
									'event',
									'goal',
									'plan',
									'milestone',
									'risk',
									'relationship',
									'calendar',
									'entity'
								]
							},
							description: {
								type: 'string',
								maxLength: 240
							},
							target_ids: {
								type: 'array',
								maxItems: 50,
								items: { type: 'string' },
								description:
									'Known canonical IDs eligible for this outcome. Omit for creates and until targets are discovered; minimum_successful_effects is bounded by this list.'
							},
							required_fields: {
								type: 'array',
								maxItems: 30,
								items: { type: 'string' },
								description:
									'Required durable postconditions, not tool arguments. For document-tree placement use parent_id and position.'
							},
							changes: {
								type: 'array',
								maxItems: 20,
								items: {
									type: 'object',
									properties: {
										field: { type: 'string', maxLength: 80 },
										value: { type: 'string', maxLength: 160 }
									},
									required: ['field', 'value']
								},
								description:
									'The durable field values this outcome sets on every target, e.g. [{"field":"state_key","value":"done"}] or [{"field":"priority","value":"1"}]. Targets that receive different values belong in separate outcomes.'
							},
							minimum_successful_effects: {
								type: 'integer',
								minimum: 1,
								maximum: 100,
								description:
									'Distinct targets that must change. Multiple fields on one target count once; never exceed target_ids.length.'
							},
							label: {
								type: 'string',
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Create only: symbolic name for one new entity so later outcomes can reference it before it has an ID. Set minimum_successful_effects=1 and declare its title in changes.'
							},
							parent_label: {
								type: 'string',
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Move/organize only: label of a destination created by this contract. For an existing parent, put its ID in changes as parent_id; omit when using new_parent_title.'
							}
						},
						required: ['action', 'entity_kind', 'minimum_successful_effects']
					}
				}
			},
			required: ['outcomes']
		}
	}
};

export const CANCEL_TURN_CONTRACT_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'cancel_turn_contract',
		description:
			'Cancel an unfinished turn contract only when the user explicitly cancels or supersedes it. This is control only; never cancel merely because execution is blocked.',
		parameters: {
			type: 'object',
			properties: {
				reason: {
					type: 'string',
					maxLength: 240,
					description: 'How the current message cancelled or superseded it.'
				}
			},
			required: ['reason']
		}
	}
};

export const DECLARE_READ_ONLY_TURN_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'declare_read_only_turn',
		description:
			'Declare that this turn requires no durable change. Research, comparison, analysis, and advice are read-only when they only inform a possible later change. Never use this to replace a commissioned action.',
		parameters: {
			type: 'object',
			properties: {
				reason: {
					type: 'string',
					maxLength: 240,
					description: 'Why no durable mutation is requested.'
				}
			},
			required: ['reason']
		}
	}
};

export const REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'request_turn_clarification',
		description:
			'Ask when a commissioned durable change still has an ambiguous required target or value after reading context. Do not postpone safe work or ask about a merely possible later change.',
		parameters: {
			type: 'object',
			properties: {
				reason: {
					type: 'string',
					maxLength: 240,
					description: 'The unresolved choice.'
				},
				question: {
					type: 'string',
					maxLength: 500,
					description: 'A concise question that lets the user resolve the choice.'
				}
			},
			required: ['reason', 'question']
		}
	}
};

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
			name: 'work_capability_search',
			description:
				'Legacy alias for outcome_card_search. Prefer outcome_card_search for new calls.',
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
			name: 'work_capability_load',
			description:
				'Legacy alias for outcome_card_load. Prefer outcome_card_load for new calls.',
			parameters: {
				type: 'object',
				properties: {
					workCapability: {
						type: 'string',
						description:
							'Canonical outcome card id such as "cold_email_campaign_build", "youtube_growth_strategy_plan", or "ui_ux_screen_review".'
					}
				},
				required: ['workCapability']
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
