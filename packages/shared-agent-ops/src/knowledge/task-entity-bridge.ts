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

export function planTaskEntityKnowledge(
	task: { id: string; title: string },
	rows: TaskEntityRowForKnowledge[]
): KnowledgeWriteBatch {
	const live = rows.filter((row) => row.status !== 'dismissed' && row.role !== 'owner_self');
	const named = live.filter((row) => row.kind === 'person' || row.kind === 'org');
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
		batch.entities.push({ ref, kind: row.kind === 'org' ? 'org' : 'person', name });
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
