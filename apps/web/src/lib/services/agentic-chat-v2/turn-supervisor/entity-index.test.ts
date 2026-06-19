// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/entity-index.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildTurnSupervisorEntityIndexFromContextData,
	findEntityIndexEntry
} from './entity-index';

describe('buildTurnSupervisorEntityIndexFromContextData', () => {
	it('indexes project context entities by kind and id', () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const goalId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		const taskId = 'c7441a46-a892-429d-ac1d-8814db45c650';

		const entries = buildTurnSupervisorEntityIndexFromContextData({
			project: { id: projectId, name: 'The Last Ember' },
			goals: [{ id: goalId, name: 'Complete The Last Ember Novel Development' }],
			tasks: [{ id: taskId, title: 'Outline the first three chapters' }]
		});

		expect(findEntityIndexEntry(entries, projectId)).toMatchObject({
			kind: 'project',
			label: 'The Last Ember'
		});
		expect(findEntityIndexEntry(entries, goalId)).toMatchObject({
			kind: 'goal',
			label: 'Complete The Last Ember Novel Development'
		});
		expect(findEntityIndexEntry(entries, taskId)).toMatchObject({
			kind: 'task',
			label: 'Outline the first three chapters'
		});
	});

	it('indexes entities nested inside global project bundles', () => {
		const projectId = '0bfe69dd-53a4-4996-9826-1882b5d4ca2a';
		const milestoneId = 'ba76d79f-2ed6-46cc-8f1b-cee6ace471e0';

		const entries = buildTurnSupervisorEntityIndexFromContextData({
			projects: [
				{
					project: { id: projectId, name: 'Novel Launch' },
					milestones: [{ id: milestoneId, title: 'January drafting milestone' }]
				}
			]
		});

		expect(findEntityIndexEntry(entries, milestoneId)).toMatchObject({
			kind: 'milestone',
			label: 'January drafting milestone',
			projectId,
			projectName: 'Novel Launch'
		});
	});
});
