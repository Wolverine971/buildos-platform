// packages/agentic-chat-client/src/agent-chat-step-details.test.ts
import { describe, expect, it } from 'vitest';
import { buildStepDetails, buildTurnReceipt, formatChangeDate } from './agent-chat-step-details';
import type { ActivityEntry } from './agent-chat.types';

const P = '11111111-1111-4111-8111-111111111111';
const T = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-07T15:00:00Z');

function step(metadata: Record<string, unknown>): ActivityEntry {
	return {
		id: 'a1',
		content: '',
		timestamp: NOW,
		activityType: 'tool_call',
		status: 'completed',
		metadata
	} as ActivityEntry;
}

describe('buildStepDetails', () => {
	it('shows an update with its record link, before → after and the words it came from', () => {
		const details = buildStepDetails(
			step({
				sourceQuote: 'push the lease to Monday',
				durationMs: 412,
				affectedEntities: [
					{
						kind: 'task',
						id: T,
						title: 'Sign the bakery lease',
						projectId: P,
						operation: 'updated'
					}
				],
				result: {
					task: { id: T, title: 'Sign the bakery lease', project_id: P },
					field_changes: [
						{
							field: 'due_at',
							before: '2026-11-04T00:00:00+00:00',
							after: '2026-11-09'
						},
						{ field: 'priority', before: 3, after: 2 }
					]
				}
			}),
			{ now: NOW, timeZone: 'UTC' }
		);
		expect(details.action).toBe('updated');
		expect(details.entities).toEqual([
			{
				kind: 'task',
				id: T,
				title: 'Sign the bakery lease',
				projectId: P,
				href: `/projects/${P}/tasks/${T}`
			}
		]);
		expect(details.changes).toEqual([
			{ field: 'due_at', label: 'Due', before: 'Nov 4', after: 'Nov 9' },
			{ field: 'priority', label: 'Priority', before: 'Medium', after: 'High' }
		]);
		expect(details.quote).toBe('push the lease to Monday');
		expect(details.durationMs).toBe(412);
	});

	it('reads an archive as its own action', () => {
		const details = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'task', id: T, title: 'Old task', projectId: P, operation: 'updated' }
				],
				result: {
					field_changes: [
						{ field: 'archived_at', before: null, after: '2026-11-07T15:00:00Z' }
					]
				}
			}),
			{ now: NOW }
		);
		expect(details.action).toBe('archived');
		expect(details.changes).toEqual([]);
	});

	it('names the records a read returned, linking goals into the project editor', () => {
		const details = buildStepDetails(
			step({
				affectedEntities: [],
				result: {
					project_id: P,
					goals: [{ id: 'g1', name: 'Open by March' }],
					documents: [{ id: D, title: 'Menu draft' }]
				}
			}),
			{ now: NOW }
		);
		expect(details.action).toBeNull();
		expect(details.entities.map((entity) => entity.href)).toEqual([
			`/projects/${P}?entity=goal&entity_id=g1`,
			`/projects/${P}/documents/${D}`
		]);
	});

	it('caps the list and counts the rest', () => {
		const tasks = Array.from({ length: 7 }, (_, i) => ({
			id: `t${i}`,
			title: `Task ${i}`,
			project_id: P
		}));
		const details = buildStepDetails(step({ result: { tasks } }), { now: NOW });
		expect(details.entities).toHaveLength(4);
		expect(details.more).toBe(3);
	});

	it('carries a document body edit size', () => {
		const details = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'document', id: D, title: 'Menu', projectId: P, operation: 'updated' }
				],
				result: { document_change: { lines_added: 12, lines_removed: 3 } }
			}),
			{ now: NOW }
		);
		expect(details.docChange).toEqual({ added: 12, removed: 3 });
	});
});

describe('buildTurnReceipt', () => {
	it('counts records once, and a record changed is not also counted as read', () => {
		const update = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'task', id: T, title: 'A', projectId: P, operation: 'updated' }
				]
			})
		);
		const create = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'document', id: D, title: 'B', projectId: P, operation: 'created' }
				]
			})
		);
		const read = buildStepDetails(
			step({
				result: {
					tasks: [
						{ id: T, title: 'A', project_id: P },
						{ id: 't2', title: 'C', project_id: P }
					]
				}
			})
		);
		// A list names records without opening them: it adds nothing to "read".
		expect(buildTurnReceipt([read, update, create])).toEqual({
			created: 1,
			updated: 1,
			archived: 0,
			deleted: 0,
			read: 0
		});
	});

	it('counts as read only records a step opened, however long a list was', () => {
		const list = buildStepDetails(
			step({
				result: {
					tasks: Array.from({ length: 50 }, (_, i) => ({
						id: `t${i}`,
						title: `Task ${i}`,
						project_id: P
					}))
				}
			})
		);
		const details = buildStepDetails(
			step({
				result: {
					task: { id: T, title: 'A', project_id: P },
					project: { id: P, name: 'Bakery' }
				}
			})
		);
		const section = buildStepDetails(
			step({
				result: {
					document_id: D,
					project_id: P,
					title: 'Radar',
					content: '## New\nA thing',
					sections: [{ heading: 'New', anchor: 'new' }]
				}
			})
		);
		const outline = buildStepDetails(
			step({ result: { document_id: D, title: 'Radar', outline: [{ heading: 'New' }] } })
		);
		expect(list.opened).toEqual([]);
		expect(details.opened.map((entity) => entity.id)).toEqual([T]);
		expect(section.opened.map((entity) => entity.id)).toEqual([D]);
		expect(section.openedSections).toEqual(['New']);
		expect(outline.opened).toEqual([]);
		expect(buildTurnReceipt([list, details, section, outline]).read).toBe(2);
	});

	it('counts changes to records with no page, such as calendar events', () => {
		const event = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'event', id: 'e1', title: 'Dentist', operation: 'created' },
					{ kind: 'event', id: 'e2', title: 'Lease signing', operation: 'created' }
				]
			})
		);
		expect(event.action).toBe('created');
		expect(event.others).toEqual([
			{ kind: 'event', id: 'e1', title: 'Dentist' },
			{ kind: 'event', id: 'e2', title: 'Lease signing' }
		]);
		expect(buildTurnReceipt([event]).created).toBe(2);
	});

	it('a held change saved nothing: no action, no before → after, nothing in the receipt', () => {
		const held = buildStepDetails(
			step({
				requiresUserAction: true,
				sourceQuote: 'rename the menu doc',
				affectedEntities: [
					{ kind: 'document', id: D, title: 'Menu', projectId: P, operation: 'updated' }
				],
				result: { field_changes: [{ field: 'title', before: 'Menu', after: 'Menus' }] }
			})
		);
		expect(held.held).toBe(true);
		expect(held.action).toBeNull();
		expect(held.intended).toBe('updated');
		expect(held.changes).toEqual([]);
		expect(buildTurnReceipt([held])).toEqual({
			created: 0,
			updated: 0,
			archived: 0,
			deleted: 0,
			read: 0
		});
	});

	it('gives a deleted record no link and counts it as deleted', () => {
		const deleted = buildStepDetails(
			step({
				affectedEntities: [
					{ kind: 'task', id: T, title: 'A', projectId: P, operation: 'deleted' }
				]
			})
		);
		expect(deleted.entities[0]!.href).toBeNull();
		expect(buildTurnReceipt([deleted])).toMatchObject({ archived: 1, deleted: 1 });
	});
});

describe('formatChangeDate', () => {
	it('adds the year only outside this one, and a time only when one is set', () => {
		expect(formatChangeDate('2027-01-05', NOW)).toBe('Jan 5, 2027');
		expect(formatChangeDate('2026-11-09T14:30:00Z', NOW, 'UTC')).toBe('Nov 9, 2:30 PM');
		// Midnight UTC is a whole day in any zone.
		expect(formatChangeDate('2026-11-04T00:00:00+00:00', NOW, 'America/New_York')).toBe(
			'Nov 4'
		);
	});
});
