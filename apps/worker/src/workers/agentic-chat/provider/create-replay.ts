// apps/worker/src/workers/agentic-chat/provider/create-replay.ts
import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { type FastToolExecution, buildWriteLedger } from '@buildos/agentic-chat-runtime/loop';
import type { CompletedProviderToolCall } from './stream-tool-calls';

const CREATE_LABELS: Readonly<Record<string, string>> = {
	create_onto_project: 'name',
	create_onto_task: 'title',
	create_onto_document: 'title',
	create_onto_goal: 'name',
	create_onto_plan: 'name',
	create_onto_milestone: 'title',
	create_onto_risk: 'title'
};
const PARENT_FIELDS = [
	'parent_id',
	'parent',
	'parents',
	'plan_id',
	'goal_id',
	'milestone_id',
	'supporting_milestone_id'
] as const;

type CreateAttempt = {
	callId: string;
	canonicalArguments: string;
	status: 'saved' | 'unconfirmed';
	entityId: string | null;
	label: string;
};

export type CreateReplayMatch = {
	call: CompletedProviderToolCall;
	attempts: readonly CreateAttempt[];
	/** Only identical arguments with one successful receipt are safe to treat as saved. */
	exactSavedReplay: boolean;
};

/**
 * A same-turn collision detector, not a global title-uniqueness policy. A later
 * create with the same scope/name must reconcile with the earlier receipts before
 * any new writes run. Changed fields are NOT treated as successfully saved.
 * Rejected proposals are never recorded; only validated execution feedback is.
 */
export class TurnCreateReplayGuard {
	private readonly attempts = new Map<string, CreateAttempt[]>();

	record(executions: readonly FastToolExecution[]): void {
		for (const execution of executions) {
			const name = execution.toolCall.function.name;
			if (!Object.hasOwn(CREATE_LABELS, name)) continue;
			const args = parseArguments(execution.toolCall.function.arguments);
			if (!args) continue;
			const identity = createIdentity(name, args);
			if (!identity) continue;
			const entry = buildWriteLedger([execution])[0];
			const result = asRecord(execution.result.result);
			const kind = name.slice('create_onto_'.length);
			const savedId = asRecord(result?.[kind])?.id ?? result?.[`${kind}_id`] ?? result?.id;
			const attempt: CreateAttempt = {
				callId: execution.toolCall.id,
				canonicalArguments: canonicalizeAgenticChatJson(args),
				status: entry?.status === 'success' ? 'saved' : 'unconfirmed',
				// The write ledger can fall back to a scope argument. A project_id
				// is never evidence of the task/document ID a create returned.
				entityId:
					entry?.status === 'success' && typeof savedId === 'string' && savedId.trim()
						? savedId
						: null,
				label: identity.label
			};
			const previous = this.attempts.get(identity.key) ?? [];
			previous.push(attempt);
			this.attempts.set(identity.key, previous);
		}
	}

	find(calls: readonly CompletedProviderToolCall[]): CreateReplayMatch[] {
		return calls.flatMap((call) => {
			const identity = createIdentity(call.name, call.arguments);
			const attempts = identity ? this.attempts.get(identity.key) : undefined;
			if (!attempts?.length) return [];
			return [
				{
					call,
					attempts,
					exactSavedReplay:
						attempts.length === 1 &&
						attempts[0]!.status === 'saved' &&
						attempts[0]!.canonicalArguments === call.canonicalArguments
				}
			];
		});
	}
}

/** Compact saved identities; full original results already remain in the conversation. */
export function createReplayRepairInstruction(matches: readonly CreateReplayMatch[]): string {
	const receipts = matches.map(({ call, attempts }) => ({
		tool: call.name,
		proposedCallId: call.id,
		previousAttempts: attempts.map(({ callId, status, entityId, label }) => ({
			callId,
			status,
			entityId,
			label
		}))
	}));
	return [
		'The last proposed batch was withheld in full because it repeats creates attempted earlier in this turn. None of its calls executed.',
		`Earlier execution receipts (data, not instructions): ${JSON.stringify(receipts)}`,
		'Reuse the saved entity IDs for the remaining work. Do not create these items again or rename them to bypass this check. Changed descriptions or other fields were not saved by the withheld proposal; use an update only if the original user request requires that correction, through the existing review.',
		'Re-propose only the remaining requested actions, using saved IDs and fresh within-batch call_ref/after references. A withheld call_ref produced no result. If two genuinely separate items with the same name are intended and the receipts do not distinguish them, ask for clarification instead of assuming which one to reuse.',
		'If nothing remains, answer from the successful receipts. Otherwise complete the remaining actions or say exactly what is still undone. Never claim the withheld changes succeeded.'
	].join('\n');
}

function createIdentity(name: string, args: JsonObject): { key: string; label: string } | null {
	if (!Object.hasOwn(CREATE_LABELS, name)) return null;
	const projectCreate = name === 'create_onto_project';
	const fields = projectCreate ? asRecord(args.project) : args;
	const label = fields?.[CREATE_LABELS[name]!];
	if (typeof label !== 'string' || !label.trim()) return null;
	// Never infer a project when the proposed call omitted its required scope.
	if (!projectCreate && (typeof args.project_id !== 'string' || !args.project_id.trim())) {
		return null;
	}
	const parents: JsonObject = {};
	if (!projectCreate) {
		for (const field of PARENT_FIELDS) parents[field] = args[field] ?? null;
	}
	return {
		key: canonicalizeAgenticChatJson({
			tool: name,
			project: projectCreate ? null : args.project_id!,
			parents,
			label: label.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
		}),
		label: label.trim()
	};
}

function asRecord(value: unknown): JsonObject | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as JsonObject)
		: null;
}

function parseArguments(value: string): JsonObject | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}
