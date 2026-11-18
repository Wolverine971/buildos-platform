// apps/worker/scripts/knowledge-eval/run.ts
//
// Research eval (tasker 164, part A). Runs the real research pipeline (researchEntity: anchors →
// searches → pages → same-one check → extraction) on the entries in truth.json and scores what it
// WOULD save against the truth: correct details, wrong details, wrong-entity rate, gaps filled,
// cost and time. Nothing is written to the database; no run is reserved.
//
// Every search result, fetched page, decision and model answer is cached on disk (.cache/, git-
// ignored) by its exact request, so a rerun of the same queries and prompts costs nothing. A code
// change that alters a query or prompt is a cache miss: in a dry run that entry is reported as
// "not cached" and skipped; a live run fills the cache.
//
//   Dry (default, free):  pnpm exec tsx scripts/knowledge-eval/run.ts --user-email <email>
//   Live (paid):          KNOWLEDGE_EVAL_LIVE=1 pnpm exec tsx scripts/knowledge-eval/run.ts \
//                           --user-email <email> --live
//   Options:  --only "Name|Name"  --bakeoff (the 12 bake-off entries)  --with-not-hints (use the
//             truth's "not" as if the user had pressed "Not this one")  --label v2  --out file.json
//             --provider serper|tavily
// Results append to .cache/history.jsonl (one line per run) for a version-over-version table.
// Reads apps/worker/.env.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const HERE = join(REPO, 'apps/worker/scripts/knowledge-eval');
const CACHE = join(HERE, '.cache');

const arg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : undefined;
};

class CacheMiss extends Error {
	constructor(readonly what: string) {
		super(`not cached: ${what}`);
	}
}

interface Cached<T> {
	value: T;
	costUsd: number;
	ms: number;
	at: string;
}

function key(parts: unknown): string {
	return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
}

function cacheFile(kind: string, k: string) {
	return join(CACHE, kind, `${k}.json`);
}

/** Read through the cache; on a miss run `live` (if allowed) and store the result. */
async function cached<T>(
	kind: string,
	parts: unknown,
	live: (() => Promise<{ value: T; costUsd: number }>) | null,
	stats: { costFirst: number; costNow: number; msFirst: number; hits: number; misses: number }
): Promise<T> {
	const file = cacheFile(kind, key(parts));
	if (existsSync(file)) {
		const hit = JSON.parse(readFileSync(file, 'utf8')) as Cached<T>;
		stats.hits++;
		stats.costFirst += hit.costUsd;
		stats.msFirst += hit.ms;
		return hit.value;
	}
	stats.misses++;
	if (!live) throw new CacheMiss(kind);
	const t0 = Date.now();
	const { value, costUsd } = await live();
	const ms = Date.now() - t0;
	stats.costNow += costUsd;
	// A failed decision (timeout, rate limit) is not an answer: never cache it.
	if ((value as { ok?: boolean } | null)?.ok === false) return value;
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(
		file,
		JSON.stringify({
			value,
			costUsd,
			ms,
			at: new Date().toISOString(),
			parts
		} satisfies Cached<T> & { parts: unknown })
	);
	stats.costFirst += costUsd;
	stats.msFirst += ms;
	return value;
}

async function main() {
	const live = process.argv.includes('--live');
	if (live && process.env.KNOWLEDGE_EVAL_LIVE !== '1')
		throw new Error('Live runs spend money: set KNOWLEDGE_EVAL_LIVE=1 after approval');
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email');
	const only = (arg('--only') ?? '')
		.split('|')
		.map((n) => n.trim())
		.filter(Boolean);
	const providerFlag = arg('--provider') as 'serper' | 'tavily' | undefined;
	const withNotHints = process.argv.includes('--with-not-hints');
	const label = arg('--label') ?? new Date().toISOString().slice(0, 16);

	const truthFile = JSON.parse(readFileSync(join(HERE, 'truth.json'), 'utf8')) as {
		status: string;
		entries: import('../../src/workers/knowledge/knowledgeEvalScore').EvalTruthEntry[];
	};
	let entries = truthFile.entries;
	if (process.argv.includes('--bakeoff')) entries = entries.filter((e) => e.bakeoff);
	if (only.length) entries = entries.filter((e) => only.includes(e.name));

	const { supabase } = await import('../../src/lib/supabase');
	const knowledge = await import('@buildos/shared-agent-ops/knowledge');
	const { researchEntity } = await import('../../src/workers/knowledge/knowledgeResearch');
	const { enrichContextFrom, enrichQueries } = await import(
		'../../src/workers/knowledge/knowledgeEnrichPlan'
	);
	const { DEFAULT_ENRICH_FIELDS } = knowledge;
	const score = await import('../../src/workers/knowledge/knowledgeEvalScore');
	const db = supabase as any;

	const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
	if (!user) throw new Error('No user with that email');
	const store = new knowledge.KnowledgeStore(db, user.id);

	// Live dependencies, built only for a live run.
	let livePort: any = null;
	let liveLlm: any = null;
	let liveJev: any = null;
	let reserved = 0;
	let liveCharge = 0;
	if (live) {
		const { createAgentRunWebResearchPort, readPaidToolCharge } = await import(
			'../../src/workers/agent-run/webResearchPort'
		);
		livePort = {
			port: createAgentRunWebResearchPort({
				purpose: 'knowledge_research',
				...(providerFlag ? { providers: [providerFlag] } : {}),
				onSearchDispatched: (c: { cost_usd: number }) => (reserved += c.cost_usd)
			}),
			readPaidToolCharge
		};
		const { SmartLLMService } = await import('../../src/lib/services/smart-llm-service');
		liveLlm = new SmartLLMService();
		const { JevClient, LLMUsageLogger } = await import('@buildos/smart-llm');
		const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
		liveJev = apiKey
			? new JevClient({
					apiKey,
					timeoutMs: 10_000,
					retryOnce: true,
					title: 'BuildOS Knowledge eval',
					usage: new LLMUsageLogger({ supabase: db })
				})
			: null;
	}

	console.log(
		`${truthFile.status}\n${entries.length} entries · ${live ? 'LIVE (paid on cache misses)' : 'dry (cache only, free)'}${withNotHints ? ' · with "not this one" hints' : ''}`
	);
	const rows: Array<Record<string, unknown>> = [];
	const scores: Array<ReturnType<typeof score.scoreEntry>> = [];
	const run = { costFirst: 0, costNow: 0, msFirst: 0, hits: 0, misses: 0 };

	for (const entry of entries) {
		const stats = { costFirst: 0, costNow: 0, msFirst: 0, hits: 0, misses: 0 };
		const detail = await store.getEntity(entry.entity_id);
		if (!detail) {
			rows.push({ name: entry.name, status: 'entry not found' });
			continue;
		}
		const signals = await knowledge
			.gatherCircleSignals(db, user.id, [detail.entity.id])
			.catch(() => []);
		const circle = (signals[0] && knowledge.circleFromSignals(signals[0])?.circle) || 'unknown';
		const anchors = await knowledge
			.gatherKnowledgeAnchors(store, db, detail, { circle })
			.catch(() => null);
		if (anchors && withNotHints)
			anchors.not = [
				...anchors.not,
				...(entry.not ?? []).map((n) => ({
					label: n.label,
					domains: n.domains,
					urls: n.urls ?? []
				}))
			];
		const fields = DEFAULT_ENRICH_FIELDS[detail.entity.kind] ?? [];
		const known = enrichContextFrom(detail).existing;
		const planned = enrichQueries(enrichContextFrom(detail), null, fields, anchors);
		const anchorView = anchors ? knowledge.anchorsForPrompt(anchors) : null;

		const port = {
			search: (args: Record<string, unknown>) =>
				cached(
					'search',
					{ args, provider: providerFlag ?? 'default' },
					livePort
						? async () => {
								reserved = 0;
								const value = await livePort.port.search(args);
								const billed = livePort.readPaidToolCharge(value);
								return { value, costUsd: billed?.cost_usd ?? reserved };
							}
						: null,
					stats
				),
			visit: (args: Record<string, unknown>) =>
				cached(
					'page',
					{ url: args.url, max: args.max_chars },
					livePort
						? async () => ({ value: await livePort.port.visit(args), costUsd: 0 })
						: null,
					stats
				)
		};
		const decider = {
			decide: (request: unknown, options?: { usage?: unknown }) =>
				cached(
					'decision',
					request,
					live
						? async () => {
								if (!liveJev)
									return {
										value: {
											ok: false,
											error: 'no_key',
											receipt: { costUsd: 0 }
										},
										costUsd: 0
									};
								const value = await liveJev.decide(request, {
									...(options ?? {}),
									timeoutMs: 10_000
								});
								return {
									value: { ...value, receipt: { costUsd: 0 } },
									costUsd: value.receipt?.costUsd ?? 0
								};
							}
						: null,
					stats
				)
		};
		const llm = {
			getJSONResponse: async (options: any) => {
				const value = await cached(
					'extraction',
					{
						system: options.systemPrompt,
						user: options.userPrompt,
						profile: options.profile
					},
					liveLlm
						? async () => {
								let costUsd = 0;
								const value = await liveLlm.getJSONResponse({
									...options,
									onUsage: (u: any) => (costUsd += u.totalCost ?? 0)
								});
								return { value, costUsd };
							}
						: null,
					stats
				);
				return value;
			}
		};

		const t0 = Date.now();
		try {
			const outcome = await researchEntity(
				{ detail, anchors, fields, instructions: null, userId: user.id },
				{
					llm: llm as never,
					port,
					decider: live && !liveJev ? null : (decider as never),
					// Budget is the eval's per-entry cap; spend is reported from the cache.
					charge: (usd) => (liveCharge += usd),
					takeReserved: () => 0,
					budgetLeft: () => 0.03
				}
			);
			const found = score.foundFromBatch(outcome.batch, detail.entity.id);
			const s = score.scoreEntry(entry, found, known);
			scores.push(s);
			rows.push({
				name: entry.name,
				group: entry.group,
				status: 'scored',
				queries: outcome.queries,
				verdicts: outcome.verdicts,
				unanchored: outcome.unanchored,
				anchors: anchors ? knowledge.anchorsForPrompt(anchors) : null,
				found,
				score: s,
				costUsd: stats.costFirst,
				seconds: (live ? Date.now() - t0 : stats.msFirst) / 1000
			});
		} catch (error) {
			rows.push({
				name: entry.name,
				status:
					error instanceof CacheMiss
						? error.message
						: `error: ${error instanceof Error ? error.message : error}`,
				planned,
				circle,
				anchors: anchorView
			});
		}
		for (const k of Object.keys(run) as Array<keyof typeof run>) run[k] += stats[k];
	}

	// Report
	const width = Math.max(...entries.map((e) => e.name.length), 5);
	console.log(`\n${'Entry'.padEnd(width)}  result`);
	for (const row of rows) {
		const s = row.score as ReturnType<typeof score.scoreEntry> | undefined;
		if (!s) {
			console.log(
				`${String(row.name).padEnd(width)}  ${row.status}${row.circle ? ` · circle ${row.circle}` : ''}`
			);
			for (const q of (row.planned as string[] | undefined) ?? [])
				console.log(`${''.padEnd(width)}    search: ${q}`);
			const a = row.anchors as Record<string, unknown> | null | undefined;
			if (a) {
				const bits = [
					'own_website',
					'works_at',
					'people_who_work_there',
					'places',
					'links_in_user_notes'
				]
					.filter((k) => a[k])
					.map((k) => `${k}=${JSON.stringify(a[k])}`);
				const mentions = (a.how_the_user_mentions_it as string[] | undefined)?.length ?? 0;
				console.log(
					`${''.padEnd(width)}    anchors: ${bits.join(' ') || 'none'}${mentions ? ` · ${mentions} mention(s)` : ''}`
				);
			}
			continue;
		}
		const fields = Object.entries(s.fields)
			.map(([f, r]) => `${f}:${r!.result}`)
			.join(' ');
		console.log(
			`${String(row.name).padEnd(width)}  ✓${s.correct} ✗${s.wrong} ?${s.unsure} –${s.missing} +${s.gapsFilled} gaps · ${s.suggestedCorrect}/${s.suggestedCorrect + s.suggestedWrong} suggestions right${s.wrongEntity ? ' · WRONG ENTITY' : ''}${row.unanchored ? ' · no anchors' : ''} · $${(row.costUsd as number).toFixed(4)} · ${(row.seconds as number).toFixed(1)}s`
		);
		console.log(`${''.padEnd(width)}    ${fields}`);
		for (const why of s.wrongEntityWhy) console.log(`${''.padEnd(width)}    ! ${why}`);
	}
	const t = score.totals(scores, entries.length);
	const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`);
	console.log(
		`\n${t.scored}/${t.entries} scored · correct ${t.correct} · wrong ${t.wrong} · precision ${pct(t.precision)} · wrong entity ${t.wrongEntityEntries} (${pct(t.wrongEntityRate)}) · gaps filled ${t.gapsFilled} · missing ${t.missing} · suggestions right ${t.suggestedCorrect}/${t.suggestedCorrect + t.suggestedWrong}`
	);
	console.log(
		`Cost (as first run) $${run.costFirst.toFixed(4)} · spent now $${run.costNow.toFixed(4)} · cache ${run.hits} hits / ${run.misses} misses`
	);

	mkdirSync(CACHE, { recursive: true });
	appendFileSync(
		join(CACHE, 'history.jsonl'),
		`${JSON.stringify({ label, at: new Date().toISOString(), live, withNotHints, totals: t, costFirst: run.costFirst, spent: run.costNow })}\n`
	);
	const out = arg('--out');
	if (out) writeFileSync(out, JSON.stringify({ label, totals: t, rows }, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
