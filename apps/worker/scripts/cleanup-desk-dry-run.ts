// apps/worker/scripts/cleanup-desk-dry-run.ts
//
// Dry run of the AI Inbox "Assistant's Desk" review steps on one real project (tasker 149),
// READ-ONLY: the Supabase client throws on every insert, update, upsert, delete or rpc, and
// nothing is ever applied.
//
//   Free (default): the cleanup list the roll-up would read, and which tidy-ups would go to
//                   Jev for auto-apply (with the request size).
//     NODE_OPTIONS=--conditions=development pnpm --filter @buildos/worker exec tsx \
//       scripts/cleanup-desk-dry-run.ts --project <id> --out <dir>
//
//   --live (paid, about $0.02): runs the real roll-up call (pre-written questions) and Jev's
//          four auto-apply questions, then prints each question and each tidy-up's scores
//          against the bar. Also needs PROJECT_LOOP_REPLAY_PAID=yes.
//
// Output holds private project content; keep --out outside the repo (for example a scratchpad).
// The roll-up here is fed from the current open rows, not a fresh review pass, so findings a
// new pass would add are not in it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { JevClient, SmartLLMService } from '@buildos/smart-llm';
import type { ProjectCleanupSection } from '@buildos/shared-types';
import {
	loadContextFinderProject,
	type ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	type CleanupItemFacts,
	cleanupSourceForKind,
	loadProjectCleanupRows,
	loadProjectCleanupView
} from '@buildos/shared-agent-ops/project-cleanup';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	readStartHereAuthoredSections
} from '@buildos/shared-agent-ops/ontology/start-here';
import {
	generateProjectCleanupSynthesis,
	type LoopContext
} from '../src/workers/project-loop/generators';
import type { CleanupSynthesisItem } from '../src/workers/project-loop/cleanupSynthesis';
import { allowedSections } from '../src/workers/project-loop/cleanupPass';
import type { OpenReviewRow } from '../src/workers/project-loop/reviewRollupStore';
import {
	CLEANUP_AUTO_APPLY_POLICY,
	CLEANUP_AUTO_APPLY_QUESTION_SET_VERSION,
	type CleanupAutoApplyCandidate,
	type CleanupAutoApplyTool,
	buildCleanupAutoApplyRequest,
	passesCleanupAutoApplyGate,
	readCleanupAutoApplyScores
} from '../src/workers/project-loop/cleanupAutoApply';

dotenv.config();

const args = process.argv.slice(2);
const option = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const projectId = option('--project');
const outDir = option('--out');
const live = args.includes('--live');
if (!projectId || !outDir) {
	console.error('Usage: cleanup-desk-dry-run.ts --project <id> --out <dir> [--live]');
	process.exit(2);
}
if (live && process.env.PROJECT_LOOP_REPLAY_PAID !== 'yes') {
	console.error('--live calls paid models; set PROJECT_LOOP_REPLAY_PAID=yes.');
	process.exit(2);
}
const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
const openRouterKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
if (!url || !key || (live && !openRouterKey)) {
	console.error(
		'PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY (and for --live PRIVATE_OPENROUTER_API_KEY) are required.'
	);
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
						throw new Error(`cleanup-desk-dry-run is read-only (${prop})`);
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

const time = (value: unknown) => {
	const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
};

/** The worker's loop context, rebuilt from the finder snapshot (as project-loop-replay does). */
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
		documents: [],
		docStructureSummary: '(not loaded by the dry run)',
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

const AUTO_TOOLS = new Set<string>(CLEANUP_AUTO_APPLY_POLICY.tools);

async function main() {
	const out = resolve(outDir!);
	mkdirSync(out, { recursive: true });
	const signal = new AbortController().signal;
	const project = await loadContextFinderProject(db as never, projectId!, signal);
	const ctx = loopContext(project);
	const [rows, view] = await Promise.all([
		loadProjectCleanupRows(db as never, projectId!),
		loadProjectCleanupView(db as never, projectId!, { verify: true })
	]);
	const rowById = new Map(rows.map((row) => [row.id, row]));
	// The card as the inbox would load it today (for UI checks with real data).
	writeFileSync(join(out, 'view.json'), JSON.stringify(view, null, 2));

	// The roll-up's input, built like the pass does (radar bundles are not fed to it).
	const reviewItems = view.items.filter((item) => item.source !== 'radar');
	const items: CleanupSynthesisItem[] = reviewItems.map((item, index) => {
		const itemRows = item.rows.map((row) => rowById.get(row.suggestion_id)).filter(Boolean);
		const executableRows = item.rows.filter((row) => row.operation_count > 0);
		const facts: CleanupItemFacts = {
			source: cleanupSourceForKind(item.kind),
			kind: item.kind,
			executable: item.executable,
			reversible: itemRows.some((row) => row?.reversible === false) ? false : true,
			tools: [...new Set(itemRows.flatMap((row) => row!.operations.map((op) => op.tool)))],
			cautions: [
				...item.rows.flatMap((row) => row.cautions ?? []),
				...(executableRows.some((row) => !row.verified_fingerprint)
					? ['Not verified this pass.']
					: [])
			],
			hasReviewItems: false
		};
		const headlines = item.rows.map((row) => row.verified_headline).filter(Boolean) as string[];
		return {
			handle: `i${index + 1}`,
			lineageId: item.id,
			kind: item.kind,
			source: item.source,
			title: item.title,
			summary: item.summary,
			change: headlines.length ? headlines.join(' · ') : null,
			executable: item.executable,
			fresh: false,
			firstSeenAt: item.first_seen_at,
			seenCount: item.seen_count,
			about: item.evidence_refs.slice(0, 6).map((ref) => `${ref.entity_type}: ${ref.title}`),
			cautions: facts.cautions,
			allowedSections: allowedSections(facts),
			judged: item.kind !== 'audit_recommendation'
		};
	});
	console.log(
		`Open cleanup items fed to the roll-up: ${items.length} (radar items left out: ${view.items.length - reviewItems.length})`
	);
	writeFileSync(join(out, 'rollup-items.json'), JSON.stringify(items, null, 2));

	const candidatesFor = (
		sections: ReadonlyMap<string, ProjectCleanupSection>
	): CleanupAutoApplyCandidate[] =>
		reviewItems.flatMap((item) => {
			if (sections.get(item.id) !== 'safe_cleanup') return [];
			const itemRows = item.rows.map((row) => rowById.get(row.suggestion_id));
			if (itemRows.some((row) => !row)) return [];
			const verified = item.rows.every(
				(row) => row.verified_fingerprint && !row.cautions?.length
			);
			const tools = [
				...new Set(itemRows.flatMap((row) => row!.operations.map((op) => op.tool)))
			];
			if (!verified || !tools.length || !tools.every((tool) => AUTO_TOOLS.has(tool)))
				return [];
			return [
				{
					lineageId: item.id,
					headline: item.rows
						.map((row) => row.verified_headline)
						.filter(Boolean)
						.join('; '),
					summary: item.summary,
					evidenceTitles: item.evidence_refs.map((ref) => ref.title).slice(0, 6),
					rows: itemRows as unknown as OpenReviewRow[],
					tools: tools as CleanupAutoApplyTool[],
					firstSeenAt: item.first_seen_at
				}
			];
		});
	const projectView = {
		name: ctx.projectName,
		description: ctx.projectDescription,
		goals: ctx.goals,
		currentState: ctx.startHere?.currentState ?? null
	};
	const currentSections = new Map(reviewItems.map((item) => [item.id, item.section]));
	const preview = buildCleanupAutoApplyRequest({
		project: projectView,
		candidates: candidatesFor(currentSections)
	});
	console.log(
		`Auto-apply candidates (today's sections): ${preview?.candidates.length ?? 0}; Jev request ${preview ? JSON.stringify(preview.request).length : 0} bytes; questions ${CLEANUP_AUTO_APPLY_QUESTION_SET_VERSION}`
	);
	for (const candidate of preview?.candidates ?? [])
		console.log(`  candidate: ${candidate.headline}`);
	if (!live) return;

	let cost = 0;
	const llm = new SmartLLMService({
		apiKey: openRouterKey!,
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS cleanup desk dry run',
		supabase: db as never
	});
	const started = Date.now();
	const synthesis = await generateProjectCleanupSynthesis({
		llm: llm as never,
		ctx,
		items,
		closedThisPass: [],
		userId: 'cleanup-desk-dry-run',
		generatedAt: new Date().toISOString(),
		signal,
		onUsage: async (event: { totalCost?: number }) => {
			cost += event.totalCost ?? 0;
		}
	});
	writeFileSync(join(out, 'synthesis.json'), JSON.stringify(synthesis.synthesis, null, 2));
	console.log(
		`\nRoll-up (${synthesis.synthesis.source}) in ${Date.now() - started} ms, ~$${cost.toFixed(4)}`
	);
	console.log(`Bottom line: ${synthesis.synthesis.bottom_line}`);
	const titleOf = new Map(items.map((item) => [item.lineageId, item.title]));
	for (const ask of synthesis.synthesis.asks ?? []) {
		console.log(`\nQ: ${ask.question}${ask.context ? `\n   ${ask.context}` : ''}`);
		console.log(`   settles: ${ask.item_ids.map((id) => titleOf.get(id) ?? id).join(' | ')}`);
		for (const answer of ask.answers)
			console.log(
				`   - [${answer.action}] ${answer.label}${answer.recommended ? ' (recommended)' : ''}${answer.effect ? ` — ${answer.effect}` : ''}`
			);
	}

	const asked = new Set((synthesis.synthesis.asks ?? []).flatMap((ask) => ask.item_ids));
	const built = buildCleanupAutoApplyRequest({
		project: projectView,
		candidates: candidatesFor(synthesis.sections).filter(
			(candidate) => !asked.has(candidate.lineageId)
		)
	});
	if (!built) {
		console.log('\nNo tidy-ups qualify for auto-apply after the roll-up.');
		return;
	}
	const decider = new JevClient({
		apiKey: openRouterKey!,
		timeoutMs: CLEANUP_AUTO_APPLY_POLICY.jevTimeoutMs,
		maxRequestBytes: CLEANUP_AUTO_APPLY_POLICY.maxRequestBytes,
		retryOnce: false,
		hedgeAfterMs: 1_500,
		title: 'BuildOS cleanup desk dry run'
	});
	const result = await decider.decide(built.request, { signal });
	if (!result.ok) {
		console.log(`\nJev failed: ${result.error}`);
		return;
	}
	const scores = readCleanupAutoApplyScores(
		result.answers as Record<string, unknown>,
		built.candidates.length
	);
	console.log(
		`\nJev (${result.receipt.modelUsed ?? 'jev'}, ${result.receipt.durationMs} ms, $${result.receipt.costUsd ?? 0}):`
	);
	const fmt = (n: number) => n.toFixed(2);
	built.candidates.forEach((candidate, index) => {
		const s = scores[index];
		const verdict = s && passesCleanupAutoApplyGate(s) ? 'WOULD APPLY' : 'would ask';
		console.log(
			`  ${verdict}: ${candidate.headline}${s ? `  [about ${fmt(s.about)} · wanted ${fmt(s.wanted)} · review ${fmt(s.review)} · safe ${fmt(s.safe)}]` : '  [no answer]'}`
		);
	});
	writeFileSync(
		join(out, 'auto-apply-scores.json'),
		JSON.stringify(
			{
				candidates: built.candidates.map((c) => c.headline),
				scores,
				receipt: result.receipt
			},
			null,
			2
		)
	);
	console.log(
		`\nTotal ~$${(cost + (result.receipt.costUsd ?? 0)).toFixed(4)} (nothing was written)`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
