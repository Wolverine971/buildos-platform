// docs/research/specialist-quality-2026-09-21/source-bound-claims.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildCatalog,
	bindQuote,
	checkOverdueClaim,
	renderSelection
} from './source-bound-claims.mjs';
const packet = {
	projectId: 'synthetic',
	loadedAt: '2026-09-21T05:00:00Z',
	coverage: { tasks: { state: 'loaded' } },
	data: {
		project: { id: 'p', name: 'Workshop' },
		tasks: [
			{ id: 'past', title: 'Permit', state_key: 'todo', due_at: '2026-09-16T03:59:59Z' },
			{
				id: 'future',
				title: 'Inspection',
				state_key: 'todo',
				due_at: '2026-10-01T03:59:59Z'
			},
			{ id: 'done', title: 'Room', state_key: 'done', due_at: '2026-09-01T03:59:59Z' }
		],
		documents: [
			{ id: 'd', title: 'Plan', content: '🚀 Approval pending. Do not claim approval.' }
		]
	}
};
const catalog = buildCatalog(packet);
const aliases = catalog.sources.filter((s) => s.family === 'tasks').map((s) => s.alias);
const doc = catalog.sources.find((s) => s.id === 'd');
test('binds only exact excerpts and supplies host hashes and UTF-16 spans', () => {
	const claim = bindQuote(catalog, {
		source: doc.alias,
		field: '/content',
		quote: 'Approval pending.'
	});
	assert.equal(claim.span.start, 3);
	assert.equal(claim.sourceHash, doc.hash);
	assert.equal(claim.semanticParaphraseVerified, false);
	assert.throws(
		() =>
			bindQuote(catalog, {
				source: doc.alias,
				field: '/content',
				quote: 'Approval granted.'
			}),
		/quote_not_present/
	);
	assert.throws(
		() =>
			bindQuote(catalog, {
				source: doc.alias,
				field: '/content',
				quote: 'Approval pending.',
				hash: doc.hash
			}),
		/quote_shape_invalid/
	);
});
test('rejects ambiguous quotes, absent fields, unknown sources and injected paths', () => {
	const c = buildCatalog({ ...packet, data: { documents: [{ id: 'd', content: 'same same' }] } });
	assert.throws(
		() => bindQuote(c, { source: 'S1', field: '/content', quote: 'same' }),
		/ambiguous/
	);
	assert.throws(
		() => bindQuote(catalog, { source: 'S1', field: '/content', quote: 'x' }),
		/unavailable/
	);
	assert.throws(
		() => bindQuote(catalog, { source: 'unknown', field: '/content', quote: 'x' }),
		/unknown_source/
	);
	assert.throws(
		() => bindQuote(catalog, { source: 'S1', field: '/__proto__', quote: 'x' }),
		/field_not_allowed/
	);
});
test('date arithmetic rejects all-overdue and excludes completed tasks', () => {
	const result = checkOverdueClaim(catalog, { relation: 'all', sources: aliases });
	assert.equal(result.outcome, 'contradicted');
	assert.equal(result.count, 1);
	assert.equal(
		checkOverdueClaim(catalog, { relation: 'some', sources: aliases }).outcome,
		'supported'
	);
	assert.equal(
		checkOverdueClaim(catalog, { relation: 'none', sources: [aliases[1]] }).outcome,
		'supported'
	);
});
test('missing due time gives uncertainty; partial evidence never becomes global absence', () => {
	const c = buildCatalog({ ...packet, data: { tasks: [{ id: 'unknown', state_key: 'todo' }] } });
	const result = checkOverdueClaim(c, { relation: 'none', sources: ['S1'] });
	assert.equal(result.outcome, 'insufficient');
	assert.equal(result.unknown, 1);
	assert.match(result.rendered, /these 1 cited tasks/);
});
test('frozen source hashes change with evidence and cannot be replaced by caller mutation', () => {
	const p = structuredClone(packet),
		c = buildCatalog(p),
		hash = c.sources[0].hash;
	p.data.project.name = 'Changed';
	assert.equal(c.sources[0].record.name, 'Workshop');
	assert.notEqual(buildCatalog(p).sources[0].hash, hash);
	assert.throws(() => {
		c.sources[0].record.name = 'Changed';
	}, TypeError);
});
test('editor can arrange accepted units but cannot add prose or unknown claims', () => {
	const claim = checkOverdueClaim(catalog, { relation: 'all', sources: aliases });
	assert.equal(renderSelection({ C1: claim }, ['C1']), claim.rendered);
	assert.throws(() => renderSelection({ C1: claim }, ['All tasks are overdue']), /unknown_claim/);
	assert.throws(() => renderSelection({ C1: claim }, ['C1', 'C1']), /selection_invalid/);
});
