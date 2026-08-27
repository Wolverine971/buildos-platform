// apps/web/scripts/profile-agent-chat-timeline.ts
import { performance } from 'node:perf_hooks';
import type {
	ActivityEntry,
	AgentTimelineItem,
	ThinkingBlockMessage,
	UIMessage
} from '../src/lib/components/agent/agent-chat.types';
import {
	mergeAgentTimelineItems,
	timelineItemsFromMessages
} from '../src/lib/components/agent/agent-chat-timeline';

const SESSION_ID = 'profile-session';
const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 600;

interface ProfileResult {
	scenario: string;
	turns: number;
	messages: number;
	liveItems: number;
	mergedItems: number;
	meanMs: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	maxMs: number;
	frameBudgetPercentP95: number;
}

interface ProfileScenario {
	label: string;
	turns: number;
	activitiesPerTurn: number;
	persistedOnlyItems: number;
}

const SCENARIOS: ProfileScenario[] = [
	{ label: 'typical', turns: 10, activitiesPerTurn: 3, persistedOnlyItems: 20 },
	{
		label: 'observed maximum',
		turns: 35,
		activitiesPerTurn: 2,
		persistedOnlyItems: 75
	},
	{ label: 'long', turns: 50, activitiesPerTurn: 3, persistedOnlyItems: 100 },
	{ label: 'very long', turns: 100, activitiesPerTurn: 3, persistedOnlyItems: 200 },
	{
		label: 'restore API caps',
		turns: 200,
		activitiesPerTurn: 5,
		persistedOnlyItems: 1_005
	}
];

function timestamp(offsetMs: number): Date {
	return new Date(Date.UTC(2026, 7, 27, 12, 0, 0, offsetMs));
}

function activity(turn: number, index: number): ActivityEntry {
	return {
		id: `activity-${turn}-${index}`,
		content: `Read project context ${turn}.${index}`,
		timestamp: timestamp(turn * 10_000 + 1_000 + index),
		activityType: 'tool_call',
		status: 'completed',
		toolCallId: `tool-call-${turn}-${index}`,
		metadata: {
			toolName: 'read_project_context',
			gatewayOp: 'onto.project.read'
		}
	};
}

function messageFixture(turns: number, activitiesPerTurn: number): UIMessage[] {
	const messages: UIMessage[] = [];

	for (let turn = 0; turn < turns; turn += 1) {
		messages.push({
			id: `user-${turn}`,
			type: 'user',
			role: 'user',
			content: `User request ${turn}`,
			timestamp: timestamp(turn * 10_000)
		});

		messages.push({
			id: `thinking-${turn}`,
			type: 'thinking_block',
			content: 'BuildOS is working',
			timestamp: timestamp(turn * 10_000 + 1_000),
			activities: Array.from({ length: activitiesPerTurn }, (_, index) =>
				activity(turn, index)
			),
			status: 'completed'
		} satisfies ThinkingBlockMessage);

		messages.push({
			id: `assistant-${turn}`,
			type: 'assistant',
			role: 'assistant',
			content: `Assistant response ${turn}`,
			timestamp: timestamp(turn * 10_000 + 2_000)
		});
	}

	return messages;
}

function persistedFixture(itemCount: number): AgentTimelineItem[] {
	return Array.from({ length: itemCount }, (_, index) => ({
		id: `persisted-${index}`,
		sessionId: SESSION_ID,
		source: index % 2 === 0 ? 'turn_run' : 'turn_event',
		kind: 'step',
		status: 'completed',
		timestamp: timestamp(index * 5_000).toISOString(),
		sequenceIndex: index,
		title: `Persisted step ${index}`,
		entityRefs: []
	}));
}

function percentile(sorted: number[], fraction: number): number {
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function round(value: number): number {
	return Number(value.toFixed(3));
}

function profile(scenario: ProfileScenario): ProfileResult {
	const { label, turns, activitiesPerTurn, persistedOnlyItems } = scenario;
	let messages = messageFixture(turns, activitiesPerTurn);
	const persisted = persistedFixture(persistedOnlyItems);
	const assistantIndex = messages.length - 1;
	let liveItems = timelineItemsFromMessages(SESSION_ID, messages);
	let mergedItems = mergeAgentTimelineItems(persisted, liveItems);
	const samples: number[] = [];

	for (let frame = 0; frame < WARMUP_FRAMES + MEASURED_FRAMES; frame += 1) {
		const nextMessages = [...messages];
		const assistant = nextMessages[assistantIndex];
		nextMessages[assistantIndex] = {
			...assistant,
			content: `${assistant.content} ok`
		};

		const startedAt = performance.now();
		liveItems = timelineItemsFromMessages(SESSION_ID, nextMessages);
		mergedItems = mergeAgentTimelineItems(persisted, liveItems);
		mergedItems.filter((item) => item.kind !== 'message').length;
		const elapsedMs = performance.now() - startedAt;

		if (frame >= WARMUP_FRAMES) samples.push(elapsedMs);
		messages = nextMessages;
	}

	const sorted = samples.toSorted((left, right) => left - right);
	const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
	const p95 = percentile(sorted, 0.95);

	return {
		scenario: label,
		turns,
		messages: messages.length,
		liveItems: liveItems.length,
		mergedItems: mergedItems.length,
		meanMs: round(mean),
		p50Ms: round(percentile(sorted, 0.5)),
		p95Ms: round(p95),
		p99Ms: round(percentile(sorted, 0.99)),
		maxMs: round(sorted.at(-1) ?? 0),
		frameBudgetPercentP95: round((p95 / (1000 / 60)) * 100)
	};
}

console.log(
	`Agent timeline streaming profile (${MEASURED_FRAMES} measured frames after ${WARMUP_FRAMES} warmups)`
);
console.table(SCENARIOS.map(profile));
console.log(
	'Numbers cover timelineItemsFromMessages → mergeAgentTimelineItems → exportable-step filter only; DOM rendering is intentionally excluded.'
);
