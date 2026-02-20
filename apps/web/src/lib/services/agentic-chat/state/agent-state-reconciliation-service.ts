// apps/web/src/lib/services/agentic-chat/state/agent-state-reconciliation-service.ts
/**
 * Agent State Reconciliation Service
 *
 * Runs an end-of-turn summarizer LLM to reconcile agent state deltas
 * without blocking streaming.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ChatContextType } from '@buildos/shared-types';
import type {
	AgentState,
	AgentStateDelta,
	AgentStateItem,
	AgentStateItemUpdate,
	AgentStateUpdate
} from '$lib/types/agent-chat-enhancement';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { cleanJSONResponse } from '$lib/services/smart-llm/response-parsing';
import { getOptimalJSONProfile } from '../config/model-selection-config';
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogText } from '$lib/utils/logging-helpers';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('AgentStateReconciliation');

export interface AgentStateMessageSnapshot {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	createdAt?: string;
}

export interface AgentStateToolSummary {
	tool_name?: string;
	success?: boolean;
	error?: string;
	entities_accessed?: string[];
	entity_updates?: Array<{ id: string; kind: string; name?: string }>;
	entity_counts?: Record<string, number>;
	summary?: string;
}

export interface AgentStateReconciliationInput {
	sessionId: string;
	userId: string;
	contextType: ChatContextType;
	messages: AgentStateMessageSnapshot[];
	toolResults: AgentStateToolSummary[];
	agentState: AgentState;
	httpReferer?: string;
}

interface LLMService {
	getJSONResponse?<T = any>(options: {
		systemPrompt: string;
		userPrompt: string;
		temperature?: number;
		profile?: string;
		userId?: string;
		operationType?: string;
		chatSessionId?: string;
		validation?: {
			retryOnParseError?: boolean;
			validateSchema?: boolean;
			maxRetries?: number;
			allowTruncatedJsonRecovery?: boolean;
		};
	}): Promise<T>;
	generateText?(options: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
		chatSessionId?: string;
	}): Promise<string>;
}

export class AgentStateReconciliationService {
	constructor(
		private supabase: SupabaseClient<Database>,
		private errorLogger?: ErrorLoggerService
	) {}

	async reconcile(input: AgentStateReconciliationInput): Promise<AgentState | null> {
		if (!input.messages.length && !input.toolResults.length) {
			return null;
		}

		const llmService = new SmartLLMService({
			supabase: this.supabase,
			httpReferer: input.httpReferer,
			appName: 'BuildOS Agentic Chat'
		});

		const systemPrompt = this.buildSystemPrompt();
		const userPrompt = this.buildUserPrompt(input);
		const llmWithJson = llmService as LLMService;
		const profile = getOptimalJSONProfile('cost_sensitive', 'simple');

		let rawResponse: unknown;

		try {
			if (typeof llmWithJson.getJSONResponse === 'function') {
				rawResponse = await llmWithJson.getJSONResponse<AgentStateDelta>({
					systemPrompt,
					userPrompt,
					temperature: 0.25,
					profile,
					userId: input.userId,
					operationType: 'agent_state_reconciliation',
					chatSessionId: input.sessionId,
					validation: {
						retryOnParseError: true,
						maxRetries: 2,
						allowTruncatedJsonRecovery: true
					}
				});
			} else if (typeof llmWithJson.generateText === 'function') {
				rawResponse = await llmWithJson.generateText({
					systemPrompt,
					prompt: userPrompt,
					temperature: 0.25,
					maxTokens: 800,
					userId: input.userId,
					operationType: 'agent_state_reconciliation',
					chatSessionId: input.sessionId
				});
			}
		} catch (error) {
			logger.warn('Agent state reconciliation LLM call failed', {
				error,
				sessionId: input.sessionId
			});
			if (this.errorLogger) {
				void this.errorLogger.logError(error, {
					userId: input.userId,
					operationType: 'agent_state_reconciliation',
					metadata: {
						sessionId: input.sessionId,
						contextType: input.contextType,
						messageCount: input.messages.length,
						toolCount: input.toolResults.length
					}
				});
			}
			return null;
		}

		const delta = this.normalizeDelta(rawResponse);
		if (!delta) {
			logger.warn('Agent state reconciliation returned invalid delta', {
				sessionId: input.sessionId,
				responsePreview:
					typeof rawResponse === 'string'
						? sanitizeLogText(rawResponse, 200)
						: sanitizeLogText(JSON.stringify(rawResponse) ?? '', 200)
			});
			return null;
		}

		const updated = this.applyDelta(input.agentState, delta);
		updated.lastSummarizedAt = new Date().toISOString();
		return updated;
	}

	private buildSystemPrompt(): string {
		return [
			'You are updating the agent_state for a BuildOS chat.',
			'Use ONLY the provided messages, tool results, and current agent_state.',
			'Return structured deltas only. Do not invent facts or expand beyond evidence.',
			'If there are no updates, return {"agent_state_item_updates":[],"agent_state_updates":{}}.',
			'Output valid JSON only (no markdown or extra text).',
			'Schema:',
			'{',
			'  "agent_state_item_updates": [',
			'    {"op":"add","item":{"id?":string,"kind":"task|doc|note|idea|question","title":string,"details?":string,"status":"active|resolved|discarded","relatedEntityIds?":[string]}}',
			'    {"op":"update","id":string,"patch":{...}}',
			'    {"op":"remove","id":string}',
			'  ],',
			'  "agent_state_updates": {',
			'    "current_understanding": { "entities": [...], "dependencies": [...] },',
			'    "assumptions": [{ "id?":string,"hypothesis":string,"confidence?":number,"evidence?":[string] }],',
			'    "expectations": [{ "id?":string,"action":string,"expected_outcome":string,"expected_ids?":[string],"expected_type?":string,"expected_count?":number,"invariant?":string,"status?":"pending|confirmed|failed","last_checked_at?":string }],',
			'    "tentative_hypotheses": [{ "id?":string,"hypothesis":string,"reason?":string }]',
			'  }',
			'}'
		].join('\n');
	}

	private buildUserPrompt(input: AgentStateReconciliationInput): string {
		const payload = {
			context_type: input.contextType,
			agent_state: input.agentState,
			recent_messages: input.messages,
			tool_results: input.toolResults
		};

		return `Context JSON:\n${JSON.stringify(payload, null, 2)}`;
	}

	private normalizeDelta(raw: unknown): AgentStateDelta | null {
		if (!raw) return null;

		let parsed: unknown = raw;
		if (typeof raw === 'string') {
			const cleaned = cleanJSONResponse(raw);
			try {
				parsed = JSON.parse(cleaned);
			} catch {
				return null;
			}
		}

		if (!parsed || typeof parsed !== 'object') return null;
		const record = parsed as Record<string, any>;
		const itemUpdates = Array.isArray(record.agent_state_item_updates)
			? (record.agent_state_item_updates as AgentStateItemUpdate[])
			: [];
		const stateUpdates =
			record.agent_state_updates && typeof record.agent_state_updates === 'object'
				? (record.agent_state_updates as AgentStateUpdate)
				: {};

		return {
			agent_state_item_updates: itemUpdates,
			agent_state_updates: stateUpdates
		};
	}

	private applyDelta(agentState: AgentState, delta: AgentStateDelta): AgentState {
		const updated: AgentState = {
			...agentState,
			current_understanding: {
				entities: [...(agentState.current_understanding?.entities ?? [])],
				dependencies: [...(agentState.current_understanding?.dependencies ?? [])]
			},
			assumptions: [...(agentState.assumptions ?? [])],
			expectations: [...(agentState.expectations ?? [])],
			tentative_hypotheses: [...(agentState.tentative_hypotheses ?? [])],
			items: [...(agentState.items ?? [])]
		};

		if (Array.isArray(delta.agent_state_item_updates)) {
			this.applyItemUpdates(updated, delta.agent_state_item_updates);
		}

		if (delta.agent_state_updates && typeof delta.agent_state_updates === 'object') {
			this.applyStateUpdates(updated, delta.agent_state_updates);
		}

		return updated;
	}

	private applyItemUpdates(agentState: AgentState, updates: AgentStateItemUpdate[]): void {
		if (!updates.length) return;
		const allowedKinds = new Set(['task', 'doc', 'note', 'idea', 'question']);
		const allowedStatus = new Set(['active', 'resolved', 'discarded']);
		const now = new Date().toISOString();

		for (const update of updates) {
			if (!update || typeof update !== 'object') continue;

			if (update.op === 'add' && update.item) {
				const item = update.item as AgentStateItem;
				if (!item.title || typeof item.title !== 'string') continue;
				if (!allowedKinds.has(item.kind)) continue;

				const id = item.id && typeof item.id === 'string' ? item.id : uuidv4();
				const status =
					item.status && allowedStatus.has(item.status) ? item.status : 'active';
				const existingIndex = agentState.items.findIndex((entry) => entry.id === id);

				const hydrated: AgentStateItem = {
					id,
					kind: item.kind as AgentStateItem['kind'],
					title: item.title.trim(),
					details: typeof item.details === 'string' ? item.details : undefined,
					status: status as AgentStateItem['status'],
					relatedEntityIds: Array.isArray(item.relatedEntityIds)
						? item.relatedEntityIds.filter((entry) => typeof entry === 'string')
						: undefined,
					createdAt: item.createdAt ?? now,
					updatedAt: item.updatedAt ?? now
				};

				if (existingIndex >= 0) {
					agentState.items[existingIndex] = hydrated;
				} else {
					agentState.items.push(hydrated);
				}
				continue;
			}

			if (update.op === 'update' && update.id) {
				const index = agentState.items.findIndex((item) => item.id === update.id);
				if (index === -1) continue;
				const existing = agentState.items[index]!;
				const patch = update.patch ?? {};
				const next: AgentStateItem = { ...existing };
				if (typeof patch.title === 'string') {
					next.title = patch.title.trim();
				}
				if (typeof patch.details === 'string') {
					next.details = patch.details;
				} else if (patch.details === null) {
					next.details = undefined;
				}
				if (typeof patch.status === 'string' && allowedStatus.has(patch.status)) {
					next.status = patch.status as AgentStateItem['status'];
				}
				if (typeof patch.kind === 'string' && allowedKinds.has(patch.kind)) {
					next.kind = patch.kind as AgentStateItem['kind'];
				}
				if (Array.isArray(patch.relatedEntityIds)) {
					next.relatedEntityIds = patch.relatedEntityIds.filter(
						(entry: unknown) => typeof entry === 'string'
					);
				}
				next.updatedAt = now;
				agentState.items[index] = next;
				continue;
			}

			if (update.op === 'remove' && update.id) {
				agentState.items = agentState.items.filter((item) => item.id !== update.id);
			}
		}
	}

	private applyStateUpdates(agentState: AgentState, updates: AgentStateUpdate): void {
		if (updates.current_understanding) {
			this.mergeCurrentUnderstanding(agentState, updates.current_understanding);
		}
		if (Array.isArray(updates.assumptions)) {
			this.mergeAssumptions(agentState, updates.assumptions);
		}
		if (Array.isArray(updates.expectations)) {
			this.mergeExpectations(agentState, updates.expectations);
		}
		if (Array.isArray(updates.tentative_hypotheses)) {
			this.mergeTentativeHypotheses(agentState, updates.tentative_hypotheses);
		}
	}

	private mergeCurrentUnderstanding(
		agentState: AgentState,
		payload: NonNullable<AgentStateUpdate['current_understanding']>
	): void {
		if (Array.isArray(payload.entities)) {
			const entityKey = (entry: { id: string; kind: string }) => `${entry.kind}:${entry.id}`;
			const existing = new Map(
				agentState.current_understanding.entities.map((e) => [entityKey(e), e])
			);
			for (const entity of payload.entities) {
				if (!entity || typeof entity !== 'object') continue;
				if (!entity.id || !entity.kind) continue;
				existing.set(entityKey(entity), {
					id: entity.id,
					kind: entity.kind,
					name: entity.name
				});
			}
			agentState.current_understanding.entities = Array.from(existing.values());
		}

		if (Array.isArray(payload.dependencies)) {
			const depKey = (entry: { from: string; to: string; rel?: string }) =>
				`${entry.from}:${entry.to}:${entry.rel ?? ''}`;
			const existing = new Map(
				agentState.current_understanding.dependencies.map((d) => [depKey(d), d])
			);
			for (const dep of payload.dependencies) {
				if (!dep || typeof dep !== 'object') continue;
				if (!dep.from || !dep.to) continue;
				existing.set(depKey(dep), {
					from: dep.from,
					to: dep.to,
					rel: dep.rel
				});
			}
			agentState.current_understanding.dependencies = Array.from(existing.values());
		}
	}

	private mergeAssumptions(
		agentState: AgentState,
		updates: NonNullable<AgentStateUpdate['assumptions']>
	): void {
		const byId = new Map(agentState.assumptions.map((a) => [a.id, a]));
		const byHypothesis = new Map(
			agentState.assumptions.map((a) => [this.normalizeText(a.hypothesis), a.id])
		);

		for (const update of updates) {
			if (!update || typeof update !== 'object') continue;
			if (!update.hypothesis || typeof update.hypothesis !== 'string') continue;
			const normalized = this.normalizeText(update.hypothesis);
			const existingId = update.id ?? byHypothesis.get(normalized);

			if (existingId && byId.has(existingId)) {
				const current = byId.get(existingId)!;
				byId.set(existingId, {
					...current,
					hypothesis: update.hypothesis,
					confidence:
						typeof update.confidence === 'number'
							? update.confidence
							: current.confidence,
					evidence: Array.isArray(update.evidence) ? update.evidence : current.evidence
				});
				continue;
			}

			const id = update.id ?? uuidv4();
			byId.set(id, {
				id,
				hypothesis: update.hypothesis,
				confidence: typeof update.confidence === 'number' ? update.confidence : 0.6,
				evidence: Array.isArray(update.evidence) ? update.evidence : undefined
			});
			byHypothesis.set(normalized, id);
		}

		agentState.assumptions = Array.from(byId.values());
	}

	private mergeExpectations(
		agentState: AgentState,
		updates: NonNullable<AgentStateUpdate['expectations']>
	): void {
		const byKey = new Map<string, AgentState['expectations'][number]>();

		for (const existing of agentState.expectations) {
			if (!existing?.action || !existing?.expected_outcome) continue;
			const key = this.normalizeText(`${existing.action}:${existing.expected_outcome}`);
			if (!byKey.has(key)) {
				byKey.set(key, existing);
			}
		}

		for (const update of updates) {
			if (!update || typeof update !== 'object') continue;
			if (!update.action || !update.expected_outcome) continue;
			const key = this.normalizeText(`${update.action}:${update.expected_outcome}`);
			const current = byKey.get(key);

			if (current) {
				byKey.set(key, {
					...current,
					...update,
					id: current.id ?? update.id
				});
				continue;
			}

			byKey.set(key, {
				id: update.id ?? uuidv4(),
				action: update.action,
				expected_outcome: update.expected_outcome,
				expected_ids: update.expected_ids,
				expected_type: update.expected_type,
				expected_count: update.expected_count,
				invariant: update.invariant,
				status: update.status,
				last_checked_at: update.last_checked_at
			});
		}

		agentState.expectations = Array.from(byKey.values()).filter(
			(entry) => entry.expected_outcome && entry.action
		);
	}

	private mergeTentativeHypotheses(
		agentState: AgentState,
		updates: NonNullable<AgentStateUpdate['tentative_hypotheses']>
	): void {
		const byId = new Map(agentState.tentative_hypotheses.map((h) => [h.id, h]));
		const byHypothesis = new Map(
			agentState.tentative_hypotheses.map((h) => [this.normalizeText(h.hypothesis), h.id])
		);

		for (const update of updates) {
			if (!update || typeof update !== 'object') continue;
			if (!update.hypothesis || typeof update.hypothesis !== 'string') continue;
			const normalized = this.normalizeText(update.hypothesis);
			const existingId = update.id ?? byHypothesis.get(normalized);

			if (existingId && byId.has(existingId)) {
				const current = byId.get(existingId)!;
				byId.set(existingId, {
					...current,
					hypothesis: update.hypothesis,
					reason: update.reason ?? current.reason
				});
				continue;
			}

			const id = update.id ?? uuidv4();
			byId.set(id, {
				id,
				hypothesis: update.hypothesis,
				reason: update.reason
			});
			byHypothesis.set(normalized, id);
		}

		agentState.tentative_hypotheses = Array.from(byId.values());
	}

	private normalizeText(value: string): string {
		return value.trim().toLowerCase();
	}
}
