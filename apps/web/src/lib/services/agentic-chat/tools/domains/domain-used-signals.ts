// apps/web/src/lib/services/agentic-chat/tools/domains/domain-used-signals.ts
import { getOutcomeCardById, listOutcomeCards } from '../outcome-cards/catalog';
import { getSkillByReference } from '../skills/registry';
import { listDomains } from './catalog';
import type { UsedDomainSignal, UsedDomainSignalSource } from './domain-session-state';

export type UsedDomainSignalToolExecution = {
	toolCall?: {
		id?: unknown;
		function?: {
			name?: unknown;
			arguments?: unknown;
		};
	};
	result?: {
		success?: unknown;
		result?: unknown;
	};
	turn_run_id?: unknown;
	created_at?: unknown;
};

export type UsedDomainSignalEvent = {
	event_type?: unknown;
	type?: unknown;
	payload?: unknown;
	turn_run_id?: unknown;
	created_at?: unknown;
};

export type DeriveUsedDomainSignalsInput = {
	toolExecutions?: UsedDomainSignalToolExecution[];
	events?: UsedDomainSignalEvent[];
};

export type DeriveUsedDomainSignalsOptions = {
	now?: Date | string;
	turnRunId?: string | null;
};

type SignalBase = {
	source: UsedDomainSignalSource;
	tool_name?: string;
	skill_id?: string;
	outcome_card_id?: string;
	resource_id?: string;
	turn_run_id?: string;
	observed_at?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readToolName(value: unknown): string | null {
	return readString(value)?.toLowerCase() ?? null;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function toIso(value: Date | string | null | undefined): string | undefined {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	return undefined;
}

function normalizeSkillReference(reference: unknown): string | null {
	const raw = readString(reference);
	if (!raw) return null;
	return getSkillByReference(raw)?.id ?? raw;
}

function getDomainIdsForOutcomeCardReference(reference: unknown): string[] {
	const outcomeCardId = readString(reference);
	if (!outcomeCardId) return [];
	return getOutcomeCardById(outcomeCardId)?.domainIds ?? [];
}

function skillReferenceCandidates(reference: string): string[] {
	const skill = getSkillByReference(reference);
	const candidates = [skill?.id ?? reference];
	let parentId = skill?.parentId;
	while (parentId) {
		const parent = getSkillByReference(parentId);
		candidates.push(parent?.id ?? parentId);
		parentId = parent?.parentId;
	}
	return unique(candidates);
}

export function getDomainIdsForSkillReference(reference: string): string[] {
	const normalizedSkillId = normalizeSkillReference(reference);
	if (!normalizedSkillId) return [];
	const skillIds = new Set(skillReferenceCandidates(normalizedSkillId));
	const domainIds = new Set<string>();

	for (const domain of listDomains()) {
		const domainSkillIds = [
			...domain.skills.map((skill) => skill.id),
			...(domain.recommendedSkillStacks?.flatMap((stack) => stack.skillIds) ?? [])
		];
		if (domainSkillIds.some((skillId) => skillIds.has(skillId))) {
			domainIds.add(domain.id);
		}
	}

	for (const outcomeCard of listOutcomeCards()) {
		const outcomeCardSkillIds = [outcomeCard.defaultSkillId, ...outcomeCard.skillIds].filter(
			(skillId): skillId is string => typeof skillId === 'string'
		);
		if (outcomeCardSkillIds.some((skillId) => skillIds.has(skillId))) {
			for (const domainId of outcomeCard.domainIds) {
				domainIds.add(domainId);
			}
		}
	}

	return [...domainIds].sort((a, b) => a.localeCompare(b));
}

function signalKey(signal: UsedDomainSignal): string {
	return [
		signal.domain_id,
		signal.source,
		signal.skill_id ?? '',
		signal.outcome_card_id ?? '',
		signal.resource_id ?? '',
		signal.tool_name ?? '',
		signal.turn_run_id ?? ''
	].join('|');
}

function appendSignals(signals: UsedDomainSignal[], domainIds: string[], base: SignalBase): void {
	for (const domainId of unique(domainIds)) {
		const signal: UsedDomainSignal = {
			domain_id: domainId,
			source: base.source,
			...(base.tool_name ? { tool_name: base.tool_name } : {}),
			...(base.skill_id ? { skill_id: base.skill_id } : {}),
			...(base.outcome_card_id ? { outcome_card_id: base.outcome_card_id } : {}),
			...(base.resource_id ? { resource_id: base.resource_id } : {}),
			...(base.turn_run_id ? { turn_run_id: base.turn_run_id } : {}),
			...(base.observed_at
				? {
						first_seen_at: base.observed_at,
						last_seen_at: base.observed_at
					}
				: {})
		};
		signals.push(signal);
	}
}

function compactSignals(signals: UsedDomainSignal[]): UsedDomainSignal[] {
	const byKey = new Map<string, UsedDomainSignal>();
	for (const signal of signals) {
		if (!readString(signal.domain_id)) continue;
		byKey.set(signalKey(signal), signal);
	}
	return [...byKey.values()];
}

function resultType(payload: unknown): string | null {
	if (!isRecord(payload)) return null;
	return readString(payload.type);
}

function isLoadedPayload(payload: unknown): payload is Record<string, unknown> {
	const type = resultType(payload);
	return isRecord(payload) && type !== 'not_found' && type !== 'forbidden';
}

function resolveToolBase(
	source: UsedDomainSignalSource,
	toolName: string,
	execution: UsedDomainSignalToolExecution,
	options: DeriveUsedDomainSignalsOptions
): SignalBase {
	const observedAt = toIso(execution.created_at as string | undefined) ?? toIso(options.now);
	const turnRunId = readString(execution.turn_run_id) ?? readString(options.turnRunId);
	return {
		source,
		tool_name: toolName,
		...(turnRunId ? { turn_run_id: turnRunId } : {}),
		...(observedAt ? { observed_at: observedAt } : {})
	};
}

export function deriveUsedDomainSignalsFromToolExecutions(
	executions: UsedDomainSignalToolExecution[],
	options: DeriveUsedDomainSignalsOptions = {}
): UsedDomainSignal[] {
	const signals: UsedDomainSignal[] = [];

	for (const execution of executions) {
		const toolName = readToolName(execution.toolCall?.function?.name);
		if (!toolName || execution.result?.success !== true) continue;
		const payload = execution.result.result;
		if (!isLoadedPayload(payload)) continue;

		if (toolName === 'domain_load') {
			appendSignals(signals, readStringArray([payload.domain_id]), {
				...resolveToolBase('domain_load', toolName, execution, options)
			});
			continue;
		}

		if (toolName === 'outcome_card_load' || toolName === 'work_capability_load') {
			const outcomeCardId =
				readString(payload.id) ??
				readString(payload.outcome_card_id) ??
				readString(payload.work_capability_id);
			const explicitDomainIds = readStringArray(payload.domain_ids);
			const domainIds =
				explicitDomainIds.length > 0
					? explicitDomainIds
					: getDomainIdsForOutcomeCardReference(outcomeCardId);
			appendSignals(signals, domainIds, {
				...resolveToolBase('outcome_card_load', toolName, execution, options),
				...(outcomeCardId ? { outcome_card_id: outcomeCardId } : {})
			});
			continue;
		}

		if (toolName === 'resource_load') {
			const resourceId = readString(payload.resource_id) ?? readString(payload.reference_id);
			const explicitDomainIds = readStringArray(payload.domain_ids);
			const skillId = normalizeSkillReference(payload.skill_id);
			const domainIds =
				explicitDomainIds.length > 0
					? explicitDomainIds
					: skillId
						? getDomainIdsForSkillReference(skillId)
						: [];
			appendSignals(signals, domainIds, {
				...resolveToolBase('resource_load', toolName, execution, options),
				...(resourceId ? { resource_id: resourceId } : {}),
				...(skillId ? { skill_id: skillId } : {})
			});
			continue;
		}

		if (toolName === 'skill_load') {
			const skillId = normalizeSkillReference(payload.id);
			if (!skillId) continue;
			appendSignals(signals, getDomainIdsForSkillReference(skillId), {
				...resolveToolBase('skill_load', toolName, execution, options),
				skill_id: skillId
			});
		}
	}

	return compactSignals(signals);
}

function readEventPayload(event: UsedDomainSignalEvent): Record<string, unknown> {
	return isRecord(event.payload) ? event.payload : {};
}

function readLoadedSkillReferenceFromEvent(event: UsedDomainSignalEvent): string | null {
	const payload = readEventPayload(event);
	const eventRecord = event as Record<string, unknown>;
	const eventType = readString(event.event_type) ?? readString(event.type);
	const payloadType = readString(payload.type);
	const action = readString(payload.action) ?? readString(eventRecord.action);

	if (
		(eventType === 'skill_activity' || payloadType === 'skill_activity') &&
		action !== 'loaded'
	) {
		return null;
	}

	if (
		eventType !== 'skill_activity' &&
		eventType !== 'skill_loaded' &&
		payloadType !== 'skill_activity'
	) {
		return null;
	}

	return (
		readString(payload.path) ??
		readString(eventRecord.path) ??
		readString(payload.skill_id) ??
		readString(eventRecord.skill_id) ??
		readString(payload.skillId) ??
		readString(eventRecord.skillId) ??
		readString(payload.id) ??
		readString(eventRecord.id)
	);
}

export function deriveUsedDomainSignalsFromEvents(
	events: UsedDomainSignalEvent[],
	options: DeriveUsedDomainSignalsOptions = {}
): UsedDomainSignal[] {
	const signals: UsedDomainSignal[] = [];

	for (const event of events) {
		const skillId = normalizeSkillReference(readLoadedSkillReferenceFromEvent(event));
		if (!skillId) continue;
		const observedAt = toIso(event.created_at as string | undefined) ?? toIso(options.now);
		const turnRunId = readString(event.turn_run_id) ?? readString(options.turnRunId);
		appendSignals(signals, getDomainIdsForSkillReference(skillId), {
			source: 'skill_loaded_event',
			skill_id: skillId,
			...(turnRunId ? { turn_run_id: turnRunId } : {}),
			...(observedAt ? { observed_at: observedAt } : {})
		});
	}

	return compactSignals(signals);
}

export function deriveUsedDomainSignals(
	input: DeriveUsedDomainSignalsInput,
	options: DeriveUsedDomainSignalsOptions = {}
): UsedDomainSignal[] {
	return compactSignals([
		...deriveUsedDomainSignalsFromToolExecutions(input.toolExecutions ?? [], options),
		...deriveUsedDomainSignalsFromEvents(input.events ?? [], options)
	]);
}
