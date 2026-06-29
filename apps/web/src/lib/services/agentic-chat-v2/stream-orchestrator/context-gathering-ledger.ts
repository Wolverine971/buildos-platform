// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/context-gathering-ledger.ts
import type { ChatToolCall, ContextUsageSnapshot } from '@buildos/shared-types';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution } from './shared';
import type { RoundToolPattern } from './round-analysis';

export type ContextSaturationStatusName = 'open' | 'narrowing' | 'saturated' | 'must_synthesize';

export type ContextSaturationStatus = {
	status: ContextSaturationStatusName;
	roundsRemaining: number;
	readRounds: number;
	writeRounds: number;
	lowNoveltyRounds: number;
	searchedCount: number;
	seenEntityCount: number;
	totalModelPayloadChars: number;
	newEvidenceThisRound: boolean;
	reasons: string[];
};

export type ContextGatheringObservation = {
	status: ContextSaturationStatus;
	message: string | null;
	forceSynthesis: boolean;
};

type ObserveToolRoundParams = {
	roundExecutions: FastToolExecution[];
	roundPattern: RoundToolPattern;
	toolRounds: number;
	maxToolRounds: number;
	modelPayloadChars: number;
	liveContextUsage?: ContextUsageSnapshot;
};

const STATUS_RANK: Record<ContextSaturationStatusName, number> = {
	open: 0,
	narrowing: 1,
	saturated: 2,
	must_synthesize: 3
};

const SEARCH_ARG_KEYS = ['query', 'q', 'search', 'term'];

export class ContextGatheringLedger {
	private readRounds = 0;
	private writeRounds = 0;
	private totalModelPayloadChars = 0;
	private lowNoveltyRounds = 0;
	private repeatedSearchRounds = 0;
	private seenEntityIds = new Set<string>();
	private openedEntityIds = new Set<string>();
	private searchAttempts = new Map<string, { label: string; count: number }>();
	private lastEmittedStatusRank = 0;

	observeToolRound(params: ObserveToolRoundParams): ContextGatheringObservation {
		this.totalModelPayloadChars += Math.max(0, params.modelPayloadChars);
		if (params.roundPattern.hasWriteOps) {
			this.writeRounds += 1;
			this.lowNoveltyRounds = 0;
			this.repeatedSearchRounds = 0;
			return this.buildObservation('open', params, {
				newEvidenceThisRound: false,
				reasons: []
			});
		}

		if (params.roundPattern.readOps.length === 0) {
			return this.buildObservation('open', params, {
				newEvidenceThisRound: false,
				reasons: []
			});
		}

		this.readRounds += 1;
		const roundEntityIds = new Set<string>();
		const roundOpenedEntityIds = new Set<string>();
		const roundSearchKeys = new Set<string>();
		const roundSearchAttempts: Array<{ key: string; label: string }> = [];

		for (const execution of params.roundExecutions) {
			if (!execution.result.success) continue;
			for (const search of extractSearchAttempts(execution.toolCall)) {
				roundSearchKeys.add(search.key);
				roundSearchAttempts.push(search);
			}
			const unwrappedPayload = unwrapGatewayResult(execution.result.result);
			for (const id of extractEntityIds(unwrappedPayload)) {
				roundEntityIds.add(id);
			}
			if (isDetailReadOperation(execution.toolCall)) {
				for (const id of extractPrimaryEntityIds(unwrappedPayload)) {
					roundOpenedEntityIds.add(id);
				}
				for (const id of extractToolArgumentIds(execution.toolCall)) {
					roundOpenedEntityIds.add(id);
				}
			}
		}

		const newEntityIds = Array.from(roundEntityIds).filter((id) => !this.seenEntityIds.has(id));
		for (const id of roundEntityIds) {
			this.seenEntityIds.add(id);
		}
		const newOpenedEntityIds = Array.from(roundOpenedEntityIds).filter(
			(id) => !this.openedEntityIds.has(id)
		);
		for (const id of roundOpenedEntityIds) {
			this.openedEntityIds.add(id);
		}

		const repeatedSearchRound =
			roundSearchKeys.size > 0 &&
			Array.from(roundSearchKeys).every((key) => this.searchAttempts.has(key));
		if (repeatedSearchRound) {
			this.repeatedSearchRounds += 1;
		} else if (roundSearchKeys.size > 0) {
			this.repeatedSearchRounds = 0;
		}

		for (const search of roundSearchAttempts) {
			const existing = this.searchAttempts.get(search.key);
			this.searchAttempts.set(search.key, {
				label: search.label,
				count: (existing?.count ?? 0) + 1
			});
		}

		const newEvidenceThisRound = newEntityIds.length > 0 || newOpenedEntityIds.length > 0;
		if (newEvidenceThisRound) {
			this.lowNoveltyRounds = 0;
		} else {
			this.lowNoveltyRounds += 1;
		}

		const { status, reasons } = this.evaluateStatus(params, newEvidenceThisRound);
		return this.buildObservation(status, params, {
			newEvidenceThisRound,
			reasons
		});
	}

	private evaluateStatus(
		params: ObserveToolRoundParams,
		newEvidenceThisRound: boolean
	): { status: ContextSaturationStatusName; reasons: string[] } {
		const reasons: string[] = [];
		const roundsRemaining = params.maxToolRounds - params.toolRounds;
		const contextStatus = params.liveContextUsage?.status;
		if (roundsRemaining <= 2) {
			reasons.push(`${roundsRemaining} tool rounds remain`);
		}
		if (contextStatus === 'over_budget') {
			reasons.push('context window is over budget');
		} else if (contextStatus === 'near_limit') {
			reasons.push('context window is near limit');
		}
		if (!newEvidenceThisRound) {
			reasons.push('last read round added no new entity IDs');
		}
		if (this.lowNoveltyRounds >= 2) {
			reasons.push(`${this.lowNoveltyRounds} consecutive low-novelty read rounds`);
		}
		if (this.repeatedSearchRounds >= 2) {
			reasons.push(`${this.repeatedSearchRounds} repeated search rounds`);
		}

		if (
			roundsRemaining <= 2 ||
			contextStatus === 'over_budget' ||
			this.lowNoveltyRounds >= 3 ||
			this.repeatedSearchRounds >= 3
		) {
			return { status: 'must_synthesize', reasons };
		}
		if (
			this.lowNoveltyRounds >= 2 ||
			this.repeatedSearchRounds >= 2 ||
			(contextStatus === 'near_limit' && this.lowNoveltyRounds >= 1)
		) {
			return { status: 'saturated', reasons };
		}
		if (this.lowNoveltyRounds >= 1 || contextStatus === 'near_limit') {
			return { status: 'narrowing', reasons };
		}
		return { status: 'open', reasons };
	}

	private buildObservation(
		statusName: ContextSaturationStatusName,
		params: ObserveToolRoundParams,
		round: {
			newEvidenceThisRound: boolean;
			reasons: string[];
		}
	): ContextGatheringObservation {
		const status: ContextSaturationStatus = {
			status: statusName,
			roundsRemaining: Math.max(0, params.maxToolRounds - params.toolRounds),
			readRounds: this.readRounds,
			writeRounds: this.writeRounds,
			lowNoveltyRounds: this.lowNoveltyRounds,
			searchedCount: this.searchAttempts.size,
			seenEntityCount: this.seenEntityIds.size,
			totalModelPayloadChars: this.totalModelPayloadChars,
			newEvidenceThisRound: round.newEvidenceThisRound,
			reasons: round.reasons
		};
		const rank = STATUS_RANK[statusName];
		const shouldEmit = rank > this.lastEmittedStatusRank && rank > 0;
		if (shouldEmit) {
			this.lastEmittedStatusRank = rank;
		}
		return {
			status,
			message: shouldEmit ? buildContextGatheringMessage(status, this.searchAttempts) : null,
			forceSynthesis: statusName === 'must_synthesize'
		};
	}
}

function buildContextGatheringMessage(
	status: ContextSaturationStatus,
	searchAttempts: Map<string, { label: string; count: number }>
): string {
	const label =
		status.status === 'must_synthesize'
			? 'must synthesize'
			: status.status === 'saturated'
				? 'saturated'
				: 'narrowing';
	const searches = Array.from(searchAttempts.values())
		.map((attempt) => `"${attempt.label}"`)
		.slice(0, 3);
	const searchLine =
		searches.length > 0
			? `Searches tried: ${searches.join(', ')}${searchAttempts.size > searches.length ? ', ...' : ''}.`
			: `Searches tried: ${status.searchedCount}.`;
	const noveltyLine = status.newEvidenceThisRound
		? 'Last round added new entity IDs.'
		: 'Last round added no new entity IDs.';
	const actionLine =
		status.status === 'must_synthesize'
			? 'Answer from loaded evidence now; do not gather more context.'
			: 'Unless one specific missing fact remains, answer from loaded evidence.';
	return [
		`Context gathering: ${label}.`,
		`Rounds remaining: ${status.roundsRemaining}.`,
		searchLine,
		`Seen entities: ${status.seenEntityCount}.`,
		noveltyLine,
		actionLine
	].join(' ');
}

function extractSearchAttempts(toolCall: ChatToolCall): Array<{ key: string; label: string }> {
	const toolName = toolCall.function?.name?.trim() ?? '';
	const registryEntry = getToolRegistry().byToolName[toolName];
	const op = registryEntry?.op ?? toolName;
	if (!isSearchOperation(toolName) && !isSearchOperation(op)) {
		return [];
	}
	const parsed = parseToolArguments(toolCall.function?.arguments);
	const args = parsed.args ?? {};
	const query = SEARCH_ARG_KEYS.map((key) => args[key]).find(
		(value): value is string => typeof value === 'string' && value.trim().length > 0
	);
	const scopeParts = [
		toolName,
		typeof args.project_id === 'string' ? args.project_id : '',
		Array.isArray(args.types) ? args.types.join(',') : ''
	]
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	const normalizedQuery = (query ?? '(empty query)').replace(/\s+/g, ' ').trim().toLowerCase();
	const key = [...scopeParts, normalizedQuery].join('|');
	return [
		{
			key,
			label: query?.replace(/\s+/g, ' ').trim() || `${toolName || op} without query`
		}
	];
}

function isSearchOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	return (
		normalized.startsWith('search_') ||
		normalized.endsWith('.search') ||
		normalized.startsWith('x.search.')
	);
}

function isDetailReadOperation(toolCall: ChatToolCall): boolean {
	const toolName = toolCall.function?.name?.trim() ?? '';
	const registryEntry = getToolRegistry().byToolName[toolName];
	const op = registryEntry?.op ?? toolName;
	const normalizedToolName = toolName.toLowerCase();
	const normalizedOp = op.toLowerCase();
	if (normalizedToolName.startsWith('search_') || normalizedOp.startsWith('x.search.')) {
		return false;
	}
	return (
		normalizedToolName.startsWith('get_') ||
		normalizedOp.endsWith('.get') ||
		normalizedToolName.endsWith('_details')
	);
}

function unwrapGatewayResult(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}
	const record = payload as Record<string, unknown>;
	if (('ok' in record || 'op' in record || 'meta' in record) && 'result' in record) {
		return record.result;
	}
	return payload;
}

function extractEntityIds(payload: unknown): string[] {
	const ids = new Set<string>();
	collectEntityIds(payload, ids);
	return Array.from(ids);
}

function extractPrimaryEntityIds(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return [];
	}
	const record = payload as Record<string, unknown>;
	const ids = new Set<string>();
	if (typeof record.id === 'string' && record.id.trim().length > 0) {
		ids.add(record.id.trim());
	}
	for (const key of [
		'project',
		'document',
		'task',
		'goal',
		'plan',
		'milestone',
		'risk',
		'requirement',
		'asset',
		'event'
	]) {
		const value = record[key];
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const id = (value as Record<string, unknown>).id;
			if (typeof id === 'string' && id.trim().length > 0) {
				ids.add(id.trim());
			}
		}
	}
	return Array.from(ids);
}

function extractToolArgumentIds(toolCall: ChatToolCall): string[] {
	const parsed = parseToolArguments(toolCall.function?.arguments);
	const ids = new Set<string>();
	for (const [key, value] of Object.entries(parsed.args ?? {})) {
		if (!key.endsWith('_id') && key !== 'id') continue;
		if (typeof value === 'string' && value.trim().length > 0) {
			ids.add(value.trim());
		}
	}
	return Array.from(ids);
}

function collectEntityIds(value: unknown, ids: Set<string>): void {
	if (!value) return;
	if (Array.isArray(value)) {
		for (const item of value) {
			collectEntityIds(item, ids);
		}
		return;
	}
	if (typeof value !== 'object') return;

	const record = value as Record<string, unknown>;
	const id = record.id;
	if (typeof id === 'string' && id.trim().length > 0) {
		ids.add(id.trim());
	}

	for (const nested of Object.values(record)) {
		if (nested && typeof nested === 'object') {
			collectEntityIds(nested, ids);
		}
	}
}
