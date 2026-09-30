// apps/worker/src/workers/agentic-chat/turn/failed-partial-receipt.ts
import {
	buildWriteLedger,
	type AgenticChatCompletionReceiptV1,
	type FastToolExecution
} from '@buildos/agentic-chat-runtime/loop';
import { isValidUUID, type JsonObject } from '@buildos/shared-types';

/** Matches the server-only SQL predicate; raw failed model prefixes never qualify. */
export function isFailedPartialReceipt(input: {
	status: string;
	failureCode: string | null;
	assistantText: string;
	assistantMetadata: JsonObject;
}): boolean {
	const metadata = input.assistantMetadata;
	const receipt = metadata.completion_receipt as AgenticChatCompletionReceiptV1 | undefined;
	return (
		input.status === 'failed' &&
		input.failureCode === 'uncertain_external_commit' &&
		input.assistantText.length > 0 &&
		metadata.completion_status === 'failed' &&
		metadata.answer_source === 'harness' &&
		metadata.failure_disclosure_version === 1 &&
		receipt?.version === 1 &&
		receipt.request?.disposition === 'request_uncertain' &&
		((Array.isArray(receipt.unreviewedWriteCallIds) &&
			receipt.unreviewedWriteCallIds.length > 0) ||
			(Array.isArray(receipt.stages) &&
				receipt.stages.some(
					(s) => s && Array.isArray(s.executedCallIds) && s.executedCallIds.length > 0
				)))
	);
}

/** Only saved receipt facts and explicit uncertain attempts, without provider prose. */
export function buildFailedPartialText(executions: FastToolExecution[]): string | null {
	const writes = buildWriteLedger(executions);
	const saved = writes.filter((w) => w.status === 'success');
	if (!saved.length) return null;
	const describe = (w: (typeof writes)[number]) =>
		`${w.action ?? 'change'} ${w.entityKind ?? 'entity'}: ${w.title ?? w.entityId ?? w.effectId ?? w.toolName}`;
	const uncertain = writes.filter((w) => w.uncertain);
	return [
		'I could not finish the full request in this turn.',
		`Saved changes (${saved.length}):\n${saved.map((w) => `- ${describe(w)}`).join('\n')}`,
		uncertain.length
			? `Uncertain changes:\n${uncertain.map((w) => `- ${describe(w)}`).join('\n')}`
			: 'At least one attempted change has an uncertain outcome.',
		'Saved changes are retained. Reconcile the uncertain attempts before retrying them; the remaining requested work is unfinished.'
	].join('\n\n');
}

/** Canonical effect identities for reconciliation, kept separate from saved receipts. */
export function collectUncertainEffects(executions: FastToolExecution[]): JsonObject[] {
	return executions.flatMap(({ toolCall, result }) => {
		const evidence = result.result;
		if (
			result.success ||
			evidence?.effect_outcome !== 'uncertain' ||
			typeof evidence.effect_id !== 'string' ||
			!isValidUUID(evidence.effect_id)
		)
			return [];
		return [
			{
				effect_id: evidence.effect_id,
				provider_tool_call_id: toolCall.id,
				tool_name: toolCall.function.name,
				failure_code: evidence.failure_code ?? null
			}
		];
	});
}
