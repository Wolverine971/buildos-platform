// apps/web/src/lib/components/agent/agent-chat-operation-activity.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from './agent-chat.types';
import {
	getOperationActivityKey,
	upsertOperationActivityEntries
} from './agent-chat-operation-activity';

const startedOperation = {
	action: 'read',
	entity_type: 'project',
	entity_id: 'project-1',
	entity_name: 'Launch plan',
	status: 'start'
};

const completedOperation = {
	...startedOperation,
	status: 'success'
};

describe('agent chat operation activity helpers', () => {
	it('builds a stable operation key from action, entity type, and identity', () => {
		expect(getOperationActivityKey(startedOperation)).toBe('read:project:project-1');
		expect(
			getOperationActivityKey({
				action: 'list',
				entity_type: 'task',
				entity_name: 'tasks (3)'
			})
		).toBe('list:task:tasks (3)');
	});

	it('updates a pending operation activity when the same operation succeeds', () => {
		const startedActivities = upsertOperationActivityEntries(
			[],
			startedOperation,
			{
				message: 'Reading project: "Launch plan"',
				activityStatus: 'pending'
			},
			{
				createId: () => 'operation-1',
				now: new Date('2026-04-08T10:00:00.000Z')
			}
		);

		const nextActivities = upsertOperationActivityEntries(
			startedActivities,
			completedOperation,
			{
				message: 'Read project: "Launch plan"',
				activityStatus: 'completed'
			},
			{
				createId: () => 'operation-2',
				now: new Date('2026-04-08T10:00:05.000Z')
			}
		);

		expect(nextActivities).toHaveLength(1);
		expect(nextActivities[0]).toMatchObject({
			id: 'operation-1',
			content: 'Read project: "Launch plan"',
			activityType: 'operation',
			status: 'completed'
		});
		expect(nextActivities[0]?.metadata).toMatchObject({
			operationActivityKey: 'read:project:project-1',
			operationStatus: 'success'
		});
		expect(nextActivities[0]?.timestamp).toEqual(new Date('2026-04-08T10:00:00.000Z'));
	});

	it('appends success operations when no matching pending row exists', () => {
		const activities = upsertOperationActivityEntries(
			[],
			completedOperation,
			{
				message: 'Read project: "Launch plan"',
				activityStatus: 'completed'
			},
			{
				createId: () => 'operation-1'
			}
		);

		expect(activities).toHaveLength(1);
		expect(activities[0]).toMatchObject({
			id: 'operation-1',
			status: 'completed'
		});
	});

	it('starts a new row after a previous matching operation completed', () => {
		const previousActivities: ActivityEntry[] = [
			{
				id: 'operation-1',
				content: 'Read project: "Launch plan"',
				timestamp: new Date('2026-04-08T10:00:00.000Z'),
				activityType: 'operation',
				status: 'completed',
				metadata: {
					operation: completedOperation,
					operationActivityKey: 'read:project:project-1',
					operationStatus: 'success'
				}
			}
		];

		const activities = upsertOperationActivityEntries(
			previousActivities,
			startedOperation,
			{
				message: 'Reading project: "Launch plan"',
				activityStatus: 'pending'
			},
			{
				createId: () => 'operation-2'
			}
		);

		expect(activities).toHaveLength(2);
		expect(activities[1]).toMatchObject({
			id: 'operation-2',
			content: 'Reading project: "Launch plan"',
			status: 'pending'
		});
	});
});
