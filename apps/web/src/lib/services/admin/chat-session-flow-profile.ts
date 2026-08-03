// apps/web/src/lib/services/admin/chat-session-flow-profile.ts
import {
	auditEventTargetId,
	conversationMessageTargetId,
	conversationToolTargetId,
	conversationTurnTargetId,
	type SessionFlowTarget
} from './chat-session-flow-targets';
import { firstNonEmptyString, payloadField, toNumericValue } from './chat-session-audit-payload';
import type {
	AuditTimelineEvent,
	AuditTimelineSeverity,
	ChatSessionAuditPayload,
	ConversationTurn
} from './chat-session-audit-types';

export type SessionFlowCategory = 'message' | 'supervisor' | 'llm' | 'tool' | 'operation';
export type SessionFlowCostState = 'metered' | 'zero' | 'unmetered';

export type SessionFlowEvent = {
	id: string;
	turnId: string;
	turnIndex: number | null;
	category: SessionFlowCategory;
	label: string;
	startMs: number;
	endMs: number;
	durationMs: number;
	isPoint: boolean;
	severity: AuditTimelineSeverity;
	costUsd: number | null;
	costState: SessionFlowCostState;
	target: SessionFlowTarget;
};

export type SessionFlowTurn = {
	id: string;
	turnIndex: number | null;
	label: string;
	startMs: number;
	endMs: number;
	durationMs: number;
	events: SessionFlowEvent[];
};

export type SessionFlowProfile = {
	turns: SessionFlowTurn[];
	events: SessionFlowEvent[];
	totalActiveDurationMs: number;
	totalCostUsd: number;
	attributedCostUsd: number;
	costDifferenceUsd: number;
	slowestEvent: SessionFlowEvent | null;
};

function timestampMs(value: unknown): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = toNumericValue(value);
	return parsed !== null && parsed >= 0 ? parsed : null;
}

function resolveSpan(params: {
	start: unknown;
	end?: unknown;
	duration?: unknown;
	fallbackStart: string;
}): { startMs: number; endMs: number; durationMs: number; isPoint: boolean } {
	const startMs = timestampMs(params.start) ?? timestampMs(params.fallbackStart) ?? 0;
	const explicitEnd = timestampMs(params.end);
	const measuredDuration = nonNegativeNumber(params.duration);
	const measuredEnd = startMs + (measuredDuration ?? 0);
	const endMs = Math.max(startMs, explicitEnd ?? startMs, measuredEnd);
	const durationMs = Math.max(0, endMs - startMs);
	return { startMs, endMs, durationMs, isPoint: durationMs === 0 };
}

function eventTarget(event: AuditTimelineEvent, turnId: string): SessionFlowTarget {
	return {
		kind: 'audit',
		domId: auditEventTargetId(event.id),
		auditEventId: event.id,
		fallbackDomId: conversationTurnTargetId(turnId)
	};
}

function auditEventFlowEvent(params: {
	event: AuditTimelineEvent;
	turn: ConversationTurn;
	category: 'supervisor' | 'llm' | 'operation';
}): SessionFlowEvent {
	const { event, turn, category } = params;
	const payload = event.payload ?? {};
	const span = resolveSpan({
		start: category === 'llm' ? payloadField(payload, 'request_started_at') : event.timestamp,
		end: category === 'llm' ? payloadField(payload, 'request_completed_at') : undefined,
		duration:
			category === 'llm'
				? payloadField(payload, 'response_time_ms')
				: payloadField(payload, 'duration_ms'),
		fallbackStart: event.timestamp
	});
	const rawCost =
		category === 'llm' ? nonNegativeNumber(payloadField(payload, 'total_cost_usd')) : null;
	const model = firstNonEmptyString(
		payloadField(payload, 'model_used'),
		payloadField(payload, 'model_requested')
	);
	const operation = firstNonEmptyString(
		payloadField(payload, 'operation_type'),
		payloadField(payload, 'action'),
		payloadField(payload, 'event_name')
	);

	return {
		id: event.id,
		turnId: turn.id,
		turnIndex: turn.turnIndex,
		category,
		label:
			category === 'llm'
				? model || event.title.replace(/^LLM Call:\s*/i, '') || 'LLM call'
				: category === 'operation'
					? operation || event.title.replace(/^Operation:\s*/i, '') || 'Operation'
					: event.title || 'Supervisor event',
		...span,
		severity: event.severity,
		costUsd: rawCost,
		costState: rawCost === null ? 'unmetered' : rawCost === 0 ? 'zero' : 'metered',
		target: eventTarget(event, turn.id)
	};
}

function messageFlowEvents(turn: ConversationTurn): SessionFlowEvent[] {
	return [...turn.userMessages, ...turn.assistantMessages, ...turn.otherMessages].map(
		(message) => {
			const span = resolveSpan({ start: message.timestamp, fallbackStart: turn.startedAt });
			return {
				id: `message:${message.id}`,
				turnId: turn.id,
				turnIndex: turn.turnIndex,
				category: 'message' as const,
				label: message.role === 'user' ? 'User request' : `${message.roleLabel} response`,
				...span,
				severity: message.errorMessage ? ('error' as const) : ('info' as const),
				costUsd: null,
				costState: 'unmetered' as const,
				target: {
					kind: 'message' as const,
					domId: conversationMessageTargetId(message.id),
					fallbackDomId: conversationTurnTargetId(turn.id)
				}
			};
		}
	);
}

function toolFlowEvents(turn: ConversationTurn): SessionFlowEvent[] {
	return turn.toolCalls.map((tool) => {
		const span = resolveSpan({
			start: tool.timestamp,
			end: tool.completedAt,
			duration: tool.duration,
			fallbackStart: turn.startedAt
		});
		return {
			id: `tool:${turn.id}:${tool.id}`,
			turnId: turn.id,
			turnIndex: turn.turnIndex,
			category: 'tool' as const,
			label: tool.toolName || 'Tool call',
			...span,
			severity: tool.severity,
			costUsd: null,
			costState: 'unmetered' as const,
			target: {
				kind: 'tool' as const,
				domId: conversationToolTargetId(turn.id, tool.id),
				fallbackDomId: conversationTurnTargetId(turn.id)
			}
		};
	});
}

function dedupeAuditEvents(events: AuditTimelineEvent[]): AuditTimelineEvent[] {
	return [...new Map(events.map((event) => [event.id, event])).values()];
}

function turnFlowEvents(turn: ConversationTurn): SessionFlowEvent[] {
	const supervisor = dedupeAuditEvents(turn.supervisorEvents).map((event) =>
		auditEventFlowEvent({ event, turn, category: 'supervisor' })
	);
	const llm = dedupeAuditEvents(turn.llmCalls).map((event) =>
		auditEventFlowEvent({ event, turn, category: 'llm' })
	);
	const operations = dedupeAuditEvents(turn.operations).map((event) =>
		auditEventFlowEvent({ event, turn, category: 'operation' })
	);

	return [
		...messageFlowEvents(turn),
		...supervisor,
		...llm,
		...toolFlowEvents(turn),
		...operations
	].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
}

export function buildSessionFlowProfile(params: {
	detail: ChatSessionAuditPayload;
	conversationTurns: ConversationTurn[];
}): SessionFlowProfile {
	const turns: SessionFlowTurn[] = [];
	for (const turn of params.conversationTurns) {
		const events = turnFlowEvents(turn);
		const firstEvent = events[0];
		if (!firstEvent) continue;

		const fallbackStart = timestampMs(turn.startedAt) ?? firstEvent.startMs;
		const runEnd = timestampMs(turn.finishedAt);
		let firstEventStart = firstEvent.startMs;
		let lastEventEnd = firstEvent.endMs;
		for (const event of events) {
			firstEventStart = Math.min(firstEventStart, event.startMs);
			lastEventEnd = Math.max(lastEventEnd, event.endMs);
		}
		const startMs = turn.run ? Math.min(fallbackStart, firstEventStart) : firstEventStart;
		const endMs =
			runEnd !== null && runEnd >= startMs ? Math.max(runEnd, lastEventEnd) : lastEventEnd;

		turns.push({
			id: turn.id,
			turnIndex: turn.turnIndex,
			label: turn.turnIndex === null ? 'Session events' : `Turn ${turn.turnIndex}`,
			startMs,
			endMs,
			durationMs: Math.max(0, endMs - startMs),
			events
		});
	}
	const events = turns
		.flatMap((turn) => turn.events)
		.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
	let attributedCostUsd = 0;
	let slowestEvent: SessionFlowEvent | null = null;
	for (const event of events) {
		attributedCostUsd += event.costUsd ?? 0;
		if (event.durationMs > 0 && (!slowestEvent || event.durationMs > slowestEvent.durationMs)) {
			slowestEvent = event;
		}
	}
	const totalCostUsd = Math.max(0, params.detail.metrics.total_cost_usd);

	return {
		turns,
		events,
		totalActiveDurationMs: turns.reduce((sum, turn) => sum + turn.durationMs, 0),
		totalCostUsd,
		attributedCostUsd,
		costDifferenceUsd: totalCostUsd - attributedCostUsd,
		slowestEvent
	};
}
