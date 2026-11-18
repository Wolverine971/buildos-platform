// packages/shared-agent-ops/src/knowledge/task-entity-bridge.test.ts
import { describe, expect, it } from 'vitest';
import {
	planTaskEntityKnowledge,
	withoutTaskEntityRefs,
	type TaskEntityRowForKnowledge
} from './task-entity-bridge';

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

	it('never files places on its own, only one asked for, with its address and phone', () => {
		const rows = [
			row({
				id: 'pl',
				kind: 'place',
				value: '7609 Energy Pkwy, Baltimore',
				display: 'Murtech'
			}),
			row({ id: 'p', kind: 'person', value: 'Tom Mann', display: 'Tom Mann' }),
			row({
				id: 'ph',
				kind: 'phone',
				value: '+14105550100',
				display: '410-555-0100',
				about: 'Murtech'
			}),
			row({
				id: 'em',
				kind: 'email',
				value: 'x@murtech.com',
				display: 'x@murtech.com',
				about: 'Murtech'
			})
		];
		const automatic = planTaskEntityKnowledge({ id: 't', title: 'Visit Murtech' }, rows);
		expect(automatic.entities.map((e) => e.kind)).toEqual(['person']);

		const asked = planTaskEntityKnowledge({ id: 't', title: 'Visit Murtech' }, rows, {
			onlyRowIds: ['pl'],
			includePlaces: true
		});
		expect(asked.entities).toEqual([{ ref: 'tpl', kind: 'place', name: 'Murtech' }]);
		expect(asked.facts.map((f) => [f.predicate, f.value])).toEqual([
			['address', '7609 Energy Pkwy, Baltimore'],
			['phone', '+14105550100'] // a place has no email
		]);
		expect(asked.links?.map((l) => l.entity)).toEqual(['tpl']);
	});

	it('drops hidden names with every fact and link that touches them', () => {
		const batch = planTaskEntityKnowledge({ id: 't', title: 'Pitch Casey' }, [
			row({
				id: 'p',
				kind: 'person',
				value: 'Casey',
				display: 'Casey',
				about: 'Dauntless Dogs'
			}),
			row({ id: 'o', kind: 'org', value: 'Dauntless Dogs', display: 'Dauntless Dogs' })
		]);
		const kept = withoutTaskEntityRefs(batch, new Set(['to']));
		expect(kept.entities.map((e) => e.ref)).toEqual(['tp']);
		expect(kept.facts).toEqual([]); // the works_at pointed at the hidden org
		expect(kept.links?.map((l) => l.entity)).toEqual(['tp']);
	});
});
