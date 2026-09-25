// apps/worker/scripts/freshness-radar-rollup-replay.ts
//
// Tasker 106 acceptance replay. Re-runs one project's past radar scans, in
// order, through the v2 pipeline (decisions as news, Jev targeting, section
// dig), exactly as live, and merges them into an IN-MEMORY roll-up. Then it
// simulates the user fixing each surfaced subject and runs one more merge to
// show the concern closing. READ-ONLY: the backtest's readOnlyClient throws on
// every write and RPC, and the roll-up never touches the database.
//
//   cd apps/worker && FRESHNESS_ROLLUP_REPLAY_PAID=yes NODE_OPTIONS=--conditions=development \
//     pnpm exec tsx scripts/freshness-radar-rollup-replay.ts --project <id> --user <id> \
//     [--max-usd 0.015] [--out tmp/freshness-rollup-replay/report.json]
//
// Paid: live Jev (freshness radar model), about $0.001 per replayed scan.
// Answers are cached by request SHA-256 under tmp/freshness-rollup-replay/cache,
// so a rerun of the same inputs is free. Stops before a scan once --max-usd is
// spent. Needs FRESHNESS_ROLLUP_REPLAY_PAID=yes and the owner's OK.
//
// Fidelity: tasks, goals and milestones are reconstructed as of each scan (the
// backtest's AsOfFreshnessDataPort); document bodies are CURRENT, except that
// START HERE decisions stamped after the scan's day are hidden from it.
// Output holds private project content and lands under the gitignored tmp/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { JevClient } from '@buildos/smart-llm';
import type { AnswerMap } from '../src/workers/freshness-radar/combine';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	buildFreshnessScanContext,
	entityKey,
	isClosedCandidate
} from '../src/workers/freshness-radar/context';
import {
	FRESHNESS_POLICY_V1 as POLICY,
	readFreshnessRadarJevModel
} from '../src/workers/freshness-radar/freshnessPolicy';
import type { FreshnessCandidate } from '../src/workers/freshness-radar/prefilter';
import { type ConcernRow, mergeConcerns } from '../src/workers/freshness-radar/rollup';
import {
	buildConcernObservations,
	concernReason,
	concernSectionHashes
} from '../src/workers/freshness-radar/rollupStages';
import {
	applyTargeting,
	decideScan,
	namespaceAnswers,
	planScanRequests,
	planTargeting
} from '../src/workers/freshness-radar/scanStages';
import { segmentHashes } from '../src/workers/freshness-radar/sections';
import {
	AsOfFreshnessDataPort,
	BacktestJev,
	type BacktestDataset,
	type ReplayState,
	loadDatasetFromDb,
	newReplayState,
	readOnlyClient
} from './freshness-radar-backtest';

dotenv.config();

const DAY_MS = 86_400_000;
const STAMP = /[_*]\(\s*(\d{4}-\d{2}-\d{2})\s*\)[_*][ \t]*$/;

/** START HERE with every decision stamped after `civilDay` removed (a structured stamp, not prose). */
export function startHereAsOf(content: string, civilDay: string): string {
	return content
		.split('\n')
		.filter((line) => {
			const stamp = STAMP.exec(line);
			return !stamp || stamp[1]! <= civilDay;
		})
		.join('\n');
}

class ReplayPort extends AsOfFreshnessDataPort {
	constructor(
		dataset: BacktestDataset,
		at: string,
		state: ReplayState,
		private readonly civilDay: string,
		private readonly startHereIds: ReadonlySet<string>,
		private readonly overrides: ReadonlyMap<string, string> = new Map()
	) {
		super(dataset, at, state);
	}

	override async loadDocumentBodies(ids: readonly string[], maxChars: number) {
		const bodies = await super.loadDocumentBodies(ids, maxChars);
		for (const id of ids) {
			const override = this.overrides.get(id);
			if (override !== undefined) bodies.set(id, override.slice(0, maxChars));
			const body = bodies.get(id);
			if (body && this.startHereIds.has(id))
				bodies.set(id, startHereAsOf(body, this.civilDay));
		}
		return bodies;
	}
}

type HistoricalScan = {
	id: string;
	created_at: string;
	mode: string;
	trigger_session_id: string | null;
};

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

/** Insert one line under each named heading: the simulated section fix. */
function editSections(body: string, headings: readonly string[]): string {
	const lines = body.split('\n');
	for (const heading of headings) {
		const at = lines.findIndex(
			(line) => /^#{1,6}\s/.test(line) && line.replace(/^#{1,6}\s+/, '').trim() === heading
		);
		if (at >= 0) lines.splice(at + 1, 0, '', '_Updated to match the recorded decisions._');
	}
	return lines.join('\n');
}

async function main() {
	const args = process.argv.slice(2);
	const projectId = option(args, '--project');
	const userId = option(args, '--user');
	const maxUsd = Number(option(args, '--max-usd') ?? '0.015');
	const outFile = option(args, '--out') ?? 'tmp/freshness-rollup-replay/report.json';
	if (!projectId || !userId) {
		throw new Error('usage: --project <id> --user <id> [--max-usd n] [--out file]');
	}
	if (process.env.FRESHNESS_ROLLUP_REPLAY_PAID !== 'yes') {
		throw new Error(
			'Live Jev calls are paid: set FRESHNESS_ROLLUP_REPLAY_PAID=yes (owner OK first).'
		);
	}
	if (!outFile.startsWith('tmp/')) throw new Error('--out must be under the gitignored tmp/');

	const db = readOnlyClient(
		createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.PRIVATE_SUPABASE_SERVICE_KEY!, {
			auth: { persistSession: false }
		})
	);
	const scansRead = await db
		.from('freshness_scans')
		.select('id, created_at, mode, trigger_session_id')
		.eq('project_id', projectId)
		.eq('user_id', userId)
		.eq('status', 'completed')
		.order('created_at', { ascending: true })
		.limit(20);
	if (scansRead.error) throw new Error(`freshness_scans: ${scansRead.error.message}`);
	const scans = (scansRead.data ?? []) as HistoricalScan[];
	if (!scans.length) throw new Error('no completed scans for this project');

	const now = new Date();
	const dataset = await loadDatasetFromDb(db, {
		userId,
		from: new Date(Date.parse(scans[0]!.created_at) - DAY_MS).toISOString(),
		to: now.toISOString(),
		projectIds: [projectId],
		ledger: false,
		now
	});
	const startHereIds = new Set(
		dataset.documents
			.filter((doc) => doc.type_key === START_HERE_DOCUMENT_TYPE_KEY)
			.map((doc) => doc.id)
	);

	const model = readFreshnessRadarJevModel(process.env);
	const jev = new BacktestJev({
		mode: 'live',
		model,
		cacheDir: 'tmp/freshness-rollup-replay/cache',
		inline: {},
		live: new JevClient({
			apiKey: process.env.PRIVATE_OPENROUTER_API_KEY!,
			model,
			timeoutMs: POLICY.jev.timeoutMs,
			maxRequestBytes: POLICY.jev.maxRequestBytes,
			retryOnce: true,
			title: 'BuildOS freshness roll-up replay'
		}),
		timeoutMs: POLICY.jev.timeoutMs
	});

	const state = newReplayState();
	let open: ConcernRow[] = [];
	const closedRows: Array<ConcernRow & { close_reason?: string }> = [];
	let seq = 0;
	let spent = 0;
	const report: Record<string, unknown>[] = [];
	let last: {
		context: Awaited<ReturnType<typeof buildFreshnessScanContext>>;
		port: ReplayPort;
		at: string;
	} | null = null;

	for (const scan of scans) {
		const entry: Record<string, unknown> = {
			scan: scan.id,
			at: scan.created_at,
			mode: scan.mode
		};
		report.push(entry);
		if (spent >= maxUsd) {
			entry.skipped = `budget ($${spent.toFixed(5)} of $${maxUsd})`;
			continue;
		}
		const at = new Date(Date.parse(scan.created_at) + 1_000).toISOString();
		const port = new ReplayPort(dataset, at, state, at.slice(0, 10), startHereIds);
		const forcedKeys = new Set(open.map((row) => entityKey(row.subject_kind, row.subject_id)));
		const context = await buildFreshnessScanContext({
			port,
			projectId,
			userId,
			extraSessionIds: scan.trigger_session_id ? [scan.trigger_session_id] : [],
			forcedKeys,
			now: new Date(at),
			policy: POLICY
		});
		last = { context, port, at };
		entry.windowChars = context.window.chars;
		entry.decisions = context.decisions.map(
			(decision) => `${decision.recorded ?? 'unstamped'} ${decision.text.slice(0, 90)}`
		);
		if (context.skipReason) {
			entry.skipped = context.skipReason;
			continue;
		}

		const targetingPlan = planTargeting(context, model, POLICY);
		let targetingAnswers: AnswerMap | null = null;
		if (targetingPlan.request) {
			const fetched = await jev.ask(targetingPlan.request);
			if (fetched.source === 'live') spent += fetched.receipt?.costUsd ?? 0;
			if (fetched.answers) targetingAnswers = fetched.answers as AnswerMap;
		}
		const targeting = applyTargeting({
			context,
			plan: targetingPlan,
			answers: targetingAnswers,
			forcedKeys,
			policy: POLICY
		});
		entry.targeting = {
			source: targeting.source,
			pool: targetingPlan.records.length,
			top: [...targeting.scores.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 12)
				.map(
					([key, p]) =>
						`${p.toFixed(2)} ${key.split(':')[0]} ${context.entitiesByKey.get(key)?.title ?? key}`
				),
			selected: [...targeting.entities, ...targeting.documents].map(
				(item) => `${item.candidate.kind} ${item.candidate.title}`
			)
		};

		const plan = planScanRequests(context, targeting, model, POLICY);
		const answers: Record<string, unknown> = {};
		let failure: string | null = null;
		for (const { name, request } of plan.requests) {
			const fetched = await jev.ask(request);
			if (fetched.source === 'live') spent += fetched.receipt?.costUsd ?? 0;
			if (!fetched.answers) failure = failure ?? `${name}:${fetched.source}`;
			else Object.assign(answers, namespaceAnswers(name, fetched.answers));
		}
		entry.costSoFar = Number(spent.toFixed(6));
		if (failure) {
			entry.failed = failure; // all-or-nothing, like live: nothing merged, cursor stays
			continue;
		}
		const decided = decideScan({
			context,
			plan,
			projectId,
			answers: answers as AnswerMap,
			gateEnabled: false,
			policy: POLICY
		});
		entry.judged = decided.entityDecisions
			.map((decision) => ({
				subject: `${decision.candidate.kind} ${decision.candidate.title}`,
				p: Number(decision.probability.toFixed(3)),
				change: decision.changeKind,
				disposition: decision.disposition,
				sections: decision.sections.map(
					(section) => `${section.probability.toFixed(2)} ${section.heading}`
				)
			}))
			.sort((a, b) => b.p - a.p);

		const observations = buildConcernObservations({
			context,
			plan,
			answers: answers as AnswerMap,
			decisions: decided.entityDecisions,
			flagIdByKey: new Map()
		});
		const sectionHashes = await concernSectionHashes({ open, context, port, policy: POLICY });
		const merge = mergeConcerns({
			open,
			observations,
			current: context.entitiesByKey,
			isClosed: isClosedCandidate,
			sectionHashes,
			scanId: scan.id,
			now: new Date(at),
			policy: POLICY
		});
		open = open.map((row) => {
			const update = merge.updates.find((candidate) => candidate.id === row.id);
			return update ? ({ ...row, ...update.patch } as ConcernRow) : row;
		});
		const closedNow = open.filter((row) =>
			merge.updates.some((update) => update.id === row.id && update.patch.closed_at)
		);
		closedRows.push(...closedNow);
		entry.closed = closedNow.map(
			(row) =>
				`${row.subject_kind} ${row.subject_title}: ${(row as { close_reason?: string }).close_reason}`
		);
		open = open.filter((row) => !closedNow.includes(row));
		for (const insert of merge.inserts) {
			const { key: _key, ...row } = insert;
			open.push({ ...row, id: `concern-${++seq}` });
		}
		entry.newlySurfaced = merge.newlySurfaced.map((key) => {
			const concern = open.find((row) => entityKey(row.subject_kind, row.subject_id) === key);
			return {
				subject: `${key.split(':')[0]} ${context.entitiesByKey.get(key)?.title ?? key}`,
				reason: concern ? concernReason(concern) : null,
				fixInChat: concern?.detail.fixInChatPrompt ?? null
			};
		});
		entry.rollup = open.map((row) => ({
			subject: `${row.subject_kind} ${row.subject_title}`,
			score: row.score,
			evidence: row.evidence_count,
			seen: row.seen_count,
			surfaced: Boolean(row.surfaced_at)
		}));
		// What the live scan would persist, so the next window starts where this one ended.
		if (context.window.cursorAt) state.cursors.set(projectId, context.window.cursorAt);
	}

	// The user fixes every surfaced subject: flagged doc sections get edited, other
	// subjects get their details edited. The next scan's merge must close them.
	const fix: Record<string, unknown> = {};
	if (last) {
		const surfaced = open.filter((row) => row.surfaced_at);
		const overrides = new Map<string, string>();
		const current = new Map<string, FreshnessCandidate>(last.context.entitiesByKey);
		for (const row of surfaced) {
			const key = entityKey(row.subject_kind, row.subject_id);
			if (row.subject_kind === 'document') {
				const body = (
					await last.port.loadDocumentBodies([row.subject_id], POLICY.dig.bodyChars)
				).get(row.subject_id);
				if (body) {
					const headings = row.detail.sections
						.filter((section) => section.anchor)
						.map((section) => section.heading);
					overrides.set(row.subject_id, editSections(body, headings));
				}
			} else {
				const candidate = current.get(key);
				if (candidate) {
					current.set(key, {
						...candidate,
						description: `${candidate.description ?? ''}\n\nUpdated to match the recorded decisions.`
					});
				}
			}
		}
		const hashes = new Map<string, Map<string, string>>();
		for (const [id, body] of overrides) hashes.set(id, segmentHashes(body));
		const merge = mergeConcerns({
			open,
			observations: [],
			current,
			isClosed: isClosedCandidate,
			sectionHashes: hashes,
			scanId: 'simulated-fix',
			now: new Date(Date.parse(last.at) + 60_000),
			policy: POLICY
		});
		const closedIds = new Set(
			merge.updates.filter((update) => update.patch.closed_at).map((update) => update.id)
		);
		fix.edited = surfaced.map((row) => `${row.subject_kind} ${row.subject_title}`);
		fix.closed = merge.updates
			.filter((update) => update.patch.closed_at)
			.map((update) => {
				const row = open.find((candidate) => candidate.id === update.id)!;
				return `${row.subject_kind} ${row.subject_title}: ${update.patch.close_reason}`;
			});
		fix.stillOpen = open
			.filter((row) => !closedIds.has(row.id))
			.map(
				(row) =>
					`${row.subject_kind} ${row.subject_title} (surfaced ${Boolean(row.surfaced_at)})`
			);
	}

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(
		outFile,
		`${JSON.stringify(
			{
				model,
				spentUsd: Number(spent.toFixed(6)),
				jev: { live: jev.liveCalls, cacheHits: jev.hits },
				scans: report,
				finalOpen: open.map((row) => ({
					subject: `${row.subject_kind} ${row.subject_title}`,
					score: row.score,
					evidence: row.evidence_count,
					seen: row.seen_count,
					surfaced: Boolean(row.surfaced_at),
					reason: concernReason(row),
					fixInChat: row.detail.fixInChatPrompt
				})),
				closedDuringReplay: closedRows.map(
					(row) => `${row.subject_kind} ${row.subject_title}: ${row.close_reason}`
				),
				fix
			},
			null,
			2
		)}\n`
	);
	console.log(
		`replayed ${report.length} scans; live Jev calls ${jev.liveCalls}, cache hits ${jev.hits}; spent $${spent.toFixed(5)}; wrote ${outFile}`
	);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.stack : error);
		process.exitCode = 1;
	});
}
