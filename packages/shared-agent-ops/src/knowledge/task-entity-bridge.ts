// packages/shared-agent-ops/src/knowledge/task-entity-bridge.ts
//
// People and organizations read out of a task's text (onto_task_entities) become entries in
// the task owner's private knowledge graph, linked back to the task. Used by the backfill
// script and by the extract_task_entities worker after each read (tasker 160).
//
// Mapping (structured fields only; no language parsing):
//   person / org rows          → entities (dismissed and the owner's own rows are skipped)
//   email / phone rows          → facts on the person or org their `about` names
//   person.about = an org row   → person works_at org (low confidence: a task mention)
//   every person / org          → a link to the task, with the words it was read from
//
// Places are filed only when someone asks ("Add to Places" on a task card): the model's place
// reads are noisy ("front desk", "US"), so they never flow in automatically. A filed place keeps
// the task's wording as its address and any phone the task ties to it.

import { normalizeKnowledgeName } from './normalize';
import type { KnowledgeWriteBatch } from './types';

export interface TaskEntityRowForKnowledge {
	id: string;
	kind: string;
	natural_key: string;
	value: string;
	display: string;
	role: string;
	about: string | null;
	quote: string | null;
	status: string;
}

export interface PlanTaskEntityKnowledgeOptions {
	/** File only these task entity rows (one name from a task card), with what ties to them. */
	onlyRowIds?: readonly string[];
	/** Also file places (only ever with onlyRowIds: an explicit request). */
	includePlaces?: boolean;
}

export function planTaskEntityKnowledge(
	task: { id: string; title: string },
	rows: TaskEntityRowForKnowledge[],
	options: PlanTaskEntityKnowledgeOptions = {}
): KnowledgeWriteBatch {
	const live = rows.filter((row) => row.status !== 'dismissed' && row.role !== 'owner_self');
	const only = options.onlyRowIds ? new Set(options.onlyRowIds) : null;
	const named = live.filter(
		(row) =>
			(row.kind === 'person' ||
				row.kind === 'org' ||
				(row.kind === 'place' && options.includePlaces)) &&
			(!only || only.has(row.id))
	);
	const batch: KnowledgeWriteBatch = {
		entities: [],
		facts: [],
		sources: [
			{ ref: 'task', type: 'task', record_id: task.id, title: task.title.slice(0, 500) }
		],
		links: []
	};
	if (!named.length) return batch;

	// Names a row's `about` may use → entity ref.
	const refByName = new Map<string, { ref: string; kind: string }>();
	for (const row of named) {
		const ref = `t${row.id}`;
		const name = (row.display || row.value).trim();
		if (!name) continue;
		const kind = row.kind === 'org' ? 'org' : row.kind === 'place' ? 'place' : 'person';
		batch.entities.push({ ref, kind, name });
		// A place's own words are where it is ("7609 Energy Pkwy, Baltimore").
		if (kind === 'place' && row.value.trim() && row.value.trim() !== name) {
			batch.facts.push({
				subject: ref,
				predicate: 'address',
				value: row.value.trim(),
				confidence: 0.6,
				sources: ['task'],
				...(row.quote ? { quote: row.quote.slice(0, 1000) } : {})
			});
		}
		for (const alias of [row.natural_key, row.display, row.value]) {
			const key = normalizeKnowledgeName(alias ?? '');
			if (key && !refByName.has(key)) refByName.set(key, { ref, kind: row.kind });
		}
		batch.links!.push({
			entity: ref,
			record_kind: 'task',
			record_id: task.id,
			...(row.quote ? { quote: row.quote.slice(0, 1000) } : {})
		});
	}

	const owner = (about: string | null) =>
		about ? refByName.get(normalizeKnowledgeName(about)) : undefined;

	for (const row of named) {
		if (row.kind !== 'person') continue;
		const org = owner(row.about);
		if (org && org.kind === 'org') {
			batch.facts.push({
				subject: `t${row.id}`,
				predicate: 'works_at',
				object: org.ref,
				confidence: 0.6,
				sources: ['task'],
				...(row.quote ? { quote: row.quote.slice(0, 1000) } : {})
			});
		}
	}

	for (const row of live) {
		if (row.kind !== 'email' && row.kind !== 'phone') continue;
		const target = owner(row.about);
		if (!target) continue;
		if (row.kind === 'email' && target.kind === 'place') continue; // places have no email
		batch.facts.push({
			subject: target.ref,
			predicate: row.kind,
			value: row.value,
			confidence: 0.7,
			sources: ['task'],
			...(row.role === 'secondary' ? { qualifiers: { label: 'fallback' } } : {}),
			...(row.quote ? { quote: row.quote.slice(0, 1000) } : {})
		});
	}
	return batch;
}

/**
 * Drop entities (and every fact and link that touches them) from a planned batch, e.g. names
 * the owner hid: hiding means "not a thing", so a later read of the task must not re-file it.
 */
export function withoutTaskEntityRefs(
	batch: KnowledgeWriteBatch,
	refs: ReadonlySet<string>
): KnowledgeWriteBatch {
	if (!refs.size) return batch;
	return {
		...batch,
		entities: batch.entities.filter((e) => !refs.has(e.ref)),
		facts: batch.facts.filter(
			(f) => !refs.has(f.subject) && !(typeof f.object === 'string' && refs.has(f.object))
		),
		links: batch.links?.filter((l) => !refs.has(l.entity))
	};
}
