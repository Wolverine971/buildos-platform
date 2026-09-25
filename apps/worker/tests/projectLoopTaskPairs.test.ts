// apps/worker/tests/projectLoopTaskPairs.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ContextFinderDecider } from '@buildos/agentic-chat-runtime/context-finder';
import type { LoopTask } from '../src/workers/project-loop/generators';
import {
	buildTaskPairRequest,
	rankTaskConflictPairs,
	taskPairKey
} from '../src/workers/project-loop/taskPairs';

const task = (n: number, title = `Task ${n}`): LoopTask => ({
	id: `task-${n}`,
	title,
	description: null,
	state_key: 'todo',
	updated_at: '2026-09-20T00:00:00Z'
});
const project = { name: 'Book', description: 'A nonfiction book.' };

function decider(scores: Record<string, number>, ok = true) {
	const decide = vi.fn(async (request: { questions: Record<string, unknown> }) => {
		const receipt = {
			modelRequested: 'typesafe/jev-1.13',
			modelUsed: 'typesafe/jev-1.13',
			requestId: 'r',
			inputTokens: 10,
			outputTokens: 1,
			costUsd: 0.0002,
			durationMs: 300,
			requestBytes: 100,
			questionCount: Object.keys(request.questions).length,
			attempts: 1
		};
		if (!ok) return { ok: false as const, error: 'jev_timeout', receipt };
		return {
			ok: true as const,
			answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [
					key,
					{ type: 'noul', noul: scores[key] ?? 0.02 }
				])
			),
			receipt
		};
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

describe('buildTaskPairRequest', () => {
	it('asks one question per pair, for at most 20 tasks', () => {
		const { tasks, request } = buildTaskPairRequest({
			project,
			tasks: Array.from({ length: 25 }, (_, i) => task(i))
		});
		expect(tasks).toHaveLength(20);
		expect(Object.keys(request.questions)).toHaveLength(190);
		expect(request.questions[taskPairKey(0, 19)]).toBeDefined();
	});
});

describe('rankTaskConflictPairs', () => {
	it('keeps pairs near the top score, best first, including duplicates in different words', async () => {
		const { decider: jev } = decider({
			[taskPairKey(0, 1)]: 0.91,
			[taskPairKey(1, 2)]: 0.6,
			[taskPairKey(0, 2)]: 0.3
		});
		const pairs = await rankTaskConflictPairs({
			decider: jev,
			project,
			tasks: [
				task(0, 'Write the chapter blueprint'),
				task(1, 'Finish outlining every chapter'),
				task(2, 'Draft the manuscript')
			]
		});
		expect(pairs).toEqual([
			{
				taskAId: 'task-0',
				taskBId: 'task-1',
				score: 0.91,
				reasons: ['review relevance 0.91']
			},
			{ taskAId: 'task-1', taskBId: 'task-2', score: 0.6, reasons: ['review relevance 0.60'] }
		]);
	});

	it('returns null when Jev cannot answer, and no call at all for fewer than two tasks', async () => {
		const failing = decider({}, false);
		expect(
			await rankTaskConflictPairs({
				decider: failing.decider,
				project,
				tasks: [task(0), task(1)]
			})
		).toBeNull();
		expect(
			await rankTaskConflictPairs({ decider: null, project, tasks: [task(0), task(1)] })
		).toBeNull();
		const idle = decider({});
		expect(
			await rankTaskConflictPairs({ decider: idle.decider, project, tasks: [task(0)] })
		).toEqual([]);
		expect(idle.decide).not.toHaveBeenCalled();
	});
});
