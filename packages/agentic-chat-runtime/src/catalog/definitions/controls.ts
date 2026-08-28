import type { ChatToolDefinition } from '@buildos/shared-types';

export const DECLARE_TURN_CONTRACT_TOOL_NAME = 'declare_turn_contract';
export const DECLARE_READ_ONLY_TURN_TOOL_NAME = 'declare_read_only_turn';
export const REQUEST_TURN_CLARIFICATION_TOOL_NAME = 'request_turn_clarification';
export const CANCEL_TURN_CONTRACT_TOOL_NAME = 'cancel_turn_contract';

export const AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1 = Object.freeze([
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME,
	CANCEL_TURN_CONTRACT_TOOL_NAME
] as const);

export type AgenticChatStandardControlToolNameV1 =
	(typeof AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1)[number];

export const TURN_CONTRACT_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: DECLARE_TURN_CONTRACT_TOOL_NAME,
		description:
			'Declare the complete durable outcomes for an active complex-write route. This records intent, not a mutation. Describe outcomes rather than tool steps, include the real cardinality, and separate targets that receive different values.',
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
						'Complete durable effects, described as outcomes rather than tool steps. Separate targets that receive different values.',
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
									'Durable field/value pairs applied to every target. Targets receiving different values require separate outcomes.'
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
		name: CANCEL_TURN_CONTRACT_TOOL_NAME,
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
		name: DECLARE_READ_ONLY_TURN_TOOL_NAME,
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
		name: REQUEST_TURN_CLARIFICATION_TOOL_NAME,
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

export const AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1: readonly ChatToolDefinition[] =
	Object.freeze<ChatToolDefinition[]>([
		TURN_CONTRACT_TOOL_DEFINITION,
		DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
		REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
		CANCEL_TURN_CONTRACT_TOOL_DEFINITION
	]);
