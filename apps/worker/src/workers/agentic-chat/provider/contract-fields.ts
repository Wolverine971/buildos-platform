// apps/worker/src/workers/agentic-chat/provider/contract-fields.ts
import {
	type TurnContract,
	type TurnContractOutcome,
	getSafeWriteToolNamesForTurnContract,
	getWriteLedgerChangedFields
} from '@buildos/agentic-chat-runtime/loop';
import { reviewedAgenticChatMutationSpecV1 } from '../mutationToolCatalog';
import type { AgenticChatTurnProviderToolV1 } from './contracts';

/**
 * Ground document and project-child create postconditions in admitted schemas
 * and ledger fields. Routing IDs and invented prose fields cannot prove a
 * changed-field postcondition, even after a successful write.
 * Capability admission and semantic review still enforce action and scope.
 */
export function validateContractEffectFields(
	contract: TurnContract,
	availableTools: readonly AgenticChatTurnProviderToolV1[]
): string[] {
	return contract.outcomes.flatMap((outcome, index) => {
		const fields = outcomeFields(contract, outcome, availableTools);
		if (!fields) return [];
		// A document update with no postconditions cannot say what must change.
		// Return this mechanical omission to the actor's bounded repair before
		// paying for semantic review. Do not infer content: a rename is valid too.
		if (
			outcome.entityKind === 'document' &&
			outcome.action === 'update' &&
			outcome.requiredFields.length === 0
		) {
			return [
				`Invalid turn contract: Outcome ${index + 1}: document update must name the changed fields in required_fields or scalar changes. For a text edit use required_fields=["content"]; for a rename use a title change. Keep exact text and preservation requirements in the original user request, not in the short description.`
			];
		}
		return outcome.requiredFields
			.filter((field) => !fields.has(field))
			.map(
				(field) =>
					`Invalid turn contract: Outcome ${index + 1}: ${outcome.entityKind} ${outcome.action} cannot produce required field ${JSON.stringify(field.slice(0, 160))}. Supported effect fields: ${[...fields].sort().join(', ') || 'none for this action'}. ` +
					(outcome.entityKind === 'document'
						? 'Put section-level requirements in description and use content for document text.'
						: 'Project membership is execution scope; omit project_id from required_fields and changes. Use the listed persisted fields for postconditions.')
			);
	});
}

export function describeContractEffectFields(
	contract: TurnContract,
	availableTools: readonly AgenticChatTurnProviderToolV1[]
): string | null {
	const lines = contract.outcomes.flatMap((outcome, index) => {
		const fields = outcomeFields(contract, outcome, availableTools);
		return fields
			? [
					`- Outcome ${index + 1} (${outcome.action} ${outcome.entityKind}): ${[...fields].sort().join(', ') || 'none for this action'}`
				]
			: [];
	});
	return lines.length > 0
		? `Effect fields available from this turn's tools (use these in required_fields and changes):\n${lines.join('\n')}`
		: null;
}

function outcomeFields(
	contract: TurnContract,
	outcome: TurnContractOutcome,
	availableTools: readonly AgenticChatTurnProviderToolV1[]
): Set<string> | null {
	if (
		outcome.entityKind !== 'document' &&
		outcome.entityKind !== 'task' &&
		!(outcome.action === 'create' && outcome.entityKind === 'goal')
	)
		return null;
	const relevantNames = new Set(
		getSafeWriteToolNamesForTurnContract({ ...contract, outcomes: [outcome] })
	);
	const fields = new Set<string>();
	let hasSchema = false;
	for (const tool of availableTools) {
		if (!relevantNames.has(tool.function.name)) continue;
		const spec = reviewedAgenticChatMutationSpecV1(tool.function.name);
		const properties = tool.function.parameters.properties;
		if (!spec || !properties || typeof properties !== 'object' || Array.isArray(properties)) {
			continue;
		}
		hasSchema = true;
		// Recovery may create a grouping parent, but organization fulfillment
		// requires a move of the target. A helper create cannot supply its fields,
		// even when it is the only admitted recovery tool.
		if (outcome.action === 'organize' && tool.function.name === 'create_onto_document') {
			continue;
		}
		const args: Record<string, unknown> = Object.fromEntries(
			spec.reviewedArgumentNames
				.filter((name) => Object.hasOwn(properties, name))
				.map((name) => [name, null])
		);
		const propsSchema = (properties as Record<string, { properties?: Record<string, unknown> }>)
			.props;
		if (propsSchema?.properties?.duration_minutes && Object.hasOwn(args, 'props')) {
			args.props = { duration_minutes: null };
		}
		for (const field of getWriteLedgerChangedFields(tool.function.name, args))
			fields.add(field);
	}
	// A missing capability is handled by admission; do not guess its schema.
	return hasSchema ? fields : null;
}
