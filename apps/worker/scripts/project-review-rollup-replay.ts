// apps/worker/scripts/project-review-rollup-replay.ts
//
// Tasker 112: replays one project's stored Project Review history, READ-ONLY and free (no model
// calls), under today's rules and under the proposed roll-up (src/workers/project-loop/
// reviewRollup.ts). Every write path of the Supabase client throws.
//
//   cd apps/worker && NODE_OPTIONS=--conditions=development pnpm exec tsx \
//     scripts/project-review-rollup-replay.ts --project <id> --out <dir> [--archive <doc id prefix>...]
//
// Today's rules: which findings each pass rotated out, whether the check could still see
// them (the 40-document window), and which never-decided findings the next prompts listed as
// "Previously reviewed decisions". Roll-up: the same stored candidates merged pass by pass with
// no model verdicts (the most conservative arm), then one simulated pass after the user
// archives the --archive documents (default: the first doc_outdated target still live).
//
// The replay cannot re-run the model, so it answers "given what each pass actually found,
// what would the roll-up have kept?". Output holds private project content; keep --out
// outside the repo (for example a scratchpad).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { LoopOperation, ProjectSuggestionEvidenceRef } from '@buildos/shared-types';
import {
	MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS,
	buildProjectLoopParentMap
} from '@buildos/shared-agent-ops';
import { suggestionSuppressionKey } from '../src/workers/project-loop/generators';
import {
	type RollupCandidate,
	type RollupEvent,
	type RollupItem,
	type RollupPass,
	applyRollupPass,
	findingSubjects
} from '../src/workers/project-loop/reviewRollup';

dotenv.config();

const args = process.argv.slice(2);
const option = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const optionList = (name: string) =>
	args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []));

const projectId = option('--project');
const outDir = option('--out');
if (!projectId || !outDir) {
	console.error(
		'Usage: project-review-rollup-replay.ts --project <id> --out <dir> [--archive <doc id prefix>...]'
	);
	process.exit(2);
}

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
if (!url || !key) {
	console.error('PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required.');
	process.exit(2);
}

/** Every write path throws; reads pass through. */
function readOnly<T extends object>(target: T): T {
	const blocked = new Set(['insert', 'update', 'upsert', 'delete', 'rpc']);
	const wrap = (value: unknown): unknown => {
		if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
		return new Proxy(value as object, {
			get(obj, prop, receiver) {
				if (typeof prop === 'string' && blocked.has(prop))
					return () => {
						throw new Error(`project-review-rollup-replay is read-only (${prop})`);
					};
				const next = Reflect.get(obj, prop, receiver);
				if (typeof next !== 'function') return next;
				return (...callArgs: unknown[]) => {
					const result = (next as (...a: unknown[]) => unknown).apply(obj, callArgs);
					return result && typeof (result as PromiseLike<unknown>).then === 'function'
						? result
						: wrap(result);
				};
			}
		});
	};
	return wrap(target) as T;
}

const db = readOnly(createClient(url, key, { auth: { persistSession: false } }));

const LIGHT_KINDS = ['doc_org', 'doc_outdated', 'drift', 'task_conflict'];
const ROTATION_GRACE_MS = 72 * 60 * 60 * 1000;
const PRIOR_DECISION_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;
const USER_DECISION_STATUSES = new Set(['addressed', 'rejected', 'applied']);

type Row = Record<string, unknown>;
type Suggestion = {
	id: string;
	run_id: string | null;
	kind: string;
	status: string;
	title: string;
	created_at: string;
	updated_at: string;
	decided_at: string | null;
	operations: LoopOperation[];
	evidence_refs: ProjectSuggestionEvidenceRef[];
	result: Row | null;
	user_feedback: Row | null;
};
type Entity = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
};
type Run = {
	id: string;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
	trigger_reason: string;
	status: string;
	cost_usd: number | null;
};

const ms = (value: string | null | undefined) => {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
};
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : '—');
const short = (id: string) => id.slice(0, 8);

async function all<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? []) as T[];
}

async function main() {
	const pid = projectId as string;
	const [projectRows, runs, audits, suggestions, documents, goals, tasks, inbox] =
		await Promise.all([
			all<Row>(db.from('onto_projects').select('id, name, doc_structure').eq('id', pid)),
			all<Run>(
				db
					.from('project_loop_runs')
					.select(
						'id, created_at, started_at, finished_at, trigger_reason, status, cost_usd'
					)
					.eq('project_id', pid)
					.order('created_at')
			),
			all<Row>(db.from('project_audits').select('loop_run_id').eq('project_id', pid)),
			all<Suggestion>(
				db
					.from('project_suggestions')
					.select(
						'id, run_id, kind, status, title, created_at, updated_at, decided_at, operations, evidence_refs, result, user_feedback'
					)
					.eq('project_id', pid)
					.order('created_at')
			),
			all<Entity & { state_key: string | null }>(
				db
					.from('onto_documents')
					.select('id, title, state_key, created_at, updated_at, archived_at, deleted_at')
					.eq('project_id', pid)
			).then((rows) =>
				// Archiving from the doc tree sets only state_key (tasker 113); treat it as
				// archived since its last update.
				rows.map((doc) =>
					doc.state_key === 'archived' && !doc.archived_at
						? { ...doc, archived_at: doc.updated_at ?? doc.created_at }
						: doc
				)
			),
			all<Row>(
				db
					.from('onto_goals')
					.select('id, name, created_at, updated_at, archived_at, deleted_at')
					.eq('project_id', pid)
			),
			all<Entity>(
				db
					.from('onto_tasks')
					.select('id, title, created_at, updated_at, archived_at, deleted_at')
					.eq('project_id', pid)
			),
			all<Row>(
				db
					.from('inbox_items')
					.select('source_type, status, source_status')
					.eq('project_id', pid)
			)
		]);
	const project = projectRows[0];
	if (!project) throw new Error(`Project ${pid} not found`);

	const goalEntities: Entity[] = goals.map((goal) => ({
		id: String(goal.id),
		title: String(goal.name ?? ''),
		created_at: String(goal.created_at),
		updated_at: (goal.updated_at as string | null) ?? null,
		archived_at: (goal.archived_at as string | null) ?? null,
		deleted_at: (goal.deleted_at as string | null) ?? null
	}));
	const entityByKey = new Map<string, Entity>([
		...documents.map((doc) => [`document:${doc.id}`, doc] as const),
		...tasks.map((task) => [`task:${task.id}`, task] as const),
		...goalEntities.map((goal) => [`goal:${goal.id}`, goal] as const)
	]);
	const titleOf = (subject: string) => entityByKey.get(subject)?.title ?? subject;

	// Old loop contexts gave goals no ids, so goal evidence carries a name (or an invented id
	// like "goal-1"). Resolve it to the goal record by exact name, or by a unique prefix when
	// the stored title was clipped. Record lookup on historical rows only; the build passes
	// goal ids into the context instead.
	const goalIds = new Set(goalEntities.map((goal) => goal.id));
	const resolveGoalRef = (ref: ProjectSuggestionEvidenceRef): ProjectSuggestionEvidenceRef => {
		if (ref?.entity_type !== 'goal' || (ref.entity_id && goalIds.has(ref.entity_id)))
			return ref;
		const title = (ref.title ?? '').trim();
		const exact = goalEntities.filter((goal) => goal.title === title);
		const prefix = goalEntities.filter((goal) => title && goal.title.startsWith(title));
		const match = exact.length === 1 ? exact[0] : prefix.length === 1 ? prefix[0] : null;
		return match ? { ...ref, entity_id: match.id } : { ...ref, entity_id: undefined };
	};

	const parentMap = buildProjectLoopParentMap(project.doc_structure);
	const ancestorsOf = (documentId: string): string[] => {
		const chain: string[] = [];
		let current = parentMap.get(documentId) ?? null;
		while (current && !chain.includes(current)) {
			chain.push(current);
			current = parentMap.get(current) ?? null;
		}
		return chain;
	};

	const auditRunIds = new Set(audits.map((row) => String(row.loop_run_id)));
	const lightSuggestions = suggestions.filter((row) => LIGHT_KINDS.includes(row.kind));
	const passes = runs.filter(
		(run) =>
			run.status !== 'failed' &&
			!auditRunIds.has(run.id) &&
			lightSuggestions.some((row) => row.run_id === run.id)
	);

	/** Status of a suggestion row as of an instant (final status once decided, else pending). */
	const statusAt = (row: Suggestion, at: number) =>
		row.decided_at && ms(row.decided_at) <= at ? row.status : 'pending';

	/** The document list a check saw at `at`: live documents, most recently touched first, capped. */
	const windowAt = (at: number) => {
		const live = documents.filter(
			(doc) =>
				ms(doc.created_at) <= at &&
				!(doc.deleted_at && ms(doc.deleted_at) <= at) &&
				!(doc.archived_at && ms(doc.archived_at) <= at)
		);
		// A document edited after `at` last changed somewhere between its creation and `at`;
		// ranking it first is the approximation (it only moves others down by one).
		const recency = (doc: Entity) =>
			ms(doc.updated_at) > at
				? Number.MAX_SAFE_INTEGER
				: ms(doc.updated_at ?? doc.created_at);
		const ranked = [...live].sort((a, b) => recency(b) - recency(a));
		return {
			liveCount: live.length,
			rank: new Map(ranked.map((doc, index) => [doc.id, index + 1])),
			visible: new Set(
				ranked.slice(0, MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS).map((doc) => doc.id)
			)
		};
	};

	const keyOf = (row: Suggestion) =>
		suggestionSuppressionKey({
			kind: row.kind,
			operations: row.operations,
			evidence_refs: row.evidence_refs,
			title: row.title
		});

	// ---------------------------------------------------------------- today's rules
	const today: string[] = [];
	for (const pass of passes) {
		const start = ms(pass.started_at ?? pass.created_at);
		const end = ms(pass.finished_at) || start;
		const own = lightSuggestions.filter((row) => row.run_id === pass.id);
		const ownKeys = new Set(own.map(keyOf).filter(Boolean));
		const window = windowAt(start);

		const predicted = lightSuggestions.filter(
			(row) =>
				row.run_id !== pass.id &&
				ms(row.created_at) < start &&
				statusAt(row, start) === 'pending' &&
				!ownKeys.has(keyOf(row)) &&
				end - ms(row.created_at) > ROTATION_GRACE_MS
		);
		const actual = lightSuggestions.filter(
			(row) =>
				(row.result as { errors?: Array<{ tool?: string }> } | null)?.errors?.[0]?.tool ===
					'project_loop_rotation' &&
				ms(row.decided_at) >= start &&
				ms(row.decided_at) <= end + 10 * 60 * 1000
		);
		const shown = suggestions
			.filter(
				(row) =>
					['addressed', 'rejected', 'applied', 'delegated', 'superseded'].includes(
						statusAt(row, start)
					) && ms(row.decided_at) >= start - PRIOR_DECISION_LOOKBACK_MS
			)
			.slice(-30);
		const falseDecisions = shown.filter((row) => !USER_DECISION_STATUSES.has(row.status));

		today.push(
			`### Pass ${short(pass.id)} · ${day(pass.created_at)} · ${pass.trigger_reason} · $${Number(pass.cost_usd ?? 0).toFixed(4)}`,
			'',
			`- Wrote ${own.length} finding${own.length === 1 ? '' : 's'}. The checks saw ${Math.min(window.liveCount, MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS)} of ${window.liveCount} live documents.`,
			`- Rotated out ${actual.length} earlier finding${actual.length === 1 ? '' : 's'} (reconstruction predicts ${predicted.length}; ${
				predicted.length === actual.length &&
				predicted.every((row) => actual.some((other) => other.id === row.id))
					? 'exact match'
					: 'differs: a pass can re-confirm through a suppressed duplicate the ledger does not store'
			}).`
		);
		for (const row of actual) {
			const target = findingSubjects({
				operations: row.operations,
				evidenceRefs: row.evidence_refs.map(resolveGoalRef)
			}).primarySubject;
			const docId = target?.startsWith('document:') ? target.slice(9) : null;
			const seen = docId
				? window.visible.has(docId)
					? `its document was in view (rank ${window.rank.get(docId)})`
					: `its document was OUT of view (rank ${window.rank.get(docId) ?? '—'} of ${window.liveCount}), so this check could not have re-raised it`
				: 'no document target';
			today.push(`  - "${row.title}" (${row.kind}, from ${day(row.created_at)}): ${seen}.`);
		}
		today.push(
			`- The prompts listed ${shown.length} "previously reviewed decision${shown.length === 1 ? '' : 's'}"; ${falseDecisions.length} of them the user never made (${
				[...new Set(falseDecisions.map((row) => row.status))].join(', ') || 'none'
			}).`
		);
		for (const row of falseDecisions.filter((row) => LIGHT_KINDS.includes(row.kind))) {
			today.push(`  - shown as \`${row.status}\`: "${row.title}"`);
		}
		today.push('');
	}

	// ---------------------------------------------------------------- roll-up
	const subjectStateAt =
		(at: number, archivedNow: Set<string> = new Set()) =>
		(subject: string) => {
			if (archivedNow.has(subject)) return { archived: true };
			const entity = entityByKey.get(subject);
			if (!entity) return undefined;
			if (entity.deleted_at && ms(entity.deleted_at) <= at) return { deleted: true };
			if (entity.archived_at && ms(entity.archived_at) <= at) return { archived: true };
			return undefined;
		};
	const userDecisionsBetween = (from: number, to: number) =>
		new Map(
			suggestions
				.filter(
					(row) =>
						USER_DECISION_STATUSES.has(row.status) &&
						ms(row.decided_at) > from &&
						ms(row.decided_at) <= to
				)
				.map((row) => [row.id, row.status as 'applied' | 'rejected' | 'addressed'])
		);

	let items: RollupItem[] = [];
	const rollup: string[] = [];
	const suggestionTitle = new Map(suggestions.map((row) => [row.id, row.title]));
	const describeEvent = (event: RollupEvent, itemsNow: RollupItem[]) => {
		const item = itemsNow.find((candidate) => candidate.lineageId === event.lineageId);
		const name = item ? `"${item.title}"` : event.lineageId;
		switch (event.type) {
			case 'opened':
				return `  - new: ${name}`;
			case 'confirmed': {
				const first = suggestionTitle.get(event.lineageId);
				const now = suggestionTitle.get(event.suggestionId) ?? item?.title;
				return `  - still there: "${now}" carries "${first}" (seen in ${event.seenCount} passes, scope ${event.scopeChange})`;
			}
			case 'narrowed':
				return `  - narrower: ${name} (${event.removed.map(titleOf).join(', ')} gone)`;
			case 'closed':
				return `  - closed: ${name} — ${event.reason}: ${event.detail}`;
		}
	};
	let previousAt = 0;
	const snapshots: Array<{ runId: string; at: string; open: RollupItem[] }> = [];
	for (const pass of passes) {
		const at = pass.started_at ?? pass.created_at;
		const candidates: RollupCandidate[] = lightSuggestions
			.filter((row) => row.run_id === pass.id)
			.map((row) => ({
				suggestionId: row.id,
				runId: pass.id,
				kind: row.kind,
				title: row.title,
				operations: row.operations,
				evidenceRefs: row.evidence_refs.map(resolveGoalRef)
			}));
		const input: RollupPass = {
			runId: pass.id,
			at,
			candidates,
			subjectState: subjectStateAt(ms(at)),
			ancestorsOf,
			userDecisions: userDecisionsBetween(previousAt, ms(at))
		};
		const result = applyRollupPass(items, input);
		items = result.items;
		previousAt = ms(at);
		const open = items.filter((item) => item.status === 'open');
		snapshots.push({ runId: pass.id, at, open });
		rollup.push(
			`### Pass ${short(pass.id)} · ${day(at)} → change set holds ${open.length} open item${open.length === 1 ? '' : 's'}`,
			'',
			...result.events.map((event) => describeEvent(event, items)),
			''
		);
	}

	// One simulated pass after the user archives the flagged documents.
	const archivePrefixes = optionList('--archive');
	const defaultArchive = items.find(
		(item) =>
			item.status === 'open' &&
			item.kind === 'doc_outdated' &&
			item.targets.length === 1 &&
			item.targets[0].startsWith('document:')
	)?.targets[0];
	const toArchive = new Set(
		archivePrefixes.length
			? documents
					.filter((doc) => archivePrefixes.some((prefix) => doc.id.startsWith(prefix)))
					.map((doc) => `document:${doc.id}`)
			: defaultArchive
				? [defaultArchive]
				: []
	);
	const simulatedAt = new Date(Date.now() + 60_000).toISOString();
	const simulated = applyRollupPass(items, {
		runId: 'simulated',
		at: simulatedAt,
		candidates: [],
		subjectState: subjectStateAt(ms(simulatedAt), toArchive),
		ancestorsOf,
		userDecisions: userDecisionsBetween(previousAt, ms(simulatedAt))
	});
	rollup.push(
		`### Simulated next pass · the user archived ${[...toArchive].map((key) => `"${titleOf(key)}"`).join(', ') || 'nothing'}`,
		'',
		...(simulated.events.length
			? simulated.events.map((event) => describeEvent(event, simulated.items))
			: ['  - no change']),
		''
	);

	// ---------------------------------------------------------------- the change set now
	const finalOpen = simulated.items.filter((item) => item.status === 'open');
	const windowNow = windowAt(Date.now());
	const changeSet: string[] = [];
	for (const item of finalOpen.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))) {
		const scope = (item.targets.length ? item.targets : item.subjects).map((subject) => {
			const docId = subject.startsWith('document:') ? subject.slice(9) : null;
			const hidden =
				docId && !windowNow.visible.has(docId) ? ' [outside the checks’ 40-doc view]' : '';
			return `${titleOf(subject)}${hidden}`;
		});
		changeSet.push(
			`| ${item.kind} | ${item.title.replace(/\|/g, '/')} | ${day(item.firstSeenAt)} | ${item.seenInRuns.length} | ${scope.join('; ').replace(/\|/g, '/')} |`
		);
	}

	// Other producers already pointing at the same records.
	const openSubjects = new Set(finalOpen.flatMap((item) => item.subjects));
	const auditOverlap = suggestions.filter(
		(row) =>
			row.kind === 'audit_recommendation' &&
			row.status === 'pending' &&
			row.evidence_refs.some(
				(ref) => ref?.entity_id && openSubjects.has(`${ref.entity_type}:${ref.entity_id}`)
			)
	);
	const { data: concerns } = await (db as any)
		.from('freshness_concerns')
		.select('subject_kind, subject_id, subject_title')
		.eq('project_id', pid)
		.eq('status', 'open');
	const radarOverlap = ((concerns ?? []) as Row[]).filter((row) =>
		openSubjects.has(`${row.subject_kind}:${row.subject_id}`)
	);

	const inboxSummary = new Map<string, number>();
	for (const row of inbox) {
		const label = `${row.source_type} · ${row.status} · ${row.source_status}`;
		inboxSummary.set(label, (inboxSummary.get(label) ?? 0) + 1);
	}

	const report = [
		`# Project Review roll-up replay — ${String(project.name)}`,
		'',
		`Project \`${pid}\` · ${passes.length} light review passes · ${lightSuggestions.length} findings · generated ${new Date().toISOString()} · read-only, no model calls.`,
		'',
		'## What reached the AI Inbox',
		'',
		...[...inboxSummary.entries()].map(([label, count]) => `- ${count} × ${label}`),
		'',
		'## Today’s rules, pass by pass',
		'',
		...today,
		'## The roll-up, pass by pass (no model verdicts: the most conservative arm)',
		'',
		...rollup,
		'## The Project cleanup change set after the simulated pass',
		'',
		'| Kind | Item (latest wording) | First seen | Passes | Touches |',
		'| --- | --- | --- | --- | --- |',
		...changeSet,
		'',
		'## Other producers already pointing at the same records',
		'',
		`- ${auditOverlap.length} open Complete Project Audit recommendation${auditOverlap.length === 1 ? '' : 's'}: ${auditOverlap.map((row) => `"${row.title}"`).join('; ') || '—'}`,
		`- ${radarOverlap.length} open freshness radar concern${radarOverlap.length === 1 ? '' : 's'}: ${radarOverlap.map((row) => `"${String(row.subject_title)}"`).join('; ') || '—'}`,
		''
	].join('\n');

	const out = resolve(outDir as string);
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, 'rollup-replay.md'), report);
	writeFileSync(
		join(out, 'rollup-replay.json'),
		JSON.stringify({ projectId: pid, snapshots, final: simulated.items }, null, 2)
	);
	console.log(report);
	console.log(`\nWrote ${join(out, 'rollup-replay.md')} and rollup-replay.json`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
});
