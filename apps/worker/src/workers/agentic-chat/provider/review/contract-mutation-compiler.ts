import { createHash } from 'node:crypto';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import type { CompletedProviderToolCall } from '../stream-tool-calls';

const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC_3339_TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const COMPILED_TASK_SCHEDULE_FIELDS = new Set(['due_at', 'start_at']);

/**
 * Compile the one mutation shape whose concrete arguments are already fully
 * represented by an independently approved contract. This deliberately does
 * not generalize to free text, enums, arrays, creates, multiple targets, or
 * values that require model judgment. The exact resulting batch still goes
 * through the normal mutation reviewer and execution fences.
 */
export function compileApprovedSingleTaskScheduleMutation(
	contract: TurnContract
): CompletedProviderToolCall | null {
	if (contract.outcomes.length !== 1) return null;
	const outcome = contract.outcomes[0]!;
	if (
		outcome.action !== 'update' ||
		outcome.entityKind !== 'task' ||
		outcome.targetIds.length !== 1 ||
		outcome.minimumSuccessfulEffects !== 1 ||
		outcome.label !== undefined ||
		outcome.parentLabel !== undefined
	) {
		return null;
	}
	const taskId = outcome.targetIds[0]!;
	if (!CANONICAL_UUID_PATTERN.test(taskId)) return null;

	const changes = outcome.changes;
	if (!changes || changes.length === 0 || changes.length > COMPILED_TASK_SCHEDULE_FIELDS.size) {
		return null;
	}
	const changedFields = new Set<string>();
	const mutationArguments: JsonObject = { task_id: taskId };
	for (const change of changes) {
		if (
			!COMPILED_TASK_SCHEDULE_FIELDS.has(change.field) ||
			changedFields.has(change.field) ||
			!isValidRfc3339Timestamp(change.value)
		) {
			return null;
		}
		changedFields.add(change.field);
		mutationArguments[change.field] = change.value;
	}
	if (
		outcome.requiredFields.length !== changedFields.size ||
		outcome.requiredFields.some((field) => !changedFields.has(field))
	) {
		return null;
	}

	const canonicalArguments = canonicalizeAgenticChatJson(
		mutationArguments as unknown as JsonValue
	);
	const callSha256 = createHash('sha256')
		.update(canonicalizeAgenticChatJson(contract as unknown as JsonValue), 'utf8')
		.update('\0', 'utf8')
		.update(canonicalArguments, 'utf8')
		.digest('hex');
	return {
		id: `contract-compiled-task-schedule:${callSha256}`,
		name: 'update_onto_task',
		arguments: JSON.parse(canonicalArguments) as JsonObject,
		canonicalArguments,
		canonicalProviderArguments: canonicalArguments
	};
}

/**
 * Convert one withheld existing-task schedule proposal into an untrusted typed
 * contract for independent review. The candidate itself never executes, and
 * approval of this contract still cannot bypass exact mutation-batch review.
 */
export function compileSingleTaskScheduleContractFromMutation(
	call: CompletedProviderToolCall
): TurnContract | null {
	if (call.name !== 'update_onto_task' || call.scheduling) return null;
	const argumentNames = Object.keys(call.arguments);
	if (
		argumentNames.length < 2 ||
		argumentNames.some((name) => name !== 'task_id' && !COMPILED_TASK_SCHEDULE_FIELDS.has(name))
	) {
		return null;
	}
	const taskId = call.arguments.task_id;
	if (typeof taskId !== 'string' || !CANONICAL_UUID_PATTERN.test(taskId)) return null;
	const changes = argumentNames
		.filter((name) => COMPILED_TASK_SCHEDULE_FIELDS.has(name))
		.sort()
		.map((field) => {
			const value = call.arguments[field];
			return typeof value === 'string' && isValidRfc3339Timestamp(value)
				? { field, value }
				: null;
		});
	if (changes.length === 0 || changes.some((change) => change === null)) return null;
	const exactChanges = changes as Array<{ field: string; value: string }>;
	return {
		version: 1,
		source: 'implicit',
		outcomes: [
			{
				id: 'outcome_1',
				action: 'update',
				entityKind: 'task',
				targetIds: [taskId],
				requiredFields: exactChanges.map((change) => change.field),
				changes: exactChanges,
				minimumSuccessfulEffects: 1
			}
		]
	};
}

function isValidRfc3339Timestamp(value: string): boolean {
	const match = RFC_3339_TIMESTAMP_PATTERN.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6]);
	const offsetHour = Number(match[8] ?? 0);
	const offsetMinute = Number(match[9] ?? 0);
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
		hour > 23 ||
		minute > 59 ||
		second > 59 ||
		offsetHour > 23 ||
		offsetMinute > 59
	) {
		return false;
	}
	return Number.isFinite(Date.parse(value));
}
