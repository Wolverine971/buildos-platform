// apps/worker/scripts/project-loop-replay.ts
//
// Replays the Project Review drift evidence and prompts on one real project, READ-ONLY
// (tasker 107). It never inserts, updates, deletes or calls a write RPC: the Supabase client is
// wrapped in a proxy that throws on any of those.
//
//   Free (default): recent section changes, fallback evidence, and the exact drift and
//                   manager-brief prompts, captured from a stub model.
//     NODE_OPTIONS=--conditions=development pnpm --filter @buildos/worker exec tsx \
//       scripts/project-loop-replay.ts --project <id> --out <dir>
//
//   --jev   (paid, about $0.001): Jev ranks the related sections, as the worker does.
//   --live  (paid, about $0.01):  also runs the four detectors and the manager brief on the
//           real model and prints the brief. Model usage is logged like any worker call.
//   Paid modes also need PROJECT_LOOP_REPLAY_PAID=yes.
//
// Output holds private project content; keep --out outside the repo (for example a scratchpad).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { JevClient, SmartLLMService } from '@buildos/smart-llm';
import type { ProposedSuggestion } from '@buildos/shared-types';
import {
	loadContextFinderProject,
	type ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	readStartHereAuthoredSections
} from '@buildos/shared-agent-ops/ontology/start-here';
import { verifyProjectSuggestionIntegrity } from '@buildos/shared-agent-ops/proposal-context';
import {
	generateDocOrganization,
	generateDrift,
	generateOutdatedDocs,
	generateProjectManagerBrief,
	generateTaskConflicts,
	type LoopContext,
	type ProjectReviewSynthesisCandidate,
	type RadarConcernSubject,
	withoutRadarOwnedFindings
} from '../src/workers/project-loop/generators';
import { buildTaskPairRequest, rankTaskConflictPairs } from '../src/workers/project-loop/taskPairs';
import {
	type DriftEvidenceClient,
	loadProjectDriftEvidence,
	renderDriftEvidence
} from '../src/workers/project-loop/driftEvidence';

dotenv.config();

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};

const projectId = option('--project');
const outDir = option('--out');
const live = flag('--live');
const jev = live || flag('--jev');
if (!projectId || !outDir) {
	console.error('Usage: project-loop-replay.ts --project <id> --out <dir> [--jev | --live]');
	process.exit(2);
}
if (jev && process.env.PROJECT_LOOP_REPLAY_PAID !== 'yes') {
	console.error('--jev and --live call paid models; set PROJECT_LOOP_REPLAY_PAID=yes.');
	process.exit(2);
}

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
const openRouterKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
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
						throw new Error(`project-loop-replay is read-only (${prop})`);
					};
				const next = Reflect.get(obj, prop, receiver);
				if (typeof next !== 'function') return next;
				return (...callArgs: unknown[]) => {
					const result = (next as (...a: unknown[]) => unknown).apply(obj, callArgs);
					// Keep thenables awaitable, wrap builders.
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
const client = db as unknown as DriftEvidenceClient;

const time = (value: unknown) => {
	const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
};

/** The worker's loop context, rebuilt from the finder snapshot (no write RPC needed). */
function loopContext(project: ContextFinderProjectV1): LoopContext {
	const startHereDoc = project.documents.find(
		(doc) => doc.type_key === START_HERE_DOCUMENT_TYPE_KEY
	);
	const sections = startHereDoc
		? readStartHereAuthoredSections(String(startHereDoc.content ?? ''))
		: null;
	return {
		projectId: project.project.id,
		projectName: project.project.name,
		projectDescription: project.project.description ?? null,
		goals: project.goals.map((goal) => ({
			name: String(goal.name ?? 'Untitled goal'),
			description: (goal.description as string | null) ?? null
		})),
		documents: [...project.documents]
			.sort((a, b) => time(b.updated_at) - time(a.updated_at))
			.slice(0, 40)
			.map((doc) => ({
				id: String(doc.id),
				title: String(doc.title ?? 'Untitled'),
				type_key: (doc.type_key as string | null) ?? null,
				state_key: null,
				description: (doc.description as string | null) ?? null,
				updated_at: (doc.updated_at as string | null) ?? null,
				parent_id: null
			})),
		docStructureSummary: '(not loaded by the replay)',
		tasks: project.tasks
			.filter((task) => task.state_key !== 'done')
			.sort((a, b) => time(b.updated_at) - time(a.updated_at))
			.slice(0, 20)
			.map((task) => ({
				id: String(task.id),
				title: String(task.title ?? 'Untitled'),
				description: (task.description as string | null) ?? null,
				state_key: (task.state_key as string | null) ?? null,
				priority: (task.priority as number | null) ?? null,
				due_at: (task.due_at as string | null) ?? null,
				updated_at: (task.updated_at as string | null) ?? null
			})),
		priorDecisions: [],
		plans: [...project.plans]
			.sort((a, b) => time(a.created_at) - time(b.created_at))
			.map((plan) => ({
				name: String(plan.name ?? 'Untitled plan'),
				state_key: (plan.state_key as string | null) ?? null
			})),
		startHere: sections
			? {
					currentState: sections['Current state'] ?? null,
					decisions: sections.Decisions ?? null,
					openQuestions: sections['Open questions'] ?? null
				}
			: null
	};
}

async function main() {
	const out = resolve(outDir!);
	mkdirSync(out, { recursive: true });
	const signal = new AbortController().signal;
	const project = await loadContextFinderProject(client, projectId!, signal);
	const ctx = loopContext(project);
	const { data: concernRows } = await (db as unknown as { from: (t: string) => any })
		.from('freshness_concerns')
		.select('subject_kind, subject_id, subject_title')
		.eq('project_id', projectId!)
		.eq('status', 'open');
	const radarConcerns: RadarConcernSubject[] = (concernRows ?? []).map(
		(row: Record<string, unknown>) => ({
			kind: String(row.subject_kind),
			id: String(row.subject_id),
			title: String(row.subject_title)
		})
	);
	console.log(`Radar concerns (open): ${radarConcerns.map((c) => c.title).join('; ') || 'none'}`);
	const pairRequest = buildTaskPairRequest({
		project: { name: ctx.projectName, description: ctx.projectDescription },
		tasks: ctx.tasks
	});
	console.log(
		`Task pairs: ${Object.keys(pairRequest.request.questions).length} questions over ${pairRequest.tasks.length} open tasks (${JSON.stringify(pairRequest.request).length} bytes)`
	);

	const decider =
		jev && openRouterKey
			? new JevClient({
					apiKey: openRouterKey,
					timeoutMs: 6_000,
					maxRequestBytes: 96_000,
					retryOnce: false,
					hedgeAfterMs: 1_500,
					title: 'BuildOS Project Loop replay'
				})
			: null;
	const started = Date.now();
	const evidence = await loadProjectDriftEvidence({
		client,
		projectId: projectId!,
		decider,
		signal,
		project
	});
	const evidenceMs = Date.now() - started;
	if (!evidence) throw new Error('Drift evidence unavailable');
	writeFileSync(join(out, 'drift-evidence.json'), JSON.stringify(evidence, null, 2));
	writeFileSync(join(out, 'drift-evidence.md'), renderDriftEvidence(evidence));
	console.log(
		`Evidence: ${evidence.changes.length} changes, ${evidence.related.length} related (${evidence.source}${evidence.fallbackReason ? `: ${evidence.fallbackReason}` : ''}) in ${evidenceMs} ms; Jev cost ${evidence.ranker?.costUsd ?? 0}`
	);
	for (const change of evidence.changes)
		console.log(
			`  change  ${change.documentTitle} › ${change.heading ?? '(opening)'} [${change.change}]`
		);
	for (const item of evidence.related)
		console.log(
			`  related ${item.kind} ${item.title} › ${item.excerpts.map((x) => x.heading ?? '(opening)').join(' | ')}`
		);

	// Capture the exact prompts with a stub model (free).
	const prompts: Record<string, { system: string; user: string }> = {};
	const stub = {
		getJSONResponse: async (options: {
			systemPrompt: string;
			userPrompt: string;
			operationType?: string;
		}) => {
			prompts[options.operationType ?? 'unknown'] = {
				system: options.systemPrompt,
				user: options.userPrompt
			};
			return options.operationType === 'project_loop_brief'
				? { brief: null }
				: { suggestions: [] };
		}
	} as unknown as SmartLLMService;
	const onUsage = async () => undefined;
	const userId = 'project-loop-replay';
	await generateDrift({ llm: stub as never, ctx, userId, evidence, radarConcerns, onUsage });
	await generateProjectManagerBrief({ llm: stub as never, ctx, candidates: [], userId, onUsage });
	for (const [name, prompt] of Object.entries(prompts))
		writeFileSync(
			join(out, `${name}.prompt.txt`),
			`${prompt.system}\n\n=====\n\n${prompt.user}`
		);
	console.log(`Prompts: ${Object.keys(prompts).join(', ')} → ${out}`);

	if (!live) return;
	const llm = new SmartLLMService({
		apiKey: openRouterKey!,
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Project Loop replay',
		supabase: db as never
	});
	let cost = 0;
	const meter = async (event: { totalCost?: number }) => {
		cost += event.totalCost ?? 0;
	};
	const common = { llm: llm as never, ctx, userId, onUsage: meter };
	const liveStarted = Date.now();
	const candidatePairs = await rankTaskConflictPairs({
		decider,
		project: { name: ctx.projectName, description: ctx.projectDescription },
		tasks: ctx.tasks
	});
	console.log(
		`Jev task pairs: ${candidatePairs === null ? 'unavailable' : candidatePairs.map((p) => `${ctx.tasks.find((t) => t.id === p.taskAId)?.title} <> ${ctx.tasks.find((t) => t.id === p.taskBId)?.title} (${p.score})`).join('; ') || 'none'}`
	);
	const [docOrg, outdated, drift, conflicts] = await Promise.all([
		generateDocOrganization(common),
		generateOutdatedDocs(common),
		generateDrift({ ...common, evidence, radarConcerns }),
		candidatePairs ? generateTaskConflicts({ ...common, candidatePairs }) : Promise.resolve([])
	]);
	const filtered = withoutRadarOwnedFindings(
		[...outdated, ...conflicts, ...docOrg, ...drift],
		radarConcerns
	);
	if (filtered.dropped) console.log(`Left ${filtered.dropped} finding(s) to the radar.`);
	const suggestions: ProposedSuggestion[] = filtered.kept;
	// The same integrity gate approval runs, read-only against live rows.
	for (const suggestion of suggestions.filter((s) => s.operations.length)) {
		const verification = await verifyProjectSuggestionIntegrity(db, {
			projectId: projectId!,
			operations: suggestion.operations,
			title: suggestion.title,
			preview: suggestion.preview ?? null,
			checkModelAlignment: true
		});
		console.log(
			`  gate ${verification.ok ? 'PASS' : `FAIL ${verification.diagnostic.code}`}: ${suggestion.title}${verification.ok ? ` — ${verification.summary.headline}` : ` — ${verification.diagnostic.message}`}`
		);
	}
	const candidates: ProjectReviewSynthesisCandidate[] = suggestions.map((s, i) => ({
		id: `replay-${i + 1}`,
		kind: s.kind,
		risk_tier: s.risk_tier,
		title: s.title,
		rationale: s.rationale ?? null,
		why_now: s.why_now ?? null,
		evidence_refs: s.evidence_refs ?? [],
		operations: s.operations,
		reversible: s.reversible ?? null
	}));
	const brief = await generateProjectManagerBrief({ ...common, candidates });
	writeFileSync(join(out, 'live-suggestions.json'), JSON.stringify(suggestions, null, 2));
	writeFileSync(join(out, 'live-brief.json'), JSON.stringify(brief, null, 2));
	console.log(
		`Live: ${suggestions.length} suggestions in ${Date.now() - liveStarted} ms, ~$${cost.toFixed(4)}`
	);
	for (const s of suggestions) console.log(`  ${s.kind}: ${s.title}`);
	console.log(`Brief bottom line: ${brief.bottom_line}`);
	console.log(`Next best action: ${brief.next_best_action}`);
	console.log(`Open decisions: ${JSON.stringify(brief.open_decisions)}`);
	console.log(`Contradictions/drift: ${JSON.stringify(brief.contradictions_or_drift)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
