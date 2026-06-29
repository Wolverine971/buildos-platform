// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts
import type {
	TurnDigest,
	TurnSupervisor,
	TurnSupervisorConfig,
	TurnSupervisorCreateParams,
	TurnSupervisorDecision,
	TurnSupervisorObservation,
	TurnSupervisorRisk
} from './types';
import { buildTurnStatusMessage } from './status-messages';
import {
	buildToolPatternKey,
	classifyToolError,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	summarizeToolArguments
} from './digest';
import {
	findEntityIndexEntry,
	normalizeEntityKind,
	normalizeTurnSupervisorEntityIndex,
	type TurnSupervisorEntityIndexEntry
} from './entity-index';
import {
	buildFailureKey as buildToolFailureKey,
	classifyToolFailure,
	parseInvalidArgumentFailure,
	parseRequiredParameterFailure
} from '../stream-orchestrator/tool-failure';

type RecentToolEntry = TurnDigest['recentTools'][number] & {
	toolCallId: string;
};

type FailedWriteRecord = {
	toolName: string;
	canonicalOp?: string | null;
	argsFingerprint: string;
	idArgs: Record<string, string>;
	errorClass?: string | null;
	resultSummary?: string | null;
	count: number;
};

const DEFAULT_CONFIG: Required<TurnSupervisorConfig> = {
	statusSilenceMs: 10_000,
	repeatedStatusIntervalMs: 15_000,
	maxStatusUpdates: 3,
	toolRunningStatusMs: 12_000,
	forceSynthesisAfterToolCalls: 10,
	forceSynthesisAfterReadRounds: 8,
	maxToolRounds: 16,
	askUserAfterRepeatedValidationFailures: 2
};

const FORCE_SYNTHESIS_INSTRUCTION =
	'Supervisor note: enough tool work has happened for this turn. Stop calling tools and write the final user-facing answer from the available tool results. Be explicit about what was completed, what was found, and what could not be completed. Do not say you will check, inspect, load, search, update, or create anything else.';

export function createDeterministicTurnSupervisor(
	params: TurnSupervisorCreateParams
): TurnSupervisor {
	return new DeterministicTurnSupervisor(params);
}

class DeterministicTurnSupervisor implements TurnSupervisor {
	private readonly params: TurnSupervisorCreateParams;
	private readonly config: Required<TurnSupervisorConfig>;
	private readonly entityIndex: TurnSupervisorEntityIndexEntry[];
	private readonly startedAt: number;
	private lastVisibleTextAt: number | null = null;
	private assistantTextChars = 0;
	private finalCandidateChars = 0;
	private llmPassCount = 0;
	private toolRoundCount = 0;
	private toolCallCount = 0;
	private validationFailureCount = 0;
	private successfulWrites = 0;
	private failedWrites = 0;
	private readRounds = 0;
	private lowNoveltyReadRounds = 0;
	private repeatedToolPatternCount = 0;
	private repeatedFailureCount = 0;
	private discoveredEntityCount = 0;
	private statusUpdateCount = 0;
	private lastStatusAt: number | null = null;
	private forceSynthesisIssued = false;
	private askUserIssued = false;
	private lastRoundPattern: string | null = null;
	private currentRoundTools: Array<{ toolName: string; canonicalOp?: string | null }> = [];
	private readonly recentTools: RecentToolEntry[] = [];
	private readonly failureCounts = new Map<string, number>();
	private readonly failedWriteRecords = new Map<string, FailedWriteRecord>();
	private readonly recoveryInstructionKeys = new Set<string>();

	constructor(params: TurnSupervisorCreateParams) {
		this.params = params;
		this.config = { ...DEFAULT_CONFIG, ...(params.config ?? {}) };
		this.entityIndex = normalizeTurnSupervisorEntityIndex(params.entityIndex);
		this.startedAt = Date.now();
	}

	observe(observation: TurnSupervisorObservation): TurnSupervisorDecision[] {
		const at = observation.at ?? Date.now();
		this.applyObservation(observation, at);
		return this.decide(observation, at);
	}

	getDigest(): TurnDigest {
		return this.buildDigest(Date.now());
	}

	private applyObservation(observation: TurnSupervisorObservation, at: number): void {
		switch (observation.type) {
			case 'assistant_text_delta': {
				const chars = Math.max(0, observation.chars || 0);
				this.assistantTextChars += chars;
				if (chars > 0) {
					this.lastVisibleTextAt = at;
				}
				break;
			}
			case 'llm_pass_completed': {
				this.llmPassCount = Math.max(this.llmPassCount, observation.pass);
				break;
			}
			case 'tool_call_emitted': {
				this.toolCallCount += 1;
				const canonicalOp = extractCanonicalOpFromPreview(observation.argsPreview);
				const argsSummary = summarizeToolArguments(observation.argsPreview);
				const entry: RecentToolEntry = {
					sequence: this.toolCallCount,
					toolName: observation.toolName,
					toolCallId: observation.toolCallId,
					canonicalOp,
					argsFingerprint: argsSummary.fingerprint,
					idArgs: argsSummary.idArgs,
					success: null,
					errorClass: null,
					resultSummary: null
				};
				this.recentTools.push(entry);
				this.currentRoundTools.push({
					toolName: observation.toolName,
					canonicalOp
				});
				while (this.recentTools.length > 10) {
					this.recentTools.shift();
				}
				break;
			}
			case 'tool_result_received': {
				const entry = this.recentTools.find(
					(tool) => tool.toolCallId === observation.toolCallId
				);
				const typedFailure = classifyToolFailure({
					message: observation.error,
					toolName: observation.toolName,
					canonicalOp: entry?.canonicalOp ?? null
				});
				const errorClass = classifyToolError(observation.error);
				if (entry) {
					entry.success = observation.success;
					entry.errorClass = errorClass;
					entry.resultSummary = observation.resultSummary ?? null;
				}
				if (!observation.success) {
					const failureKey = typedFailure
						? buildToolFailureKey(typedFailure)
						: `${observation.toolName}|${errorClass ?? 'execution'}|${observation.error ?? ''}`;
					const nextCount = (this.failureCounts.get(failureKey) ?? 0) + 1;
					this.failureCounts.set(failureKey, nextCount);
					if (nextCount >= 2) {
						this.repeatedFailureCount = Math.max(this.repeatedFailureCount, nextCount);
					}
					if (errorClass === 'validation') {
						this.validationFailureCount += 1;
					}
				} else if (entry && isLikelyWriteToolName(entry.toolName, entry.canonicalOp)) {
					this.successfulWrites += 1;
				} else if (entry && isLikelyReadToolName(entry.toolName, entry.canonicalOp)) {
					this.discoveredEntityCount += countLikelyEntityIds(observation.resultSummary);
				}
				if (
					!observation.success &&
					entry &&
					isLikelyWriteToolName(entry.toolName, entry.canonicalOp)
				) {
					this.failedWrites += 1;
					this.recordFailedWrite(entry);
				}
				break;
			}
			case 'tool_round_completed': {
				this.toolRoundCount = Math.max(this.toolRoundCount, observation.round);
				const roundPattern = buildToolPatternKey(this.currentRoundTools);
				const hasWrite = this.currentRoundTools.some((tool) =>
					isLikelyWriteToolName(tool.toolName, tool.canonicalOp)
				);
				const hasRead = this.currentRoundTools.some((tool) =>
					isLikelyReadToolName(tool.toolName, tool.canonicalOp)
				);
				if (!hasWrite && hasRead) {
					this.readRounds += 1;
					if (roundPattern && roundPattern === this.lastRoundPattern) {
						this.lowNoveltyReadRounds += 1;
					}
				}
				if (roundPattern && roundPattern === this.lastRoundPattern) {
					this.repeatedToolPatternCount += 1;
				}
				if (roundPattern) {
					this.lastRoundPattern = roundPattern;
				}
				this.currentRoundTools = [];
				break;
			}
			case 'final_candidate': {
				this.finalCandidateChars = observation.text.trim().length;
				break;
			}
		}
	}

	private decide(observation: TurnSupervisorObservation, at: number): TurnSupervisorDecision[] {
		const decisions: TurnSupervisorDecision[] = [];
		const digest = this.buildDigest(at);

		const blockedRetryDecision = this.buildBlockedRetryDecision(observation);
		if (blockedRetryDecision) {
			return [blockedRetryDecision];
		}

		const askUserDecision = this.buildAskUserDecision(observation, digest);
		if (askUserDecision) {
			this.askUserIssued = true;
			return [askUserDecision];
		}

		const failedWriteRecoveryDecision = this.buildFailedWriteRecoveryDecision(observation);
		if (failedWriteRecoveryDecision) {
			decisions.push(failedWriteRecoveryDecision);
		}

		if (this.shouldEmitStatus(observation, digest, at)) {
			this.statusUpdateCount += 1;
			this.lastStatusAt = at;
			decisions.push({
				action: 'emit_status',
				message: buildTurnStatusMessage(digest),
				reason:
					observation.type === 'long_running_operation'
						? 'long_running_operation'
						: 'long_silence'
			});
		}

		if (!this.forceSynthesisIssued && this.shouldForceSynthesis(observation, digest)) {
			this.forceSynthesisIssued = true;
			decisions.push({
				action: 'force_synthesis',
				instruction: FORCE_SYNTHESIS_INSTRUCTION,
				reason: digest.risks.includes('low_novelty_reads')
					? 'low_novelty_reads'
					: digest.risks.includes('near_tool_budget')
						? 'near_tool_budget'
						: 'many_tool_calls'
			});
		}

		if (
			observation.type === 'final_candidate' &&
			digest.toolCallCount > 0 &&
			digest.finalCandidateChars === 0
		) {
			decisions.push({
				action: 'flag_eval',
				reason: 'empty_final_candidate_after_tool_work'
			});
		}

		return decisions.length > 0 ? decisions : [{ action: 'continue' }];
	}

	private buildBlockedRetryDecision(
		observation: TurnSupervisorObservation
	): TurnSupervisorDecision | null {
		if (observation.type !== 'tool_call_emitted') return null;
		const canonicalOp = extractCanonicalOpFromPreview(observation.argsPreview);
		if (!isLikelyWriteToolName(observation.toolName, canonicalOp)) return null;
		const argsSummary = summarizeToolArguments(observation.argsPreview);
		if (!argsSummary.fingerprint) return null;
		const key = buildFailedWriteKey(observation.toolName, canonicalOp, argsSummary.fingerprint);
		const failedWrite = this.failedWriteRecords.get(key);
		if (!failedWrite) return null;

		return {
			action: 'inject_recovery_instruction',
			reason: 'blocked_repeated_failed_write',
			toolCallId: observation.toolCallId,
			blockToolCall: true,
			instruction: buildBlockedRetryInstruction(failedWrite)
		};
	}

	private buildFailedWriteRecoveryDecision(
		observation: TurnSupervisorObservation
	): TurnSupervisorDecision | null {
		if (observation.type !== 'tool_result_received' || observation.success) return null;
		const entry = this.recentTools.find((tool) => tool.toolCallId === observation.toolCallId);
		if (!entry || !isLikelyWriteToolName(entry.toolName, entry.canonicalOp)) return null;
		if (entry.errorClass === 'validation') return null;
		if (!entry.argsFingerprint) return null;

		const key = buildFailedWriteKey(entry.toolName, entry.canonicalOp, entry.argsFingerprint);
		if (this.recoveryInstructionKeys.has(key)) return null;
		this.recoveryInstructionKeys.add(key);

		const instruction = buildFailedWriteRecoveryInstruction({
			tool: entry,
			entityIndex: this.entityIndex
		});
		return {
			action: 'inject_recovery_instruction',
			reason: instruction.reason,
			instruction: instruction.text,
			toolCallId: entry.toolCallId
		};
	}

	private buildAskUserDecision(
		observation: TurnSupervisorObservation,
		digest: TurnDigest
	): TurnSupervisorDecision | null {
		if (this.askUserIssued) return null;
		if (observation.type !== 'tool_round_completed') return null;
		if (digest.progress.successfulWrites > 0) return null;
		if (digest.progress.failedWrites === 0) return null;
		if (
			digest.validationFailureCount < this.config.askUserAfterRepeatedValidationFailures ||
			digest.progress.repeatedFailureCount <
				this.config.askUserAfterRepeatedValidationFailures
		) {
			return null;
		}

		const failedValidationTools = digest.recentTools.filter(
			(tool) =>
				tool.success === false &&
				tool.errorClass === 'validation' &&
				isLikelyWriteToolName(tool.toolName, tool.canonicalOp)
		);
		const latestFailure = failedValidationTools.at(-1);
		if (!latestFailure) return null;

		const missingField = extractMissingRequiredField(latestFailure.resultSummary);
		const question = buildRequiredFieldQuestion(missingField);
		return {
			action: 'ask_user',
			question,
			checkpoint: {
				digest,
				resumeContext: {
					user_message: this.params.userMessage,
					reason: 'repeated_validation_failures',
					missing_field: missingField,
					last_failed_tool: latestFailure.toolName,
					last_failed_operation: latestFailure.canonicalOp ?? null,
					last_error: latestFailure.resultSummary ?? null,
					recent_tools: digest.recentTools,
					progress: digest.progress,
					instruction:
						'Continue from this checkpoint after the user provides the missing detail. Do not retry the failed write until the missing field is resolved.'
				}
			},
			reason: 'repeated_validation_failures'
		};
	}

	private shouldEmitStatus(
		observation: TurnSupervisorObservation,
		digest: TurnDigest,
		at: number
	): boolean {
		if (this.statusUpdateCount >= this.config.maxStatusUpdates) return false;
		if (
			this.lastStatusAt !== null &&
			at - this.lastStatusAt < this.config.repeatedStatusIntervalMs
		) {
			return false;
		}
		if (
			observation.type === 'long_running_operation' &&
			observation.elapsedMs >= this.config.toolRunningStatusMs
		) {
			return true;
		}
		if (digest.toolCallCount === 0 && digest.toolRoundCount === 0) return false;
		return digest.msSinceVisibleText === null
			? digest.elapsedMs >= this.config.statusSilenceMs
			: digest.msSinceVisibleText >= this.config.statusSilenceMs;
	}

	private shouldForceSynthesis(
		observation: TurnSupervisorObservation,
		digest: TurnDigest
	): boolean {
		if (observation.type !== 'tool_round_completed') return false;
		if (
			digest.toolCallCount >= this.config.forceSynthesisAfterToolCalls &&
			digest.progress.successfulWrites === 0
		) {
			return true;
		}
		if (
			digest.progress.readRounds >= this.config.forceSynthesisAfterReadRounds &&
			digest.progress.successfulWrites === 0
		) {
			return true;
		}
		if (
			digest.progress.lowNoveltyReadRounds >= 2 &&
			digest.progress.readRounds >= this.config.forceSynthesisAfterReadRounds
		) {
			return true;
		}
		return digest.toolRoundCount >= Math.max(1, this.config.maxToolRounds - 1);
	}

	private recordFailedWrite(entry: RecentToolEntry): void {
		if (entry.errorClass === 'validation') return;
		if (!entry.argsFingerprint) return;
		const key = buildFailedWriteKey(entry.toolName, entry.canonicalOp, entry.argsFingerprint);
		const existing = this.failedWriteRecords.get(key);
		this.failedWriteRecords.set(key, {
			toolName: entry.toolName,
			canonicalOp: entry.canonicalOp,
			argsFingerprint: entry.argsFingerprint,
			idArgs: entry.idArgs ?? {},
			errorClass: entry.errorClass,
			resultSummary: entry.resultSummary,
			count: (existing?.count ?? 0) + 1
		});
	}

	private buildDigest(at: number): TurnDigest {
		const elapsedMs = Math.max(0, at - this.startedAt);
		const msSinceVisibleText =
			this.lastVisibleTextAt === null ? null : Math.max(0, at - this.lastVisibleTextAt);
		const risks = this.buildRisks(elapsedMs, msSinceVisibleText);
		return {
			turnRunId: this.params.turnRunId ?? null,
			sessionId: this.params.sessionId,
			userId: this.params.userId,
			contextType: this.params.contextType,
			entityId: this.params.entityId ?? null,
			projectId: this.params.projectId ?? null,
			userMessage: this.params.userMessage,
			elapsedMs,
			msSinceVisibleText,
			assistantTextChars: this.assistantTextChars,
			finalCandidateChars: this.finalCandidateChars,
			llmPassCount: this.llmPassCount,
			toolRoundCount: this.toolRoundCount,
			toolCallCount: this.toolCallCount,
			validationFailureCount: this.validationFailureCount,
			recentTools: this.recentTools.map((tool) => ({
				sequence: tool.sequence,
				toolName: tool.toolName,
				canonicalOp: tool.canonicalOp,
				argsFingerprint: tool.argsFingerprint,
				idArgs: tool.idArgs,
				success: tool.success,
				errorClass: tool.errorClass,
				resultSummary: tool.resultSummary
			})),
			progress: {
				successfulWrites: this.successfulWrites,
				failedWrites: this.failedWrites,
				readRounds: this.readRounds,
				lowNoveltyReadRounds: this.lowNoveltyReadRounds,
				repeatedToolPatternCount: this.repeatedToolPatternCount,
				repeatedFailureCount: this.repeatedFailureCount,
				discoveredEntityCount: this.discoveredEntityCount
			},
			risks
		};
	}

	private buildRisks(elapsedMs: number, msSinceVisibleText: number | null): TurnSupervisorRisk[] {
		const risks = new Set<TurnSupervisorRisk>();
		if (
			(msSinceVisibleText === null && elapsedMs >= this.config.statusSilenceMs) ||
			(msSinceVisibleText !== null && msSinceVisibleText >= this.config.statusSilenceMs)
		) {
			risks.add('long_silence');
		}
		if (this.toolCallCount >= this.config.forceSynthesisAfterToolCalls) {
			risks.add('many_tool_calls');
		}
		if (this.repeatedFailureCount >= 2) risks.add('repeated_failures');
		if (this.lowNoveltyReadRounds >= 2) risks.add('low_novelty_reads');
		if (this.toolRoundCount >= Math.max(1, this.config.maxToolRounds - 1)) {
			risks.add('near_tool_budget');
		}
		if (this.toolCallCount > 0 && this.finalCandidateChars === 0) {
			risks.add('empty_final_candidate');
			risks.add('tools_without_final_answer');
		}
		return Array.from(risks);
	}
}

function extractCanonicalOpFromPreview(preview: unknown): string | null {
	if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return null;
	for (const key of ['op', 'operation', 'help_path']) {
		const value = (preview as Record<string, unknown>)[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

function buildFailedWriteKey(
	toolName: string,
	canonicalOp: string | null | undefined,
	argsFingerprint: string
): string {
	return [toolName, canonicalOp ?? '', argsFingerprint].join('|');
}

function buildBlockedRetryInstruction(failedWrite: FailedWriteRecord): string {
	const opLabel = failedWrite.canonicalOp ?? failedWrite.toolName;
	const errorText = failedWrite.resultSummary
		? ` The previous error was: ${failedWrite.resultSummary}`
		: '';
	return [
		`Supervisor blocked an exact retry of ${opLabel} because the same write payload already failed.`,
		'Do not call that exact tool with those exact arguments again in this turn.',
		errorText,
		'Use a different exact id or the correct tool for the entity kind, or ask one concise blocker question if the target cannot be inferred.'
	]
		.filter((line) => line.trim().length > 0)
		.join(' ');
}

function buildFailedWriteRecoveryInstruction(params: {
	tool: RecentToolEntry;
	entityIndex: TurnSupervisorEntityIndexEntry[];
}): { reason: string; text: string } {
	const { tool, entityIndex } = params;
	const opLabel = tool.canonicalOp ?? tool.toolName;
	const wrongKind = findWrongEntityKind(tool.idArgs ?? {}, entityIndex);
	if (wrongKind) {
		const actualLabel = wrongKind.actual.label ? ` ("${wrongKind.actual.label}")` : '';
		return {
			reason: 'wrong_entity_kind_failed_write',
			text: [
				`A write failed because ${opLabel} used ${wrongKind.idField}=${wrongKind.id}, but loaded context identifies that UUID as a ${wrongKind.actual.kind}${actualLabel}.`,
				`${opLabel} needs ${articleFor(wrongKind.expectedKind)} ${wrongKind.expectedKind} id for ${wrongKind.idField}.`,
				'Do not retry the same call.',
				`Use an actual ${wrongKind.expectedKind} id from loaded context, use the correct tool for the ${wrongKind.actual.kind}, or ask one concise clarifying question if the intended target is ambiguous.`
			].join(' ')
		};
	}

	if (tool.errorClass === 'not_found') {
		return {
			reason: 'not_found_failed_write',
			text: [
				`A write failed with not_found while calling ${opLabel}.`,
				'Do not retry the same arguments.',
				'Check whether each *_id belongs to the entity kind required by that field.',
				'If the exact target is already present in loaded context, use that exact id; otherwise ask one concise clarifying question.'
			].join(' ')
		};
	}

	const errorText = tool.resultSummary ? ` Error: ${tool.resultSummary}` : '';
	return {
		reason: 'failed_write_recovery',
		text: [
			`A write failed while calling ${opLabel}.`,
			errorText,
			'Do not retry the same arguments.',
			'Treat the tool error as literal feedback, correct the failing field or id, and only call the tool again when the fix is determined from context. If it is not determined, ask one concise blocker question.'
		]
			.filter((line) => line.trim().length > 0)
			.join(' ')
	};
}

function findWrongEntityKind(
	idArgs: Record<string, string>,
	entityIndex: TurnSupervisorEntityIndexEntry[]
): {
	idField: string;
	id: string;
	expectedKind: string;
	actual: TurnSupervisorEntityIndexEntry;
} | null {
	for (const [idField, id] of Object.entries(idArgs)) {
		const expectedKind = expectedEntityKindFromIdField(idField);
		if (!expectedKind) continue;
		const actual = findEntityIndexEntry(entityIndex, id);
		if (!actual || actual.kind === expectedKind) continue;
		return { idField, id, expectedKind, actual };
	}
	return null;
}

const KNOWN_ID_FIELD_KINDS = new Set([
	'project',
	'goal',
	'milestone',
	'plan',
	'task',
	'document',
	'event',
	'calendar_event'
]);

function expectedEntityKindFromIdField(idField: string): string | null {
	if (idField === 'id') return null;
	const withoutSuffix = idField.endsWith('_id')
		? idField.slice(0, -3)
		: idField.endsWith('Id')
			? idField.slice(0, -2)
			: null;
	const normalized = normalizeEntityKind(withoutSuffix);
	if (!normalized || !KNOWN_ID_FIELD_KINDS.has(normalized)) return null;
	if (normalized === 'calendar_event') return 'event';
	return normalized;
}

function articleFor(value: string): 'a' | 'an' {
	return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

function extractMissingRequiredField(summary: string | null | undefined): string | null {
	if (!summary) return null;
	return parseRequiredParameterFailure(summary) ?? parseInvalidArgumentFailure(summary);
}

function buildRequiredFieldQuestion(field: string | null): string {
	if (!field) {
		return 'Which exact item should I use? Send the name or ID, and I will continue from here.';
	}
	if (field === 'project_id') {
		return 'Which exact project should I use? Send the project name or ID, and I will continue from here.';
	}
	if (field.endsWith('_id')) {
		const entity = field.slice(0, -3).replace(/_/g, ' ').trim();
		return `Which exact ${entity || 'item'} should I use? Send the name or ID, and I will continue from here.`;
	}
	if (field === 'title' || field === 'name') {
		return `What ${field} should I use?`;
	}
	return `What value should I use for ${field}?`;
}

function countLikelyEntityIds(summary: string | null | undefined): number {
	if (!summary) return 0;
	const matches = summary.match(
		/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
	);
	return matches?.length ?? 0;
}
