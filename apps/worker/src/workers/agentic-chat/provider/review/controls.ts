// apps/worker/src/workers/agentic-chat/provider/review/controls.ts
import type { JsonObject } from '@buildos/shared-types';
import { TURN_CONTRACT_TOOL_DEFINITION } from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatTurnProviderToolV1 } from '../contracts';
import {
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../../tools/execution-adapter';

/**
 * Reviewer-register commission guidance. Mounted only in the two reviewer
 * prompts (contract review, mutation-batch review) and the acting-side
 * semantic disposition gate; the per-pass actor routing message carries the
 * short ACTOR_COMMISSION_GUIDANCE instead (audit 2026-09-02, Finding 9).
 */
export const SEMANTIC_COMMISSION_GUIDANCE = Object.freeze([
	'When the user explicitly delegates judgment (for example, asks for a sensible organization), reasonable implementation choices within that commission are resolved; do not ask the user to make the delegated choice again.',
	'Past-tense reports that tracked work was completed commission the matching state change when exactly one loaded entity fits; conversational or dictated wording does not turn the report into a request for confirmation.',
	'Once that completion target is unique, missing optional metadata is not a required user choice: complete the state change, carry only user-supplied outcome or next-step text on the matched entity when supported, and omit an unstated date or other optional value instead of asking for it.',
	'Do not expand a completion report into a separate follow-up entity unless the user explicitly commissioned that creation or delegated how the follow-up should be recorded; declining that creation is never a reason to tell the user their stated next step will go unrecorded — carry it on the matched entity instead.',
	'A direct reschedule or priority instruction commissions that update when the target and requested value are uniquely resolved. An exact title is not required when one descriptive match remains after available reads.',
	'For a task reschedule phrased as moving or pushing the task, its due date, or its deadline, the durable field is due_at. Use start_at only when the user explicitly refers to the task start. In contracts and corrections, never use a generic date field.',
	'Several explicitly commissioned changes in one utterance belong to one contract; preserve every resolved clause instead of asking the user to reconfirm the batch.',
	'Delegated organization may include creating reasonable parent containers and moving existing items within the commissioned project, while preserving original content and avoiding unrelated edits.',
	"Once organization is delegated, the folder titles, which documents go under which folder, and their order are the agent's choices: a contract that names them is resolved, and a contract that leaves them to execution is also resolved. Never ask the user to choose or confirm folder titles or document placement.",
	'For document move/organize outcomes, parent_id and position in required_fields are postconditions the agent satisfies at execution by choosing or creating a parent (for example by title); they are never values the user must supply. A destination expressed as parent_label (a folder this contract creates) is bound by the system after the create executes and is not a missing value.',
	'A value that the field semantics of the product define — for example "top priority" meaning priority 1 — is resolved; never ask the user to confirm a value the schema already defines. This concerns values only; ambiguous targets still belong to the user.',
	"A required_fields entry without a declared change is a postcondition the agent satisfies at execution, not a missing value. Implementation defaults such as type_key, state_key, position, or a description or short heading for a new container are the agent's choice and are validated or defaulted by the tool at execution; never revise a contract or ask the user over them.",
	"When the user gives a day without a time, the entity's existing time of day carries over; that is a resolved value, not a missing one. Never ask what time to use.",
	'A priority, scheduling, or completion instruction commissions only that change. Do not add workflow-state transitions the user did not state (for example in_progress because something became top priority).'
]);

/**
 * Actor-register commission guidance: the five rules the acting model needs
 * on every project pass, in its own register. The reviewer keeps the full
 * SEMANTIC_COMMISSION_GUIDANCE; this must stay at most five lines.
 */
export const ACTOR_COMMISSION_GUIDANCE = Object.freeze([
	'Commission rules: a simple commissioned change calls the mutation tools directly; a complex one calls declare_turn_contract first with the complete outcome set.',
	'Ask for clarification only when the user still owns a genuine choice among loaded candidates; never guess among them, and never ask about a value the request, loaded context, or tool schema already resolves.',
	'A past-tense report that tracked work was completed commissions the matching state change when exactly one loaded entity fits: complete it, carry any user-stated outcome or next step on that entity instead of a new one, omit unstated optional values, and never tell the user a stated next step will go unrecorded.',
	'A priority, scheduling, or completion instruction commissions only that change; add no workflow-state transition the user did not state. A task push or reschedule changes due_at; use start_at only for an explicit task start.',
	'Once organization is delegated, container titles, item placement, and order are your choices; do not ask the user to choose or confirm them.'
]);

/**
 * Shared reviewer evidence shape for descriptive entity references. Contract
 * review uses this deterministic ambiguity floor on top of reviewer judgment.
 */
export const REFERENCE_CANDIDATES_PROPERTY = Object.freeze({
	type: 'array',
	maxItems: 20,
	description:
		'Enumerate before judging. One entry per descriptive reference in the current user message that points at an existing entity ("the email one", "the beta list thing", "the resume update"): list every loaded entity whose title or content plausibly fits those words, not only the entity the proposal chose. Use an empty array only when the request names no existing entity descriptively (pure creation or an explicit exhaustive set).',
	items: {
		type: 'object',
		additionalProperties: false,
		required: ['reference', 'candidates'],
		properties: {
			reference: {
				type: 'string',
				maxLength: 160,
				description: "The user's words for the entity."
			},
			candidates: {
				type: 'array',
				maxItems: 20,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['id', 'title'],
					properties: {
						id: { type: 'string' },
						title: { type: 'string', maxLength: 160 }
					}
				}
			}
		}
	}
});

/**
 * Approval tools are static on purpose: a per-review `const` SHA in the schema
 * changed the tools array on every call and defeated provider prefix caching
 * (0% cache over 350 reviewer calls). The SHA binding is enforced in code by
 * decision-completion.ts, which fails closed to an internal review fault on a mismatch.
 */
export const TURN_CONTRACT_REVIEW_APPROVAL_TOOL: AgenticChatTurnProviderToolV1 = Object.freeze({
	type: 'function',
	function: {
		name: APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
		description:
			'Approve the exact proposed turn contract only when the current user request and loaded evidence resolve every commissioned outcome, target, and required value without guessing. Enumerate reference_candidates before judging.',
		parameters: {
			type: 'object',
			additionalProperties: false,
			required: ['reason', 'contract_sha256', 'reference_candidates'],
			properties: {
				reason: {
					type: 'string',
					description:
						'Concise semantic evidence that the exact contract is safe to execute.'
				},
				contract_sha256: {
					type: 'string',
					description:
						'The exact SHA-256 quoted in this request. The harness rejects an approval whose value differs from it.'
				},
				reference_candidates: {
					...REFERENCE_CANDIDATES_PROPERTY
				}
			}
		}
	}
});

export const PROPOSAL_REVISION_TOOL: AgenticChatTurnProviderToolV1 = Object.freeze({
	type: 'function',
	function: {
		name: REQUEST_PROPOSAL_REVISION_TOOL_NAME,
		description:
			"Return the acting model's proposal for correction when the user's commission is clear but the proposal misstates it (wrong cardinality, targets needing different values lumped together, an uncommissioned outcome, an invented or omitted value the turn record resolves). This goes to the acting model, never the user. Do not use it when a choice genuinely belongs to the user.",
		parameters: {
			type: 'object',
			additionalProperties: false,
			required: ['reason', 'required_correction'],
			properties: {
				reason: {
					type: 'string',
					maxLength: 400,
					description: 'What is wrong with the proposal, citing the turn evidence.'
				},
				required_correction: {
					type: 'string',
					maxLength: 400,
					description:
						'The structural correction needed to match the user commission. For text edits, name the content postcondition and refer to the original user request for exact wording and preservation rules. Do not copy or abbreviate source text into this short field.'
				}
			}
		}
	}
});

export const CONTRACT_PROPOSAL_REVISION_TOOL: AgenticChatTurnProviderToolV1 = Object.freeze({
	...PROPOSAL_REVISION_TOOL,
	function: {
		...PROPOSAL_REVISION_TOOL.function,
		description:
			"Return the acting model's contract for an exact machine-readable correction when the user's commission is clear but the proposal misstates it. Enumerate reference_candidates before judging. Use due_at—not a generic date field—for a task due-date, deadline, or push/reschedule correction; use start_at only for an explicit task-start request. Set label only on a create outcome and parent_label only on move/organize; omit both everywhere else. The corrected contract is durably recorded and independently re-reviewed; it never reaches execution merely because this tool supplied it. Do not use this when a choice genuinely belongs to the user.",
		parameters: {
			...PROPOSAL_REVISION_TOOL.function.parameters,
			required: [
				'reason',
				'required_correction',
				'corrected_contract',
				'reference_candidates'
			],
			properties: {
				...(PROPOSAL_REVISION_TOOL.function.parameters.properties as JsonObject),
				reference_candidates: {
					...REFERENCE_CANDIDATES_PROPERTY
				},
				corrected_contract: {
					...(TURN_CONTRACT_TOOL_DEFINITION.function.parameters as unknown as JsonObject),
					description:
						'The complete corrected turn contract. It must contain only outcomes already commissioned and values resolved by the turn evidence.'
				}
			}
		}
	}
});
