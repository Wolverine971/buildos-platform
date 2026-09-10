// packages/agentic-chat-runtime/src/catalog/definitions/controls.ts
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
								description:
									'Optional stable identifier for this outcome. Separate from the entity reference in label.'
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
								maxLength: 240,
								description:
									'Brief scope only. Never copy exact text here; refer to original user wording and preservation requirements.'
							},
							target_ids: {
								type: 'array',
								maxItems: 50,
								items: { type: 'string' },
								description:
									'Distinct canonical IDs eligible for this outcome. List each ID exactly once; never pad the array. Omit for creates and until targets are discovered; minimum_successful_effects is bounded by this list.'
							},
							required_fields: {
								type: 'array',
								maxItems: 30,
								items: { type: 'string' },
								description:
									'Nonempty changed fields for updates: ["content"] for text, ["due_at"] for reschedules; parent_id/position for tree moves. Never project_id (scope, not a field).'
							},
							changes: {
								type: 'array',
								maxItems: 20,
								items: {
									type: 'object',
									properties: {
										field: { type: 'string', maxLength: 80 },
										value: {
											type: 'string',
											maxLength: 160,
											description:
												'Short scalar value only: a title, name, date, id, priority, or state. Never prose.'
										}
									},
									required: ['field', 'value']
								},
								description:
									'Short scalar field/value pairs applied to every target (title, due_at, priority, state_key, parent_id). Prose fields are never declared here: for document content, descriptions, or bodies list the field in required_fields and supply the exact text to the write tool at execution. Targets receiving different values require separate outcomes.'
							},
							minimum_successful_effects: {
								type: 'integer',
								minimum: 1,
								maximum: 100,
								description:
									'Distinct targets that must change. Multiple fields on one target count once; never exceed target_ids.length.'
							},
							label: {
								type: ['string', 'null'],
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Create only: name for one new entity (minimum_successful_effects=1) that a later outcome references. Declare its title in changes so it can be matched — except on a project outcome, whose changes must stay empty.'
							},
							src_label: {
								type: ['string', 'null'],
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Link only: label of the source created in this contract.'
							},
							dst_label: {
								type: ['string', 'null'],
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Link only: label of the destination created in this contract.'
							},
							parent_label: {
								type: ['string', 'null'],
								maxLength: 40,
								pattern: '^[a-z0-9][a-z0-9_-]{0,39}$',
								description:
									'Move/organize only: label of the parent created in this contract.'
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
			'Cancel an unfinished turn contract when the user cancels or supersedes it, or when a read this turn shows every declared outcome is already true, so no write is needed. Cancelling is how a correct "nothing to change" turn ends; leaving the contract open reports it as an unfinished write. This is control only; never cancel because a write failed, was rejected, or looks hard.',
		parameters: {
			type: 'object',
			properties: {
				reason: {
					type: 'string',
					maxLength: 240,
					description:
						'How the current message cancelled or superseded it, or which read showed the outcomes were already satisfied.'
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
				},
				candidates: {
					type: 'array',
					minItems: 2,
					maxItems: 20,
					description:
						'Every known plausible target or value for the unresolved choice. Include this when loaded context identifies a finite candidate set; the labels are shown to the user as a list beneath the question, so the question need not repeat them.',
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							id: {
								type: 'string',
								maxLength: 160,
								description:
									'Stable entity ID when this is an existing durable target.'
							},
							label: {
								type: 'string',
								maxLength: 200,
								description: 'Human-readable choice shown to the user.'
							},
							kind: {
								type: 'string',
								maxLength: 40,
								description:
									'Optional entity or value kind, such as task, document, or date.'
							}
						},
						required: ['label']
					}
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
