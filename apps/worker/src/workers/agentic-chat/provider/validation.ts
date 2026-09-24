// apps/worker/src/workers/agentic-chat/provider/validation.ts
import { createHash } from 'node:crypto';
import type { ChatToolDefinition, JsonObject, JsonValue } from '@buildos/shared-types';
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { DECLARE_TURN_CONTRACT_TOOL_NAME } from '@buildos/agentic-chat-runtime/catalog';
import {
	type LoadedTaskSchedule,
	type ToolValidationIssue,
	type TurnContract,
	type TurnContractOutcome,
	getSafeWriteToolNamesForTurnContract,
	parseDeclaredTurnContract,
	titleKey,
	turnContractCreatesProject,
	validateToolCalls
} from '@buildos/agentic-chat-runtime/loop';
import { reviewedAgenticChatMutationSpecV1 } from '../mutations/tool-catalog';
import { validateContractEffectFields } from './contract-fields';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from './contracts';
import { completedProviderCallToChatToolCall } from './feedback';
import { providerError } from './protocol';
import type { CompletedProviderToolCall } from './stream-tool-calls';

const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function contractSha256(contract: TurnContract): string {
	return createHash('sha256')
		.update(canonicalizeAgenticChatJson(contract as unknown as JsonValue), 'utf8')
		.digest('hex');
}

export function validateCompletedProviderCalls(
	calls: readonly CompletedProviderToolCall[],
	request: AgenticChatTurnProviderRequestV1,
	admittedTools: readonly AgenticChatTurnProviderToolV1[] = request.tools,
	/** Scheduling values this turn's reads loaded; a reschedule that repeats one is a no-op. */
	loadedTaskSchedules?: ReadonlyMap<string, LoadedTaskSchedule>
): ToolValidationIssue[] {
	const issues = validateToolCalls(
		calls.map(completedProviderCallToChatToolCall),
		Array.from(request.tools) as unknown as ChatToolDefinition[],
		{
			projectId:
				typeof request.projectId === 'string' &&
				CANONICAL_UUID_PATTERN.test(request.projectId)
					? request.projectId
					: null,
			...(loadedTaskSchedules && loadedTaskSchedules.size > 0 ? { loadedTaskSchedules } : {})
		}
	);
	validateProjectCreateShellContracts(calls, request, admittedTools, issues);
	validateExactDocumentLiterals(calls, request, issues);
	// Hosted ontology ids are canonical UUIDs. A contract target typo previously
	// survived semantic parsing, then made the candidate gate ask the user which
	// member of an explicitly exhaustive set they meant. On a canonical
	// project-scoped turn, return that model-authored typo through the existing
	// bounded validation-repair loop before semantic review instead.
	const requiresCanonicalTargets =
		typeof request.projectId === 'string' && CANONICAL_UUID_PATTERN.test(request.projectId);
	for (const call of calls) {
		if (call.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) continue;
		const contract = parseDeclaredTurnContract(call.arguments);
		if (!contract) continue;
		const errors = validateContractEffectFields(contract, admittedTools);
		if (requiresCanonicalTargets) {
			errors.push(
				...contract.outcomes.flatMap((outcome, index) =>
					outcome.targetIds
						.filter((targetId) => !CANONICAL_UUID_PATTERN.test(targetId))
						.map(
							(targetId) =>
								`Invalid turn contract: Outcome ${index + 1}: target_ids entry ${JSON.stringify(targetId)} must be a canonical UUID copied exactly from loaded context.`
						)
				)
			);
		}
		addCallValidationErrors(issues, call, errors);
	}
	return issues;
}

const HTML_ENTITY_LITERAL_PAIRS = [
	['&amp;', '&'],
	['&lt;', '<'],
	['&gt;', '>'],
	['&quot;', '"'],
	['&#34;', '"'],
	['&#39;', "'"],
	['&apos;', "'"]
] as const;

/**
 * Reject a model-authored HTML encoding when the user's literal document body
 * proves the intended characters. This never decodes or rewrites a mutation:
 * the existing bounded validation loop asks the acting model to propose the
 * exact content again before semantic review or persistence.
 */
function validateExactDocumentLiterals(
	calls: readonly CompletedProviderToolCall[],
	request: AgenticChatTurnProviderRequestV1,
	issues: ToolValidationIssue[]
): void {
	const userText = latestUserText(request);
	if (!userText) return;
	for (const call of calls) {
		if (!['create_onto_document', 'update_onto_document'].includes(call.name)) continue;
		const transformed = new Map<string, string>();
		for (const content of authoredDocumentTexts(call.arguments)) {
			collectHtmlEncodedLiterals(content, userText, transformed);
		}
		const errors = Array.from(
			transformed,
			([entity, literal]) =>
				`Document content must preserve the user's exact literal text. Do not HTML-encode ${JSON.stringify(literal)} as ${JSON.stringify(entity)}; copy the original content byte-for-byte.`
		);
		addCallValidationErrors(issues, call, errors);
	}
}

/** Body text the model authored: whole content, edit replacements, and section content. */
function authoredDocumentTexts(args: Record<string, unknown>): string[] {
	const texts: string[] = [];
	if (typeof args.content === 'string') texts.push(args.content);
	for (const edit of Array.isArray(args.edits) ? args.edits : []) {
		if (typeof edit?.new_text === 'string') texts.push(edit.new_text);
	}
	for (const edit of Array.isArray(args.section_edits) ? args.section_edits : []) {
		if (typeof edit?.content === 'string') texts.push(edit.content);
	}
	return texts;
}

function collectHtmlEncodedLiterals(
	content: string,
	userText: string,
	transformed: Map<string, string>
): void {
	if (content.length === 0 || userText.includes(content)) return;
	const fullyDecoded = HTML_ENTITY_LITERAL_PAIRS.reduce(
		(value, [entity, literal]) => value.split(entity).join(literal),
		content
	);
	if (fullyDecoded !== content && userText.includes(fullyDecoded)) {
		for (const [entity, literal] of HTML_ENTITY_LITERAL_PAIRS) {
			if (content.includes(entity)) transformed.set(entity, literal);
		}
	} else {
		for (const [entity, literal] of HTML_ENTITY_LITERAL_PAIRS) {
			let offset = content.indexOf(entity);
			while (offset >= 0) {
				const oneLiteral =
					content.slice(0, offset) + literal + content.slice(offset + entity.length);
				if (userText.includes(oneLiteral)) {
					transformed.set(entity, literal);
					break;
				}
				offset = content.indexOf(entity, offset + entity.length);
			}
		}
	}
}

function latestUserText(request: AgenticChatTurnProviderRequestV1): string | null {
	for (let index = request.messages.length - 1; index >= 0; index -= 1) {
		const message = request.messages[index];
		if (message?.role !== 'user') continue;
		if (typeof message.content === 'string') return message.content;
		return message.content
			.filter((part) => part.type === 'text')
			.map((part) => part.text)
			.join('\n');
	}
	return null;
}

function addCallValidationErrors(
	issues: ToolValidationIssue[],
	call: CompletedProviderToolCall,
	errors: string[]
): void {
	if (errors.length === 0) return;
	const existing = issues.find((issue) => issue.toolCall.id === call.id);
	if (existing) {
		existing.errors.push(...errors);
	} else {
		issues.push({
			toolCall: completedProviderCallToChatToolCall(call),
			toolName: call.name,
			errors
		});
	}
}

/**
 * Which record kinds each admitted creation tool can produce after the project
 * shell exists. A contract that promises a kind with no creation tool on the
 * surface is rejected deterministically instead of burning reviewer rounds.
 */
const CREATE_TOOL_ENTITY_KINDS: ReadonlyArray<[string, TurnContractOutcome['entityKind']]> = [
	['create_onto_goal', 'goal'],
	['create_onto_task', 'task'],
	['create_onto_document', 'document'],
	['create_onto_plan', 'plan'],
	['create_onto_milestone', 'milestone'],
	['create_onto_risk', 'risk'],
	['create_calendar_event', 'event'],
	['link_onto_entities', 'relationship']
];

function validateProjectCreateShellContracts(
	calls: readonly CompletedProviderToolCall[],
	request: AgenticChatTurnProviderRequestV1,
	admittedTools: readonly AgenticChatTurnProviderToolV1[],
	issues: ToolValidationIssue[]
): void {
	const mutationNames = new Set(
		admittedTools
			.filter((tool) => reviewedAgenticChatMutationSpecV1(tool.function.name))
			.map((tool) => tool.function.name)
	);
	if (!mutationNames.has('create_onto_project')) return;
	const shellOnly = mutationNames.size === 1;
	const supportedEntityKinds = new Set<TurnContractOutcome['entityKind']>(['project']);
	for (const [toolName, entityKind] of CREATE_TOOL_ENTITY_KINDS) {
		if (mutationNames.has(toolName)) supportedEntityKinds.add(entityKind);
	}

	for (const call of calls) {
		if (call.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) continue;
		const contract = parseDeclaredTurnContract(call.arguments);
		if (!contract) continue;
		// On Project Setup every contract is a project contract. On any other
		// surface that mounts create_onto_project (global since 2026-09-04) the
		// shell rules apply only to a contract that actually creates a project.
		if (request.contextType !== 'project_create' && !turnContractCreatesProject(contract)) {
			continue;
		}
		const errors: string[] = [];
		const projectOutcomes = contract.outcomes.filter(
			(outcome) => outcome.entityKind === 'project'
		);
		if (shellOnly && contract.outcomes.length !== 1) {
			errors.push(
				'Invalid turn contract: This turn can execute only one project outcome. Additional records require their named creation tools after create_onto_project succeeds.'
			);
		}
		const unsupportedKinds = Array.from(
			new Set(
				contract.outcomes
					.map((outcome) => outcome.entityKind)
					.filter((entityKind) => !supportedEntityKinds.has(entityKind))
			)
		);
		if (unsupportedKinds.length > 0) {
			errors.push(
				`Invalid turn contract: No available creation tool can create these requested record types: ${unsupportedKinds.join(', ')}.`
			);
		}
		if (projectOutcomes.length !== 1) {
			errors.push(
				'Invalid turn contract: Project creation requires exactly one outcome with entity_kind=project.'
			);
		} else {
			const outcome = projectOutcomes[0]!;
			if (
				outcome.action !== 'create' ||
				outcome.entityKind !== 'project' ||
				outcome.minimumSuccessfulEffects !== 1 ||
				outcome.targetIds.length > 0
			) {
				errors.push(
					'Invalid turn contract: The project outcome must use action=create, entity_kind=project, minimum_successful_effects=1, and no target_ids.'
				);
			}
			if (outcome.requiredFields.length > 0 || (outcome.changes?.length ?? 0) > 0) {
				errors.push(
					'Invalid turn contract: The project outcome must omit required_fields and changes because the create_onto_project arguments carry the project values. Its label is kept without a title change, so child outcomes can still reference it with parent_label.'
				);
			}
		}
		addCallValidationErrors(issues, call, errors);
	}
}

/**
 * This deterministic layer proves only identity and coarse outcome scope. It
 * deliberately does not compare required_fields with tool argument strings:
 * required_fields are postcondition evidence, while concrete tool arguments
 * are adjudicated by the contract reviewer before execution.
 */
export function validateApprovedTurnContractMutations(
	calls: readonly CompletedProviderToolCall[],
	contract: TurnContract | null,
	approvedContractSha256: string | null,
	labelBindings: ReadonlyMap<string, string> = new Map()
): ToolValidationIssue[] {
	const mutationCalls = calls.filter((call) => reviewedAgenticChatMutationSpecV1(call.name));
	if (mutationCalls.length === 0) return [];
	const approvalMatches = Boolean(
		contract && approvedContractSha256 && contractSha256(contract) === approvedContractSha256
	);
	return mutationCalls.flatMap((call): ToolValidationIssue[] => {
		const spec = reviewedAgenticChatMutationSpecV1(call.name);
		const verdicts = approvalMatches
			? (contract?.outcomes.map((outcome) =>
					turnContractOutcomeAuthorizesCall(contract, outcome, call, labelBindings)
				) ?? [])
			: [];
		if (verdicts.some((verdict) => verdict.kind === 'authorized')) return [];
		const unbound = verdicts.find(
			(verdict): verdict is { kind: 'unbound_label'; label: string } =>
				verdict.kind === 'unbound_label'
		);
		const errors = unbound
			? [
					`Mutation ${call.name} references the contract entity labelled "${unbound.label}", which has not been created yet, so its id cannot be bound. ` +
						'Propose its create call first; propose dependent moves or links after the successful create receipt returns, using the created id.'
				]
			: [
					`Mutation ${call.name} is outside the independently approved turn contract. ` +
						'Do not execute it; either finish from the approved effects or declare a new exact contract for independent review.'
				];
		return [
			{
				toolCall: completedProviderCallToChatToolCall(call),
				toolName: call.name,
				...(spec?.operationName ? { op: spec.operationName } : {}),
				errors
			}
		];
	});
}

type ContractAuthorizationVerdict =
	| { kind: 'authorized' }
	| { kind: 'rejected' }
	| { kind: 'unbound_label'; label: string };

function turnContractOutcomeAuthorizesCall(
	contract: TurnContract,
	outcome: TurnContractOutcome,
	call: CompletedProviderToolCall,
	labelBindings: ReadonlyMap<string, string>
): ContractAuthorizationVerdict {
	const singleOutcomeContract: TurnContract = {
		version: 1,
		source: 'declared',
		outcomes: [outcome]
	};
	if (!getSafeWriteToolNamesForTurnContract(singleOutcomeContract).includes(call.name)) {
		return { kind: 'rejected' };
	}

	const targetIds = contractTargetIdsForCall(outcome, call.arguments);
	if (outcome.srcLabel || outcome.dstLabel) {
		for (const [endpoint, label] of [
			['src', outcome.srcLabel],
			['dst', outcome.dstLabel]
		] as const) {
			if (!label) continue;
			const bound = labelBindings.get(label);
			if (!bound) return { kind: 'unbound_label', label };
			const owner = contract.outcomes.find((candidate) => candidate.label === label);
			if (
				call.arguments[`${endpoint}_id`] !== bound ||
				call.arguments[`${endpoint}_kind`] !== owner?.entityKind
			)
				return { kind: 'rejected' };
		}
		for (const change of outcome.changes ?? []) {
			if (
				['rel', 'src_id', 'dst_id', 'src_kind', 'dst_kind'].includes(change.field) &&
				call.arguments[change.field] !== change.value
			)
				return { kind: 'rejected' };
		}
	}
	// A create call cannot carry the id of the entity that does not exist yet.
	// This also permits the folder-creation step of an approved `organize`
	// outcome; the exact project, title, and content remain protected by the
	// independently reviewed SHA-bound mutation batch.
	const createsEntity = call.name.startsWith('create_');
	if (
		!createsEntity &&
		outcome.targetIds.length > 0 &&
		(targetIds.length === 0 ||
			targetIds.some((targetId) => !outcome.targetIds.includes(targetId)))
	) {
		return { kind: 'rejected' };
	}

	// A symbolic destination is satisfied by the bound created id, or by the
	// exact declared title on the one-phase parent-by-title path.
	if (outcome.parentLabel && !createsEntity) {
		const owner = contract.outcomes.find(
			(candidate) => candidate.label === outcome.parentLabel && candidate.action === 'create'
		);
		const declaredTitle = owner?.changes?.find((change) => change.field === 'title')?.value;
		const requestedTitle = call.arguments.new_parent_title;
		if (
			typeof requestedTitle === 'string' &&
			declaredTitle &&
			titleKey(requestedTitle) === titleKey(declaredTitle)
		) {
			return { kind: 'authorized' };
		}
		const bound = labelBindings.get(outcome.parentLabel);
		if (!bound) return { kind: 'unbound_label', label: outcome.parentLabel };
		return call.arguments.new_parent_id === bound
			? { kind: 'authorized' }
			: { kind: 'rejected' };
	}

	return outcomeActionAuthorizesCall(outcome, call)
		? { kind: 'authorized' }
		: { kind: 'rejected' };
}

function outcomeActionAuthorizesCall(
	outcome: TurnContractOutcome,
	call: CompletedProviderToolCall
): boolean {
	if (outcome.action === 'complete') {
		const stateKey = call.arguments.state_key;
		return stateKey === 'done' || stateKey === 'completed';
	}
	if (outcome.action === 'assign') {
		return (
			Object.hasOwn(call.arguments, 'assignee_actor_ids') ||
			Object.hasOwn(call.arguments, 'assignee_handles')
		);
	}
	if (outcome.action === 'archive') {
		const stateKey = call.arguments.state_key;
		return stateKey === 'archived' || stateKey === 'cancelled';
	}
	if (outcome.action === 'restore') {
		const stateKey = call.arguments.state_key;
		return typeof stateKey === 'string' && stateKey !== 'archived' && stateKey !== 'cancelled';
	}
	return true;
}

function contractTargetIdsForCall(
	outcome: TurnContractOutcome,
	argumentsValue: JsonObject
): string[] {
	const keys =
		outcome.entityKind === 'relationship'
			? ['src_id', 'dst_id', 'edge_id']
			: outcome.entityKind === 'calendar'
				? ['project_id']
				: [`${outcome.entityKind}_id`];
	return keys
		.map((key) => argumentsValue[key])
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.map((value) => value.trim());
}

export function validationIssuesForCall(
	call: CompletedProviderToolCall,
	issues: readonly ToolValidationIssue[]
): ToolValidationIssue[] {
	return issues.filter((issue) => issue.toolCall.id === call.id);
}

export function callsWithValidationIssues(
	calls: readonly CompletedProviderToolCall[],
	issues: readonly ToolValidationIssue[]
): CompletedProviderToolCall[] {
	const invalidIds = new Set(issues.map((issue) => issue.toolCall.id));
	const invalidCalls = calls.filter((call) => invalidIds.has(call.id));
	if (invalidCalls.length === 0 || invalidCalls.length !== invalidIds.size) {
		throw providerError('provider_tool_validation_issue_identity_mismatch', 'permanent');
	}
	return invalidCalls;
}

export function validationFailureError(issues: readonly ToolValidationIssue[]): string {
	return `Tool validation failed: ${issues.flatMap((issue) => issue.errors).join(' ')}`;
}
