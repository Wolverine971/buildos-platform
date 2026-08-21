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
			'Declare durable outcomes this turn must complete when reads are needed before writing. Call with the first reads. Do not use for answer-only turns, research that only informs a later possible change, or when a direct write can run immediately. Future context is not a commission to perform that later change now. This records intent, not a mutation. If a required target or value remains ambiguous after reading context, call request_turn_clarification. Otherwise complete every outcome or report the blocker. One outcome per distinct change; targets that receive different values go in separate outcomes.',
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
						'Semantic effects required before this turn may claim completion. Describe outcomes, not implementation steps or tool names. One outcome per distinct change. Never put targets that receive different values in the same outcome: "mark A and B done and make C top priority" is two outcomes (A,B → state_key=done; C → priority=1), not one update with three targets.',
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
									'Known canonical ids of existing entities bounding eligible targets. Omit for create outcomes: a new entity has no id yet, and its containing project is not the created entity target. Omit until existing targets are discovered; minimum_successful_effects applies within this set.'
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
									'Distinct targets that must change, counted within target_ids and never more than its length: setting several fields on one target is still one effect. Use the full target count when every target must change.'
							},
							label: {
								type: 'string',
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Create outcomes only: a short symbolic name for the one entity this outcome creates (e.g. "meeting-notes"), so later outcomes can reference it before it has an id. A labelled create has minimum_successful_effects 1 and declares its title in changes. Use one labelled create per new parent.'
							},
							parent_label: {
								type: 'string',
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Move/organize outcomes only: the destination is the entity created by the outcome in this contract carrying this label. The id is bound by the system after that create executes; this is a resolved destination, not a missing value. Omit when moving into an existing parent (put its id in changes as parent_id) or when grouping by new_parent_title at execution.'
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
			'Declare that this turn requires no durable data change. Information gathering, research, comparison, analysis, and advice remain read-only when they only inform a later possible change. Never use this to replace an action the user commissioned with a proposal or approval request.',
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
			'Use when a durable change is commissioned but a required target or value remains ambiguous after reading context. Ask instead of guessing; do not use this to postpone safe work or because informational research will inform a later possible change.',
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
			description: 'Find subject domains.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string'
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
				'Find outcome cards within a domain. Use after domain context is known when the task needs a specialized output lane before choosing skills.',
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
						description: 'Maximum number of matching outcome cards to return.'
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
				'Load one compact outcome card. This exposes relevant skills, resource handles, outputs, quality criteria, and tool hints without granting direct write tools.',
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
						description: 'Maximum number of matching outcome cards to return.'
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
			description: 'Find BuildOS skills.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string'
					},
					domain: {
						type: 'string'
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
				'Load one BuildOS skill playbook by skill id. Use this when the task is multi-step, stateful, or easy to get wrong and you need workflow guidance before choosing tools. Skills already reported as loaded this session count as loaded — reload one only when this turn needs its full markdown or examples. Root skills are the default depth; load a child skill only when its niche clearly matches.',
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
						description:
							'Include examples when available. Request true after a prior failure on the same operation.'
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
				'Load one reference module declared by a BuildOS skill. Use only after skill_load exposes reference_modules and the current task needs deeper source, template, example, or edge-case detail — niche, mode-specific, or high-context guidance the root playbook defers.',
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
				'Discover candidate BuildOS tools on demand. Use this only when the exact op is still unknown after context and skill guidance. Never use it to rediscover a direct tool already present in your tool surface; that direct tool definition is already its schema. Search for the operation you need, not workspace data. To browse a whole category, omit query and pass group or entity.',
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
