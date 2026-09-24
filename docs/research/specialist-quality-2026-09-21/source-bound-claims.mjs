// docs/research/specialist-quality-2026-09-21/source-bound-claims.mjs
// Research prototype only. No runtime imports, provider calls, permissions or database writes.
import { createHash } from 'node:crypto';

const FAMILIES = [
	'project',
	'start_here',
	'goals',
	'milestones',
	'plans',
	'tasks',
	'documents',
	'risks',
	'relationships',
	'activity',
	'prior_suggestions'
];
const QUOTE_FIELDS = new Set([
	'/title',
	'/name',
	'/description',
	'/content',
	'/state_key',
	'/due_at'
]);
const ACTIVE_TASK_STATES = new Set(['todo', 'in_progress', 'blocked']);
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
			.join(',')}}`;
	return JSON.stringify(value);
}
function freeze(value) {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(freeze);
		Object.freeze(value);
	}
	return value;
}
function instant(value) {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
	)
		return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}
export function buildCatalog(packet) {
	if (Buffer.byteLength(JSON.stringify(packet)) > 64000) throw new Error('packet_too_large');
	if (instant(packet.loadedAt) === null) throw new Error('snapshot_time_invalid');
	const frozen = freeze(structuredClone(packet));
	const sources = [];
	for (const family of FAMILIES) {
		const value = frozen.data?.[family];
		const records = Array.isArray(value) ? value : value ? [value] : [];
		for (const record of records) {
			if (!record || typeof record.id !== 'string') continue;
			const source = {
				alias: `S${sources.length + 1}`,
				family,
				id: record.id,
				title: record.title ?? record.name ?? record.id,
				record,
				hash: createHash('sha256')
					.update(
						canonical({
							projectId: frozen.projectId,
							loadedAt: frozen.loadedAt,
							family,
							record,
							coverage: frozen.coverage
						})
					)
					.digest('hex')
			};
			sources.push(freeze(source));
		}
	}
	return freeze({ packet: frozen, sources });
}
function sourceFor(catalog, alias) {
	const source = catalog.sources.find((s) => s.alias === alias);
	if (!source) throw new Error('unknown_source');
	return source;
}
export function bindQuote(catalog, input) {
	if (Object.keys(input).sort().join(',') !== 'field,quote,source')
		throw new Error('quote_shape_invalid');
	if (!QUOTE_FIELDS.has(input.field)) throw new Error('field_not_allowed');
	if (typeof input.quote !== 'string' || !input.quote.trim() || input.quote.length > 600)
		throw new Error('quote_bounds');
	const source = sourceFor(catalog, input.source);
	const text = source.record[input.field.slice(1)];
	if (typeof text !== 'string') throw new Error('source_field_unavailable');
	const start = text.indexOf(input.quote);
	if (start < 0) throw new Error('quote_not_present');
	if (text.indexOf(input.quote, start + 1) >= 0) throw new Error('quote_ambiguous');
	// A field quote establishes what the source says, not a model-authored paraphrase.
	return freeze({
		kind: 'source_excerpt',
		source: source.alias,
		sourceHash: source.hash,
		field: input.field,
		span: { encoding: 'utf16', start, end: start + input.quote.length },
		quote: input.quote,
		rendered: `${source.title}: “${input.quote}”`,
		semanticParaphraseVerified: false
	});
}
export function checkOverdueClaim(catalog, input) {
	if (Object.keys(input).sort().join(',') !== 'relation,sources')
		throw new Error('date_claim_shape_invalid');
	if (!['all', 'some', 'none'].includes(input.relation)) throw new Error('relation_invalid');
	if (
		!Array.isArray(input.sources) ||
		input.sources.length < 1 ||
		input.sources.length > 50 ||
		new Set(input.sources).size !== input.sources.length
	)
		throw new Error('source_list_invalid');
	const rows = input.sources.map((alias) => sourceFor(catalog, alias));
	const snapshot = instant(catalog.packet.loadedAt);
	const facts = rows.map((source) => {
		if (source.family !== 'tasks') throw new Error('date_claim_requires_tasks');
		const due = instant(source.record.due_at);
		const state = source.record.state_key;
		if (
			due === null ||
			(!ACTIVE_TASK_STATES.has(state) && !['done', 'cancelled'].includes(state))
		)
			return { source: source.alias, status: 'unknown' };
		return {
			source: source.alias,
			sourceHash: source.hash,
			dueAt: source.record.due_at,
			state,
			status: ACTIVE_TASK_STATES.has(state) && due < snapshot ? 'overdue' : 'not_overdue'
		};
	});
	const count = facts.filter((f) => f.status === 'overdue').length;
	const unknown = facts.filter((f) => f.status === 'unknown').length;
	let supported;
	if (input.relation === 'all')
		supported = facts.some((f) => f.status === 'not_overdue') ? false : unknown ? null : true;
	else if (input.relation === 'some') supported = count ? true : unknown ? null : false;
	else supported = count ? false : unknown ? null : true;
	return freeze({
		kind: 'overdue_comparison',
		relation: input.relation,
		supported,
		outcome: supported === null ? 'insufficient' : supported ? 'supported' : 'contradicted',
		snapshotAt: catalog.packet.loadedAt,
		count,
		inspected: facts.length,
		unknown,
		facts,
		rendered: `${count} of these ${facts.length} cited tasks are recorded as unfinished with a due time before this snapshot.${unknown ? ` ${unknown} could not be assessed.` : ''}`
	});
}
export function renderSelection(claims, selection) {
	if (
		!Array.isArray(selection) ||
		selection.length > 20 ||
		new Set(selection).size !== selection.length
	)
		throw new Error('selection_invalid');
	return selection
		.map((id) => {
			const claim = claims[id];
			if (!Object.hasOwn(claims, id) || !claim || typeof claim.rendered !== 'string')
				throw new Error('unknown_claim');
			return claim.rendered;
		})
		.join('\n\n');
}
