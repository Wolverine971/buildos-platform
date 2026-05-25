// apps/web/src/lib/services/admin/chat-session-audit-timeline.ts
import { truncateText } from './chat-session-audit-formatters';
import { payloadField, stringValue, toNumericValue } from './chat-session-audit-payload';
import type {
	AuditTimelineEvent,
	AuditTimelineType,
	SessionTurnRun,
	TimelineGroup,
	TimelineGroupCounts
} from './chat-session-audit-types';

export type VisibleTimelineFilters = {
	eventTypeFilters: Record<AuditTimelineType, boolean>;
	showOnlyErrors: boolean;
	search: string;
};

export function eventTypeLabel(type: AuditTimelineType): string {
	switch (type) {
		case 'session':
			return 'Session';
		case 'message':
			return 'Message';
		case 'tool_execution':
			return 'Tool';
		case 'llm_call':
			return 'LLM';
		case 'operation':
			return 'Operation';
		case 'context_shift':
			return 'Context Shift';
		case 'timing':
			return 'Timing';
		case 'turn_run':
			return 'Turn Run';
		case 'prompt_snapshot':
			return 'Prompt Snapshot';
		case 'turn_event':
			return 'Turn Event';
		case 'eval_run':
			return 'Eval Run';
		default:
			return type;
	}
}

export function turnEventName(event: AuditTimelineEvent): string {
	if (event.type !== 'turn_event') return '';
	return stringValue(payloadField(event.payload ?? {}, 'event_type'));
}

export function isSupervisorTimelineEvent(event: AuditTimelineEvent): boolean {
	return event.type === 'turn_event' && turnEventName(event).startsWith('supervisor_');
}

export function isReplayVisibleEvent(event: AuditTimelineEvent): boolean {
	if (event.type !== 'turn_event') return true;
	return turnEventName(event) !== 'prompt_snapshot_created';
}

export function buildReplayTimeline(
	events: AuditTimelineEvent[] | null | undefined
): AuditTimelineEvent[] {
	if (!events?.length) return [];
	return events.filter(isReplayVisibleEvent);
}

export function buildVisibleTimeline(
	events: AuditTimelineEvent[],
	filters: VisibleTimelineFilters
): AuditTimelineEvent[] {
	if (!events.length) return [];
	const query = filters.search.trim().toLowerCase();
	return events.filter((event) => {
		if (!filters.eventTypeFilters[event.type]) return false;
		if (filters.showOnlyErrors && event.severity !== 'error') return false;
		if (!query) return true;
		const haystack =
			`${event.title} ${event.summary} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
		return haystack.includes(query);
	});
}

export function timelineEventPriority(event: AuditTimelineEvent): number {
	switch (event.type) {
		case 'session':
			return 0;
		case 'message':
			return 1;
		case 'prompt_snapshot':
			return 2;
		case 'llm_call':
			return 3;
		case 'turn_event':
			return 4;
		case 'tool_execution':
			return 5;
		case 'operation':
			return 6;
		case 'eval_run':
			return 7;
		case 'context_shift':
			return 8;
		case 'timing':
			return 9;
		case 'turn_run':
		default:
			return 10;
	}
}

export function timelineEventSequence(event: AuditTimelineEvent): number | null {
	const payload = event.payload ?? {};
	return toNumericValue(payloadField(payload, 'sequence_index'));
}

export function compareTimelineEvents(a: AuditTimelineEvent, b: AuditTimelineEvent): number {
	if (a.timestamp !== b.timestamp) {
		return a.timestamp < b.timestamp ? -1 : 1;
	}

	const aSequence = timelineEventSequence(a);
	const bSequence = timelineEventSequence(b);
	if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
		return aSequence - bSequence;
	}
	if (aSequence !== null && bSequence === null) return -1;
	if (aSequence === null && bSequence !== null) return 1;

	const priorityDifference = timelineEventPriority(a) - timelineEventPriority(b);
	if (priorityDifference !== 0) return priorityDifference;

	return a.id.localeCompare(b.id);
}

export function compareTimelineGroups(a: TimelineGroup, b: TimelineGroup): number {
	if (a.timestamp !== b.timestamp) {
		return a.timestamp < b.timestamp ? -1 : 1;
	}

	if (a.turnIndex !== null && b.turnIndex !== null && a.turnIndex !== b.turnIndex) {
		return a.turnIndex - b.turnIndex;
	}

	if (a.turnIndex === null && b.turnIndex !== null) return -1;
	if (a.turnIndex !== null && b.turnIndex === null) return 1;

	return a.id.localeCompare(b.id);
}

export function createEmptyTimelineGroupCounts(): TimelineGroupCounts {
	return {
		total: 0,
		messages: 0,
		promptSnapshots: 0,
		llmCalls: 0,
		toolExecutions: 0,
		turnEvents: 0,
		operations: 0,
		evalRuns: 0,
		errors: 0
	};
}

export function applyEventToTimelineGroup(
	counts: TimelineGroupCounts,
	event: AuditTimelineEvent
): void {
	counts.total += 1;

	switch (event.type) {
		case 'message':
			counts.messages += 1;
			break;
		case 'prompt_snapshot':
			counts.promptSnapshots += 1;
			break;
		case 'llm_call':
			counts.llmCalls += 1;
			break;
		case 'tool_execution':
			counts.toolExecutions += 1;
			break;
		case 'turn_event':
			counts.turnEvents += 1;
			break;
		case 'operation':
			counts.operations += 1;
			break;
		case 'eval_run':
			counts.evalRuns += 1;
			break;
	}

	if (event.severity === 'error') {
		counts.errors += 1;
	}
}

export function createStandaloneTimelineGroup(event: AuditTimelineEvent): TimelineGroup {
	const counts = createEmptyTimelineGroupCounts();
	applyEventToTimelineGroup(counts, event);

	return {
		id: `standalone:${event.id}`,
		kind: 'standalone',
		title: event.title,
		summary: event.summary,
		timestamp: event.timestamp,
		severity: event.severity,
		turnIndex: event.turn_index,
		run: null,
		items: [event],
		counts
	};
}

export function createTurnTimelineGroup(
	turnIndex: number,
	run: SessionTurnRun | null,
	headerEvent: AuditTimelineEvent | null
): TimelineGroup {
	return {
		id: `turn:${turnIndex}`,
		kind: 'turn',
		title: headerEvent?.title ?? `Turn ${turnIndex}: ${run?.status ?? 'recorded'}`,
		summary: headerEvent?.summary ?? '',
		timestamp: headerEvent?.timestamp ?? run?.started_at ?? '',
		severity:
			headerEvent?.severity ??
			(run?.status === 'failed' ? 'error' : run?.status === 'cancelled' ? 'warning' : 'info'),
		turnIndex,
		run,
		items: [],
		counts: createEmptyTimelineGroupCounts()
	};
}

export function groupRequestPreview(group: TimelineGroup): string {
	if (group.kind !== 'turn') {
		return truncateText(group.summary || group.items[0]?.summary || '');
	}

	const userMessage = group.items.find((event) => {
		if (event.type !== 'message') return false;
		return stringValue(payloadField(event.payload ?? {}, 'role')) === 'user';
	});

	const requestText =
		stringValue(payloadField(userMessage?.payload ?? {}, 'content')) ||
		group.run?.request_message ||
		group.summary;

	return truncateText(requestText, 260);
}

export function buildVisibleTimelineGroups(
	events: AuditTimelineEvent[],
	turnRuns: SessionTurnRun[]
): TimelineGroup[] {
	const turnGroups = new Map<number, TimelineGroup>();
	const turnRunByIndex = new Map<number, SessionTurnRun>(
		turnRuns.map((run) => [run.turn_index, run])
	);
	const groups: TimelineGroup[] = [];

	for (const event of [...events].sort(compareTimelineEvents)) {
		if (event.turn_index === null) {
			groups.push(createStandaloneTimelineGroup(event));
			continue;
		}

		let group = turnGroups.get(event.turn_index);
		if (!group) {
			group = createTurnTimelineGroup(
				event.turn_index,
				turnRunByIndex.get(event.turn_index) ?? null,
				event.type === 'turn_run' ? event : null
			);
			turnGroups.set(event.turn_index, group);
			groups.push(group);
		}

		if (event.type === 'turn_run') {
			group.title = event.title;
			group.summary = event.summary;
			group.timestamp = event.timestamp;
			group.severity = event.severity;
			continue;
		}

		group.items.push(event);
		applyEventToTimelineGroup(group.counts, event);
	}

	return groups.sort(compareTimelineGroups);
}
