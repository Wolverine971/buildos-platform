// packages/shared-agent-ops/src/knowledge/task-entity-bridge.test.ts
import { describe, expect, it } from 'vitest';
import { planTaskEntityKnowledge, type TaskEntityRowForKnowledge } from './task-entity-bridge';

const row = (over: Partial<TaskEntityRowForKnowledge>): TaskEntityRowForKnowledge => ({
	id: over.id ?? Math.random().toString(36).slice(2),
	kind: 'person',
	natural_key: '',
	value: '',
	display: '',
	role: 'primary',
	about: null,
	quote: null,
	status: 'suggested',
	...over
});

describe('planTaskEntityKnowledge', () => {
	it('turns task people and orgs into linked entries with their contacts', () => {
		const batch = planTaskEntityKnowledge({ id: 'task-1', title: 'Pitch Casey' }, [
			row({
				id: 'p',
				kind: 'person',
				natural_key: 'casey fenske',
				value: 'Casey Fenske',
				display: 'Casey Fenske',
				about: 'Dauntless Dogs',
				quote: 'Casey Fenske at Dauntless Dogs'
			}),
			row({
				id: 'o',
				kind: 'org',
				natural_key: 'dauntless dogs',
				value: 'Dauntless Dogs',
				display: 'Dauntless Dogs'
			}),
			row({
				id: 'ph',
				kind: 'phone',
				natural_key: '+14103606761',
				value: '+14103606761',
				display: '410-360-6761',
				about: 'Casey Fenske'
			}),
			row({
				id: 'me',
				kind: 'person',
				natural_key: 'dj wayne',
				value: 'DJ Wayne',
				display: 'DJ Wayne',
				role: 'owner_self'
			}),
			row({
				id: 'x',
				kind: 'org',
				natural_key: 'nope',
				value: 'Nope',
				display: 'Nope',
				status: 'dismissed'
			}),
			row({
				id: 'pl',
				kind: 'place',
				natural_key: 'glen burnie',
				value: 'Glen Burnie',
				display: 'Glen Burnie'
			})
		]);
		expect(batch.entities.map((e) => `${e.kind}:${e.name}`)).toEqual([
			'person:Casey Fenske',
			'org:Dauntless Dogs'
		]);
		expect(batch.facts).toEqual([
			expect.objectContaining({
				subject: 'tp',
				predicate: 'works_at',
				object: 'to',
				sources: ['task']
			}),
			expect.objectContaining({ subject: 'tp', predicate: 'phone', value: '+14103606761' })
		]);
		expect(batch.links).toEqual([
			{
				entity: 'tp',
				record_kind: 'task',
				record_id: 'task-1',
				quote: 'Casey Fenske at Dauntless Dogs'
			},
			{ entity: 'to', record_kind: 'task', record_id: 'task-1' }
		]);
		expect(batch.sources).toEqual([
			{ ref: 'task', type: 'task', record_id: 'task-1', title: 'Pitch Casey' }
		]);
	});

	it('returns nothing to write when a task names nobody', () => {
		expect(
			planTaskEntityKnowledge({ id: 't', title: 'x' }, [row({ kind: 'time' })]).entities
		).toEqual([]);
	});
});
