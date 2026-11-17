// apps/worker/scripts/knowledge-research-run.ts
//
// Tasker 164: run "Find more" research on chosen entries from this machine, with the local worker
// code, and print what each entry cost, found and dropped. Used to measure cost per entry and to
// hill-climb research quality before deploying a change. The run is reserved exactly like the app
// does (same caps, same rows), but the queue job is not added: this script processes it itself,
// so the deployed worker never picks it up.
//
//   Dry (default):  pnpm exec tsx scripts/knowledge-research-run.ts --user-email <email> \
//                     --names "MetroStar Systems|Larry Fox" [--focus contact,role] [--note "..."]
//                   Resolves the names and prints what would be researched. No spend.
//   Live (paid):    KNOWLEDGE_RESEARCH_LIVE=1 ... --live
//                   Web search + one fast-model call per entry, capped per entry.
//
//   Provider bake-off: --provider serper|tavily searches with that provider only (no fallback),
//   so a rerun is a clean comparison. Without it, research uses the code's order (Serper first,
//   Tavily on error, when PRIVATE_SERPER_API_KEY is set). Every run, dry or live, prints each
//   entry's latest earlier research (the baseline: details found, cost, seconds) next to this
//   one. --baseline <runId,...> picks the earlier runs instead of "latest per entry".
// Reads apps/worker/.env.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const arg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : undefined;
};

async function main() {
	const live = process.argv.includes('--live');
	if (live && process.env.KNOWLEDGE_RESEARCH_LIVE !== '1') {
		throw new Error('Live runs spend money: set KNOWLEDGE_RESEARCH_LIVE=1 after approval');
	}
	const email = arg('--user-email');
	const names = (arg('--names') ?? '')
		.split('|')
		.map((n) => n.trim())
		.filter(Boolean);
	if (!email || !names.length) throw new Error('Pass --user-email and --names "A|B"');
	const focus = (arg('--focus') ?? '').split(',').filter(Boolean);
	const note = arg('--note');
	const providerFlag = arg('--provider');
	if (providerFlag !== undefined && providerFlag !== 'serper' && providerFlag !== 'tavily') {
		throw new Error('--provider must be serper or tavily');
	}
	const baselineRunIds = (arg('--baseline') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	const { supabase } = await import('../src/lib/supabase');
	const { startKnowledgeEnrichment, ENRICH_FOCUS_OPTIONS } = await import(
		'@buildos/shared-agent-ops/knowledge'
	);
	const { processKnowledgeEnrichJob } = await import(
		'../src/workers/knowledge/knowledgeEnrichWorker'
	);
	const { createAgentRunWebResearchPort, resolveWebSearchProviders } = await import(
		'../src/workers/agent-run/webResearchPort'
	);
	const providers = resolveWebSearchProviders('knowledge_research', {
		...(providerFlag ? { providers: [providerFlag] } : {})
	});
	const db = supabase as any;

	const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
	if (!user) throw new Error('No user with that email');
	const { data: rows, error } = await db
		.from('knowledge_entities')
		.select('id, name, kind, enriched_at')
		.eq('owner_user_id', user.id)
		.eq('status', 'active')
		.is('merged_into_id', null)
		.in('name', names);
	if (error) throw new Error(error.message);
	const entities = names
		.map((name) => (rows ?? []).find((r: any) => r.name === name))
		.filter(Boolean) as Array<{
		id: string;
		name: string;
		kind: string;
		enriched_at: string | null;
	}>;
	const missing = names.filter((n) => !entities.some((e) => e.name === n));
	if (missing.length) console.log(`Not found: ${missing.join(', ')}`);
	const fields = ENRICH_FOCUS_OPTIONS.filter((o: any) => focus.includes(o.key)).flatMap(
		(o: any) => o.fields
	);
	console.log(
		`${entities.length} entries · focus ${focus.join(', ') || 'default'}${note ? ` · note "${note}"` : ''} · search ${providers.join(' → ') || 'NONE (no API key)'}`
	);
	if (providerFlag && !providers.length) {
		throw new Error(
			`No API key for ${providerFlag}: set ${providerFlag === 'serper' ? 'PRIVATE_SERPER_API_KEY' : 'PRIVATE_TAVILY_API_KEY'}`
		);
	}
	for (const e of entities) console.log(`  ${e.kind.padEnd(7)} ${e.name}`);
	const baseline = await loadResearch(
		db,
		entities.map((e) => e.id),
		baselineRunIds.length ? { runIds: baselineRunIds } : { latest: true }
	);
	if (!live) {
		printComparison(entities, baseline, null);
		console.log(
			'Dry run: nothing reserved or spent. Add --live with KNOWLEDGE_RESEARCH_LIVE=1.'
		);
		return;
	}

	// Same reservation as the app, minus the queue job (this process runs it).
	const noQueue = new Proxy(db, {
		get(target, prop) {
			if (prop === 'rpc') {
				return (fn: string, args: unknown) =>
					fn === 'add_queue_job'
						? Promise.resolve({ data: 'local', error: null })
						: target.rpc(fn, args);
			}
			const value = target[prop];
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
	const started = await startKnowledgeEnrichment(noQueue, user.id, {
		entityIds: entities.map((e) => e.id),
		fields: fields.length ? fields : undefined,
		instructions: note,
		trigger: 'ui'
	});
	console.log(`Run ${started.runId} · budget $${started.budget_usd}`);
	const t0 = Date.now();
	const result = await processKnowledgeEnrichJob(
		{
			id: `local-${started.runId}`,
			data: { runId: started.runId, userId: user.id }
		} as any,
		providerFlag
			? {
					makePort: (onCharge) =>
						createAgentRunWebResearchPort({
							purpose: 'knowledge_research',
							providers: [providerFlag],
							onSearchDispatched: onCharge
						})
				}
			: {}
	);
	const seconds = (Date.now() - t0) / 1000;

	const { data: targets } = await db
		.from('knowledge_run_targets')
		.select('entity_id, status, facts_added, cost_usd, summary, error, started_at, finished_at')
		.eq('run_id', started.runId);
	const out = (targets ?? []).map((t: any) => {
		const e = entities.find((x) => x.id === t.entity_id)!;
		const secs =
			t.started_at && t.finished_at
				? (Date.parse(t.finished_at) - Date.parse(t.started_at)) / 1000
				: null;
		return {
			name: e.name,
			kind: e.kind,
			status: t.status,
			facts: t.facts_added,
			cost_usd: Number(t.cost_usd),
			seconds: secs,
			summary: t.summary,
			error: t.error
		};
	});
	for (const t of out) {
		console.log(
			`- ${t.kind.padEnd(7)} ${t.name}: ${t.status} · ${t.facts} facts · $${t.cost_usd.toFixed(4)} · ${t.seconds ?? '?'}s${t.summary ? ` · ${t.summary}` : ''}${t.error ? ` · ${t.error}` : ''}`
		);
	}
	console.log(
		`Run: ${result.status} · ${result.facts} facts · $${result.costUsd.toFixed(4)} · ${seconds.toFixed(0)}s wall`
	);
	const current = await loadResearch(
		db,
		entities.map((e) => e.id),
		{ runIds: [started.runId] }
	);
	printComparison(entities, baseline, current, providers.join(' → '));
	const outFile = arg('--out');
	if (outFile) {
		const { writeFileSync } = await import('node:fs');
		writeFileSync(
			outFile,
			JSON.stringify(
				{
					runId: started.runId,
					providers,
					focus,
					note,
					result,
					targets: out,
					comparison: entities.map((e) => ({
						name: e.name,
						baseline: baseline.get(e.id) ?? null,
						current: current.get(e.id) ?? null
					}))
				},
				null,
				2
			)
		);
	}
}

interface Research {
	runId: string;
	status: string;
	costUsd: number;
	seconds: number | null;
	summary: string | null;
	/** "predicate: value" for each detail that run added (active or suggested). */
	details: string[];
}

/** Each entry's research: from the named runs, or its latest finished research. Reads only. */
async function loadResearch(
	db: any,
	entityIds: string[],
	from: { runIds: string[] } | { latest: true }
): Promise<Map<string, Research>> {
	let query = db
		.from('knowledge_run_targets')
		.select('run_id, entity_id, status, cost_usd, summary, started_at, finished_at')
		.in('entity_id', entityIds)
		.not('finished_at', 'is', null)
		.order('finished_at', { ascending: false });
	if ('runIds' in from) query = query.in('run_id', from.runIds);
	const { data: targets, error } = await query;
	if (error) throw new Error(`Load research: ${error.message}`);
	const picked = new Map<string, any>();
	for (const t of targets ?? []) if (!picked.has(t.entity_id)) picked.set(t.entity_id, t);

	const runIds = [...new Set([...picked.values()].map((t) => t.run_id))];
	const { data: facts, error: factError } = runIds.length
		? await db
				.from('knowledge_facts')
				.select('run_id, entity_id, predicate, value_text, object_entity_id, status')
				.in('run_id', runIds)
				.in('entity_id', entityIds)
		: { data: [], error: null };
	if (factError) throw new Error(`Load facts: ${factError.message}`);
	const objectIds = [
		...new Set((facts ?? []).map((f: any) => f.object_entity_id).filter(Boolean))
	];
	const { data: objects } = objectIds.length
		? await db.from('knowledge_entities').select('id, name').in('id', objectIds)
		: { data: [] };
	const objectName = new Map((objects ?? []).map((o: any) => [o.id, o.name]));

	const out = new Map<string, Research>();
	for (const [entityId, t] of picked) {
		const details = (facts ?? [])
			.filter((f: any) => f.run_id === t.run_id && f.entity_id === entityId)
			.map(
				(f: any) =>
					`${f.predicate}: ${f.value_text ?? objectName.get(f.object_entity_id) ?? '?'}${f.status === 'suggested' ? ' (to check)' : ''}`
			);
		out.set(entityId, {
			runId: t.run_id,
			status: t.status,
			costUsd: Number(t.cost_usd ?? 0),
			seconds:
				t.started_at && t.finished_at
					? (Date.parse(t.finished_at) - Date.parse(t.started_at)) / 1000
					: null,
			summary: t.summary,
			details
		});
	}
	return out;
}

function cell(r: Research | null | undefined): string {
	if (!r) return '—';
	return `${r.details.length} details · $${r.costUsd.toFixed(4)} · ${r.seconds === null ? '?' : `${r.seconds.toFixed(0)}s`}${r.status === 'done' ? '' : ` · ${r.status}`}`;
}

/** Side by side per entry: baseline (earlier research) vs this run. */
function printComparison(
	entities: Array<{ id: string; name: string }>,
	baseline: Map<string, Research>,
	current: Map<string, Research> | null,
	label = 'this run'
) {
	const width = Math.max(...entities.map((e) => e.name.length), 5);
	console.log(
		`\n${'Entry'.padEnd(width)}  ${'Baseline (earlier research)'.padEnd(34)}  ${current ? label : ''}`
	);
	const totals = { base: 0, baseCost: 0, cur: 0, curCost: 0 };
	for (const e of entities) {
		const b = baseline.get(e.id);
		const c = current?.get(e.id);
		totals.base += b?.details.length ?? 0;
		totals.baseCost += b?.costUsd ?? 0;
		totals.cur += c?.details.length ?? 0;
		totals.curCost += c?.costUsd ?? 0;
		console.log(`${e.name.padEnd(width)}  ${cell(b).padEnd(34)}  ${current ? cell(c) : ''}`);
		const before = new Set(b?.details ?? []);
		const after = new Set(c?.details ?? []);
		for (const d of b?.details ?? [])
			console.log(`${''.padEnd(width)}    ${after.has(d) || !current ? '  ' : '− '}${d}`);
		for (const d of c?.details ?? [])
			if (!before.has(d)) console.log(`${''.padEnd(width)}    + ${d}`);
	}
	console.log(
		`${'Total'.padEnd(width)}  ${`${totals.base} details · $${totals.baseCost.toFixed(4)}`.padEnd(34)}  ${current ? `${totals.cur} details · $${totals.curCost.toFixed(4)}` : ''}`
	);
	if (baseline.size)
		console.log(
			`Baseline runs: ${[...new Set([...baseline.values()].map((r) => r.runId))].join(', ')}`
		);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
