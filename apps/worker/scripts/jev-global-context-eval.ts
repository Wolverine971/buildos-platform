// apps/worker/scripts/jev-global-context-eval.ts
//
// Offline eval for the two-hop global context finder (`workspace.ts` in
// @buildos/agentic-chat-runtime/context-finder). Hop 1 scores every project from a card of
// record titles and decides the request's scope; hop 2 ranks records inside the top projects.
// Labels: docs/research/jev-global-context-2026-09-23/scenarios.json.
//
//   Dry (free):    NODE_OPTIONS=--conditions=development pnpm exec tsx \
//                    scripts/jev-global-context-eval.ts --dump <file> --out <dir>
//   Live (paid):   JEV_GLOBAL_EVAL_LIVE=1 ... --live --reps 3 [--max-usd 0.25]
//   Replay (free): ... --replay
//
// The dump is `supabase db query -o json` output with one row per accessible project,
// `data = {project, documents, tasks, goals, plans, milestones, risks}`. It holds private
// project content, so it and the output directory stay out of the repo.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	buildContextFinderEntities,
	buildContextFinderRequest,
	capWorkspaceCards,
	planWorkspaceZoom,
	rankWorkspaceProjects,
	rankWorkspaceZoom,
	renderWorkspaceContextBlock,
	selectWorkspaceProjects,
	workspacePulseText,
	workspaceZoomShare,
	type ContextFinderRankingV1,
	type WorkspaceContextV1,
	type WorkspaceProjectInputV1,
	type WorkspaceRankingV1,
	type WorkspaceScope
} from '@buildos/agentic-chat-runtime/context-finder';
import { JevClient } from '@buildos/smart-llm';

type Label = [project: string, kind: string, title: string];
type Scenario = {
	key: string;
	source: string;
	expectScope: WorkspaceScope;
	message: string;
	recent?: { role: string; content: string }[];
	previousFocus?: string[];
	mustProjects: string[];
	helpfulProjects: string[];
	must: Label[];
	helpful: Label[];
	control?: boolean;
};
type Resolved = { projectId: string; id: string; title: string };
type Cached = {
	key: string;
	rep: number;
	full: WorkspaceRankingV1;
	lean: WorkspaceRankingV1;
	/** Hop 2 for the top three projects of the full ranking, whatever the scope. */
	zoom: Record<string, ContextFinderRankingV1>;
};

const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const HOP2_CANDIDATES = 3;
const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const SCENARIOS = join(REPO, 'docs/research/jev-global-context-2026-09-23/scenarios.json');

function loadDump(file: string): WorkspaceProjectInputV1[] {
	const json = JSON.parse(readFileSync(file, 'utf8'));
	return (json.rows as { data: WorkspaceProjectInputV1 }[]).map((row) => row.data);
}

function resolveLabels(projects: WorkspaceProjectInputV1[], scenario: Scenario) {
	const byName = (name: string) => {
		const hits = projects.filter((p) => p.project.name === name);
		if (hits.length !== 1)
			throw new Error(`${scenario.key}: project "${name}" → ${hits.length}`);
		return hits[0]!;
	};
	const record = ([projectName, kind, title]: Label): Resolved => {
		const project = byName(projectName);
		const rows = kind === 'document' ? project.documents : kind === 'task' ? project.tasks : [];
		const hits = rows.filter((row) => String(row.title ?? '').startsWith(title));
		if (hits.length !== 1)
			throw new Error(
				`${scenario.key}: ${kind} "${title}" in ${projectName} → ${hits.length}`
			);
		return {
			projectId: project.project.id,
			id: String(hits[0]!.id),
			title: String(hits[0]!.title)
		};
	};
	return {
		mustProjects: scenario.mustProjects.map((name) => byName(name).project.id),
		helpfulProjects: scenario.helpfulProjects.map((name) => byName(name).project.id),
		previousFocus: (scenario.previousFocus ?? []).map((name) => byName(name).project.id),
		must: scenario.must.map(record),
		helpful: scenario.helpful.map(record)
	};
}

/** Today's global prompt names projects, next steps and top goals; no records, no bodies. */
function todayPromptText(projects: WorkspaceProjectInputV1[]): string {
	const newest = [...projects].sort(
		(a, b) => Date.parse(b.project.updated_at ?? '') - Date.parse(a.project.updated_at ?? '')
	);
	return newest
		.slice(0, 80)
		.map((p, i) => {
			const next = String(p.project.next_step_short ?? '').slice(0, i < 8 ? 160 : 120);
			const goal = i < 8 ? ` Top goal: ${String(p.goals[0]?.name ?? '').slice(0, 100)}` : '';
			return `${p.project.name}: ${p.project.state_key}. Next step: ${next}.${goal}`;
		})
		.join('\n');
}

const lean = (projects: WorkspaceProjectInputV1[]) =>
	projects.map((p) => ({
		...p,
		documents: [],
		tasks: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	}));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const tokens = (n: number) => Math.round(n / 3.3);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const quantile = (xs: number[], q: number) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
};

function readKey(): string | undefined {
	if (process.env.PRIVATE_OPENROUTER_API_KEY) return process.env.PRIVATE_OPENROUTER_API_KEY;
	for (const f of ['apps/worker/.env', '.env']) {
		const p = join(REPO, f);
		if (!existsSync(p)) continue;
		const m = /^PRIVATE_OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync(p, 'utf8'));
		if (m) return m[1]!.trim().replace(/^["']|["']$/g, '');
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Dry run: sizes, label resolution, today's baseline.

function dry(projects: WorkspaceProjectInputV1[], scenarios: Scenario[], out: string[]) {
	const today = todayPromptText(projects).toLowerCase();
	out.push('## Dry run', '');
	const titleTotal = projects.reduce(
		(n, p) =>
			n +
			p.documents.length +
			p.tasks.length +
			p.goals.length +
			p.plans.length +
			p.milestones.length +
			p.risks.length,
		0
	);
	out.push(
		`- Projects: ${projects.length}; records: ${titleTotal}; document text: ${projects.reduce((n, p) => n + p.documents.reduce((m, d) => m + String(d.content ?? '').length, 0), 0).toLocaleString()} chars.`,
		`- Today's global prompt project lines: ${today.length.toLocaleString()} chars (approximation).`,
		''
	);
	out.push(
		'| Scenario | Hop 1 bytes (full / lean) | Title cap | Est. hop 1 $ | Must records named today | Hop 2 entities (must projects) |',
		'| --- | --- | --- | --- | --- | --- |'
	);
	let hop1Usd = 0;
	for (const s of scenarios) {
		const labels = resolveLabels(projects, s);
		const full = capWorkspaceCards(projects, s.message, {
			recentConversation: s.recent,
			previousFocus: labels.previousFocus
		});
		const leanCards = capWorkspaceCards(lean(projects), s.message, {
			recentConversation: s.recent
		});
		const usd = tokens(full.requestBytes + leanCards.requestBytes) * JEV_USD_PER_INPUT_TOKEN;
		hop1Usd += usd;
		const named = labels.must.filter((r) => today.includes(r.title.toLowerCase().slice(0, 40)));
		const hop2 = labels.mustProjects.map((id) => {
			const p = projects.find((x) => x.project.id === id)!;
			const entities = buildContextFinderEntities(p);
			const request = buildContextFinderRequest({
				project: p.project,
				entities,
				message: s.message
			});
			return `${entities.length} (${Math.round(bytes(request) / 1000)} KB)`;
		});
		out.push(
			`| ${s.key} | ${Math.round(full.requestBytes / 1000)} KB / ${Math.round(leanCards.requestBytes / 1000)} KB | ${full.titleCap} | $${usd.toFixed(5)} | ${named.length}/${labels.must.length} | ${hop2.join(', ') || '—'} |`
		);
	}
	out.push(
		'',
		`Estimated hop 1 cost for one pass over all scenarios: $${hop1Usd.toFixed(4)}.`,
		''
	);
}

// ---------------------------------------------------------------------------
// Live: hop 1 (full and lean cards) and hop 2 for the top three projects; answers cached.

async function live(
	projects: WorkspaceProjectInputV1[],
	scenarios: Scenario[],
	reps: number,
	cacheDir: string,
	maxUsd: number
) {
	const apiKey = readKey();
	if (!apiKey) throw new Error('No PRIVATE_OPENROUTER_API_KEY');
	const client = new JevClient({
		apiKey,
		timeoutMs: 20_000,
		retryOnce: false,
		title: 'BuildOS Jev global context eval'
	});
	const byId = new Map(projects.map((p) => [p.project.id, p]));
	let spent = 0;
	for (let rep = 0; rep < reps; rep++) {
		for (const s of scenarios) {
			const file = join(cacheDir, `${s.key}-${rep}.json`);
			if (existsSync(file)) continue;
			if (spent >= maxUsd)
				throw new Error(`Stopped: spent $${spent.toFixed(4)} ≥ $${maxUsd}`);
			const labels = resolveLabels(projects, s);
			const common = {
				decider: client,
				message: s.message,
				recentConversation: s.recent,
				previousFocus: labels.previousFocus
			};
			const [full, leanRanking] = await Promise.all([
				rankWorkspaceProjects({ ...common, projects }),
				rankWorkspaceProjects({ ...common, projects: lean(projects) })
			]);
			const top = full.projects.slice(0, HOP2_CANDIDATES);
			const zoomed = await Promise.all(
				top.map((pick) =>
					rankWorkspaceZoom({
						project: byId.get(pick.id)!,
						decider: client,
						message: s.message,
						recentConversation: s.recent,
						timeoutMs: 20_000
					}).then((z) => [pick.id, z.ranking] as const)
				)
			);
			const cached: Cached = {
				key: s.key,
				rep,
				full,
				lean: leanRanking,
				zoom: Object.fromEntries(zoomed)
			};
			const cost =
				(full.costUsd ?? 0) +
				(leanRanking.costUsd ?? 0) +
				zoomed.reduce((n, [, r]) => n + (r.costUsd ?? 0), 0);
			spent += cost;
			writeFileSync(file, JSON.stringify(cached));
			console.log(
				`${s.key}#${rep} scope=${full.scope?.choice} top=${top.map((p) => `${p.name.slice(0, 18)}:${p.p}`).join(', ')} hop1=${full.durationMs}ms $${cost.toFixed(5)} (total $${spent.toFixed(4)})`
			);
		}
	}
	return spent;
}

// ---------------------------------------------------------------------------
// Replay: policies over cached answers.

type Policy = { name: string; floor?: number; relative?: number; maxZoom?: number };
const POLICIES: Policy[] = [
	{ name: 'workspace_v1 (floor .3, 60% of top, ≤3)' },
	{ name: 'top-1 only', maxZoom: 1 },
	{ name: '≤2 projects', maxZoom: 2 },
	{ name: 'floor .4', floor: 0.4 },
	{ name: 'floor .25, 50% of top', floor: 0.25, relative: 0.5 },
	{ name: '70% of top', relative: 0.7 }
];

type Row = {
	key: string;
	rep: number;
	scopeOk: boolean;
	scope: string | null;
	projRecall: number | null;
	zoomCount: number;
	mustFull: number | null;
	mustNamed: number | null;
	helpfulNamed: number | null;
	controlClean: boolean | null;
	chars: number;
	latencyMs: number;
	speculativeMs: number | null;
	costUsd: number;
	context: WorkspaceContextV1;
};

function evaluate(
	projects: WorkspaceProjectInputV1[],
	scenario: Scenario,
	cached: Cached,
	policy: Policy
): Row {
	const labels = resolveLabels(projects, scenario);
	const ranking = cached.full;
	const selection = selectWorkspaceProjects(ranking, policy);
	const byId = new Map(projects.map((p) => [p.project.id, p]));
	const zoom = selection.zoom.map((pick, i) => {
		const scored = cached.zoom[pick.id];
		if (!scored) return { project: pick, plan: null, evidence: null, error: 'not_cached' };
		const project = byId.get(pick.id)!;
		const planned = planWorkspaceZoom(
			{ project, entities: buildContextFinderEntities(project), ranking: scored },
			workspaceZoomShare(i, selection.zoom.length)
		);
		return { project: pick, ...planned, error: null };
	});
	const pulse = selection.pulse.map((pick) => {
		const p = byId.get(pick.id)!;
		return { ...pick, state: p.project.state_key ?? null, text: workspacePulseText(p) };
	});
	const loaded = zoom.some((z) => z.evidence?.status === 'selected');
	const context: WorkspaceContextV1 = {
		version: 'workspace_context_v1',
		status:
			ranking.status === 'unavailable'
				? 'unavailable'
				: selection.scope === 'none'
					? 'skipped'
					: loaded || pulse.length
						? 'selected'
						: 'empty',
		ranking,
		selection,
		zoom,
		pulse,
		durationMs: 0,
		costUsd: null
	};
	const full = new Set(zoom.flatMap((z) => z.evidence?.full.map((x) => x.id) ?? []));
	const named = new Set([
		...full,
		...zoom.flatMap((z) => z.evidence?.summaries.map((x) => x.id) ?? [])
	]);
	const zoomIds = new Set(selection.zoom.map((p) => p.id));
	const frac = (xs: Resolved[], set: Set<string>) =>
		xs.length ? xs.filter((x) => set.has(x.id)).length / xs.length : null;
	const hop2 = selection.zoom.map((p) => cached.zoom[p.id]).filter(Boolean);
	const hop2Ms = Math.max(0, ...hop2.map((r) => r!.durationMs));
	const guess = labels.previousFocus[0];
	const guessed = guess && zoomIds.has(guess) ? cached.zoom[guess] : undefined;
	const others = selection.zoom.filter((p) => p.id !== guess).map((p) => cached.zoom[p.id]);
	const speculativeMs = guessed
		? Math.max(
				ranking.durationMs + Math.max(0, ...others.map((r) => r?.durationMs ?? 0)),
				guessed.durationMs
			)
		: null;
	return {
		key: scenario.key,
		rep: cached.rep,
		scopeOk: ranking.scope?.choice === scenario.expectScope,
		scope: ranking.scope?.choice ?? null,
		projRecall: labels.mustProjects.length
			? labels.mustProjects.filter((id) => zoomIds.has(id)).length /
				labels.mustProjects.length
			: null,
		zoomCount: selection.zoom.length,
		mustFull: frac(labels.must, full),
		mustNamed: frac(labels.must, named),
		helpfulNamed: frac(labels.helpful, named),
		controlClean: scenario.control ? selection.zoom.length === 0 : null,
		chars: renderWorkspaceContextBlock(context)?.length ?? 0,
		latencyMs: ranking.durationMs + (selection.zoom.length ? hop2Ms : 0),
		speculativeMs,
		costUsd: (ranking.costUsd ?? 0) + hop2.reduce((n, r) => n + (r!.costUsd ?? 0), 0),
		context
	};
}

function replay(
	projects: WorkspaceProjectInputV1[],
	scenarios: Scenario[],
	cacheDir: string,
	outDir: string,
	out: string[]
) {
	const files = readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
	const caches = files.map((f) => JSON.parse(readFileSync(join(cacheDir, f), 'utf8')) as Cached);
	const byKey = new Map(scenarios.map((s) => [s.key, s]));
	const reps = new Set(caches.map((c) => c.rep)).size;
	out.push(`## Replay (${caches.length} cached runs, ${reps} reps)`, '');

	// Hop 1 alone: where do the must projects rank, with full cards vs name/description only?
	out.push(
		'### Hop 1: rank of the must projects (full cards vs lean cards)',
		'',
		'| Scenario | Scope (expected) | Full cards: must ranks | Lean cards: must ranks | Top 3 (full) |',
		'| --- | --- | --- | --- | --- |'
	);
	for (const s of scenarios) {
		const runs = caches.filter((c) => c.key === s.key);
		if (!runs.length) continue;
		const labels = resolveLabels(projects, s);
		const ranks = (r: WorkspaceRankingV1) =>
			labels.mustProjects
				.map((id) => r.projects.findIndex((p) => p.id === id) + 1)
				.join('+') || '—';
		const scopes = runs.map((c) => c.full.scope?.choice ?? '∅').join('/');
		const top = runs[0]!.full.projects
			.slice(0, 3)
			.map((p) => `${p.name.slice(0, 22)} ${p.p.toFixed(2)}`)
			.join('; ');
		out.push(
			`| ${s.key} | ${scopes} (${s.expectScope}) | ${runs.map((c) => ranks(c.full)).join(' / ')} | ${runs.map((c) => ranks(c.lean)).join(' / ')} | ${top} |`
		);
	}
	out.push('');

	out.push(
		'### Policies (mean over scenarios × reps)',
		'',
		'| Policy | Scope right | Must project zoomed | Projects zoomed | Must records loaded | Must records named | Controls clean | Added chars | p50 / p95 latency | $/turn |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	const detail: Row[] = [];
	for (const policy of POLICIES) {
		const rows = caches.map((c) => evaluate(projects, byKey.get(c.key)!, c, policy));
		if (policy === POLICIES[0]) detail.push(...rows);
		const avg = (pick: (r: Row) => number | boolean | null) =>
			mean(
				rows
					.map(pick)
					.filter((x): x is number | boolean => x !== null)
					.map(Number)
			);
		out.push(
			`| ${policy.name} | ${pct(avg((r) => r.scopeOk))} | ${pct(avg((r) => r.projRecall))} | ${avg((r) => r.zoomCount).toFixed(1)} | ${pct(avg((r) => r.mustFull))} | ${pct(avg((r) => r.mustNamed))} | ${pct(avg((r) => r.controlClean))} | ${Math.round(avg((r) => r.chars)).toLocaleString()} | ${quantile(
				rows.map((r) => r.latencyMs),
				0.5
			)} / ${quantile(
				rows.map((r) => r.latencyMs),
				0.95
			)} ms | $${avg((r) => r.costUsd).toFixed(5)} |`
		);
	}
	out.push('', '### Default policy, per scenario (mean over reps)', '');
	out.push(
		'| Scenario | Scope | Zoomed | Must project | Must loaded | Must named | Helpful named | Chars | Latency (speculative) |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const s of scenarios) {
		const rows = detail.filter((r) => r.key === s.key);
		if (!rows.length) continue;
		const m = (pick: (r: Row) => number | null) => {
			const xs = rows.map(pick).filter((x): x is number => x !== null);
			return xs.length ? pct(mean(xs)) : '—';
		};
		const spec = rows.map((r) => r.speculativeMs).filter((x): x is number => x !== null);
		out.push(
			`| ${s.key} | ${rows.map((r) => r.scope).join('/')} | ${rows.map((r) => r.context.selection.zoom.map((p) => p.name.slice(0, 14)).join('+') || '∅').join(' / ')} | ${m((r) => r.projRecall)} | ${m((r) => r.mustFull)} | ${m((r) => r.mustNamed)} | ${m((r) => r.helpfulNamed)} | ${Math.round(mean(rows.map((r) => r.chars)))} | ${Math.round(mean(rows.map((r) => r.latencyMs)))} ms${spec.length ? ` (${Math.round(mean(spec))} ms)` : ''} |`
		);
	}
	out.push('');
	// Private: the full blocks and selections, for the explainer.
	writeFileSync(
		join(outDir, 'explainer.json'),
		JSON.stringify(
			detail
				.filter((r) => r.rep === 0)
				.map((r) => {
					const s = byKey.get(r.key)!;
					const labels = resolveLabels(projects, s);
					const lean = caches.find((c) => c.key === r.key && c.rep === 0)!.lean;
					return {
						key: r.key,
						source: s.source,
						message: s.message,
						expectScope: s.expectScope,
						control: !!s.control,
						scope: r.context.ranking.scope,
						projects: r.context.ranking.projects.slice(0, 10),
						leanProjects: lean.projects.slice(0, 10),
						mustProjects: labels.mustProjects,
						helpfulProjects: labels.helpfulProjects,
						must: labels.must,
						helpful: labels.helpful,
						selection: r.context.selection,
						zoom: r.context.zoom.map((z) => ({
							project: z.project,
							full: z.evidence?.full.map((x) => ({
								id: x.id,
								kind: x.kind,
								title: x.title,
								p: x.p,
								sections: x.excerpts.map((e) => e.heading).filter(Boolean)
							})),
							summaries: z.evidence?.summaries.map((x) => ({
								id: x.id,
								kind: x.kind,
								title: x.title,
								p: x.p
							}))
						})),
						pulse: r.context.pulse.map(({ text, ...rest }) => ({
							...rest,
							text: text.slice(0, 240)
						})),
						metrics: {
							scopeOk: r.scopeOk,
							projRecall: r.projRecall,
							mustFull: r.mustFull,
							mustNamed: r.mustNamed,
							helpfulNamed: r.helpfulNamed,
							chars: r.chars,
							latencyMs: r.latencyMs,
							speculativeMs: r.speculativeMs,
							hop1Ms: r.context.ranking.durationMs,
							costUsd: r.costUsd
						},
						block: renderWorkspaceContextBlock(r.context)
					};
				}),
			null,
			1
		)
	);
}

async function main() {
	const argv = process.argv.slice(2);
	const arg = (name: string, dflt?: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : dflt;
	};
	const dump = arg('--dump');
	const outDir = arg('--out');
	if (!dump || !outDir) throw new Error('--dump <file> --out <dir> are required');
	const projects = loadDump(dump);
	const scenarios = JSON.parse(
		readFileSync(arg('--scenarios', SCENARIOS)!, 'utf8')
	) as Scenario[];
	const cacheDir = join(outDir, 'cache');
	mkdirSync(cacheDir, { recursive: true });
	const out = [`# Jev global context eval (${new Date().toISOString()})`, ''];
	dry(projects, scenarios, out);
	if (argv.includes('--live')) {
		if (process.env.JEV_GLOBAL_EVAL_LIVE !== '1')
			throw new Error('Live runs are paid: set JEV_GLOBAL_EVAL_LIVE=1 after approval');
		const spent = await live(
			projects,
			scenarios,
			Number(arg('--reps', '1')),
			cacheDir,
			Number(arg('--max-usd', '0.25'))
		);
		out.push(`Live spend by receipts this run: $${spent.toFixed(4)}.`, '');
	}
	if (argv.includes('--live') || argv.includes('--replay'))
		replay(projects, scenarios, cacheDir, outDir, out);
	writeFileSync(join(outDir, 'REPORT.md'), out.join('\n'));
	console.log(out.join('\n'));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
