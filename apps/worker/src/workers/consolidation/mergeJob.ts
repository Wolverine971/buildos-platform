// apps/worker/src/workers/consolidation/mergeJob.ts
//
// Merging one group of documents into one, as part of a consolidation run
// (docs/research/doc-task-consolidation-2026-10-03, slice 2).
// - merge: read every source into facts, give each fact one fate, post the
//   questions only the owner can settle, and write the draft right away with
//   safe defaults ("keep working on everything it doesn't touch").
// - merge_write: the owner answered one of those questions; rewrite the draft.
// Nothing here touches a document. Apply (web, on the owner's click) creates
// the merged doc from `markdown` and archives the sources.
//
// The merge row's `updated_at` is its version. The web bumps it (status
// `pending`) whenever the owner answers one of its cards, and every write here
// is conditional on the version this job last saw, so a draft written before
// an answer landed is never stored as `ready`.
import type { ConsolidationRunJobMetadata, Json } from '@buildos/shared-types';
import {
	type ConsolidationPlan,
	type ConsolidationQuestion,
	type MergeCoverage,
	type MergeLedger,
	applyEdits,
	checkLedger,
	parseConsolidationQuestion,
	questionEdits,
	repairLedger
} from '@buildos/shared-agent-ops/consolidation';
import { supabase } from '../../lib/supabase';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { PermanentQueueError } from '../../lib/queueErrors';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	CHECK_SYSTEM_PROMPT,
	EXTRACT_SYSTEM_PROMPT,
	type Extraction,
	type MergeQuestionDraft,
	type MergeQuestionRow,
	type MergeSource,
	RECONCILE_SYSTEM_PROMPT,
	WRITE_SYSTEM_PROMPT,
	addOwnerFacts,
	answersFingerprint,
	assembleDocument,
	checkUserPrompt,
	chunkSource,
	extractUserPrompt,
	mergeQuestionRows,
	mergeStart,
	numberFacts,
	ownerAnswers,
	parseExtraction,
	parseNotStated,
	parseReconcile,
	parseWrite,
	placedCount,
	reconcileUserPrompt,
	requiredQuestions,
	staleSources,
	stripMarkers,
	uncitedFacts,
	writeUserPrompt
} from './merge';
import {
	DECIDING,
	type RunRow,
	loadRun,
	loggedSpend,
	mapLimit,
	updateRun,
	usageTracker
} from './runtime';

/** A merge of a dozen docs costs well under a cent on the balanced profile; this stops a runaway. */
const MERGE_COST_CAP_USD = 0.15;
const EXTRACT_CONCURRENCY = 4;
/** Answers that land while a draft is being written trigger another pass, up to this many. */
const MAX_WRITE_PASSES = 4;

type MergeRow = {
	id: string;
	run_id: string;
	cluster_key: string;
	status: string;
	title: string;
	target_project_id: string;
	source_ids: string[];
	ledger: MergeLedger | null;
	cost_usd: number | string;
	updated_at: string;
};

type Usage = ReturnType<typeof usageTracker>;

async function loadMerge(runId: string, key: string): Promise<MergeRow | null> {
	const { data, error } = await supabase
		.from('consolidation_merges')
		.select(
			'id, run_id, cluster_key, status, title, target_project_id, source_ids, ledger, cost_usd, updated_at'
		)
		.eq('run_id', runId)
		.eq('cluster_key', key)
		.maybeSingle();
	if (error) throw new Error(`Load merge: ${error.message}`);
	return (data as unknown as MergeRow | null) ?? null;
}

/**
 * Writes the merge only if nothing changed it since `version` (an answer, a
 * Try again, another job). Returns the new version, or null when it changed.
 */
async function saveMerge(
	id: string,
	version: string,
	patch: Record<string, unknown>
): Promise<string | null> {
	const { data, error } = await supabase
		.from('consolidation_merges')
		.update({ ...patch, updated_at: new Date().toISOString() } as never)
		.eq('id', id)
		.eq('updated_at', version)
		.select('updated_at');
	if (error) throw new Error(`Update merge: ${error.message}`);
	return (data as Array<{ updated_at: string }> | null)?.[0]?.updated_at ?? null;
}

/** A draft that is `ready` already has every answer (an answer sets `pending`), so it stays. */
export async function markMergeFailed(runId: string, clusterKey: string, message: string) {
	await supabase
		.from('consolidation_merges')
		.update({
			status: 'failed',
			error: message.slice(0, 500),
			updated_at: new Date().toISOString()
		})
		.eq('run_id', runId)
		.eq('cluster_key', clusterKey)
		.neq('status', 'ready');
}

/**
 * Every source, in the order the group listed them (so fact numbers read in
 * source order), plus the ids that are gone: moved out of the family,
 * archived or deleted.
 */
async function loadSources(
	run: RunRow,
	ids: string[]
): Promise<{ sources: MergeSource[]; missing: string[] }> {
	const { data, error } = await supabase
		.from('onto_documents')
		.select('id, project_id, title, description, content, created_at, updated_at')
		.in('id', ids)
		.in('project_id', run.project_ids)
		.is('deleted_at', null)
		.is('archived_at', null);
	if (error) throw new Error(`Load sources: ${error.message}`);
	const projects = (run.plan as ConsolidationPlan | null)?.projects ?? {};
	const rows = new Map((data ?? []).map((row) => [row.id, row]));
	return {
		sources: ids.flatMap((id) => {
			const row = rows.get(id);
			return row
				? [
						{
							id: row.id,
							title: row.title ?? 'Untitled',
							project: projects[row.project_id]?.name ?? 'this project',
							created_at: row.created_at,
							updated_at: row.updated_at,
							description: row.description,
							content: row.content ?? ''
						}
					]
				: [];
		}),
		missing: ids.filter((id) => !rows.has(id))
	};
}

/**
 * This merge's live question cards (piece `merge:<key>:<n>`), oldest first.
 * Withdrawn cards belong to a draft that was left alone or started over; their
 * fact ids point at an older ledger, so they never count.
 */
async function mergeQuestions(runId: string, key: string): Promise<ConsolidationQuestion[]> {
	const { data, error } = await supabase
		.from('consolidation_questions')
		.select('*')
		.eq('run_id', runId)
		.like('piece', `merge:${key}:%`)
		.neq('status', 'withdrawn')
		.order('created_at', { ascending: true })
		.order('id', { ascending: true });
	if (error) throw new Error(`Load merge questions: ${error.message}`);
	return (data ?? [])
		.map((row) => parseConsolidationQuestion(row))
		.filter((question): question is ConsolidationQuestion => question !== null);
}

/** Cards from an earlier reading point at fact ids about to be renumbered: withdraw them (never delete). */
async function withdrawQuestions(runId: string, key: string) {
	const { error } = await supabase
		.from('consolidation_questions')
		.update({ status: 'withdrawn', updated_at: new Date().toISOString() })
		.eq('run_id', runId)
		.like('piece', `merge:${key}:%`)
		.neq('status', 'withdrawn');
	if (error) throw new Error(`Withdraw merge questions: ${error.message}`);
}

/** Posts the cards in one insert; a card already posted (same piece) is not posted twice. */
async function postQuestions(run: RunRow, key: string, rows: MergeQuestionRow[]) {
	const posted = new Set((await mergeQuestions(run.id, key)).map((question) => question.piece));
	const inserts = rows
		.filter((row) => !posted.has(row.piece))
		.map((row) => ({
			run_id: run.id,
			...row,
			evidence: row.evidence as unknown as Json,
			options: row.options as unknown as Json
		}))
		// A card the web could not read would hold nothing up, but it would show nothing either.
		.filter((insert) => parseConsolidationQuestion({ ...insert, id: run.id, status: 'open' }));
	if (inserts.length) {
		const { error } = await supabase.from('consolidation_questions').insert(inserts);
		if (error) throw new Error(`Insert merge questions: ${error.message}`);
	}
	if (rows.length) await updateRun(run.id, { status: 'waiting' }, DECIDING);
}

/** The run still takes answers and the owner hasn't left this group alone. */
async function stillWanted(runId: string, key: string): Promise<boolean> {
	const run = await loadRun(runId);
	if (!run || !DECIDING.includes(run.status)) return false;
	const cluster = (run.plan as ConsolidationPlan | null)?.clusters.find(
		(item) => item.key === key
	);
	return Boolean(cluster && !cluster.vetoed);
}

type CallContext = {
	llm: SmartLLMService;
	run: RunRow;
	key: string;
	usage: Usage;
	signal: AbortSignal;
};

function call(
	ctx: CallContext,
	operationType: string,
	systemPrompt: string,
	userPrompt: string,
	signal = ctx.signal
) {
	ctx.usage.check();
	return ctx.llm.getJSONResponse<Record<string, unknown>>({
		systemPrompt,
		userPrompt,
		userId: ctx.run.user_id,
		profile: 'balanced',
		signal,
		validation: { retryOnParseError: true, maxRetries: 1 },
		operationType,
		// Reconcile and write see every fact at once; the 120 s default is too tight for a big group.
		// Reconcile (reasoning on) took 234 s for 69 facts on 10-04.
		timeoutMs:
			operationType === 'consolidation_merge_reconcile'
				? 360_000
				: operationType === 'consolidation_merge_extract'
					? 120_000
					: 240_000,
		// Reading facts out, writing them up and checking them are mechanical: hidden
		// reasoning only slows them (an extract ran past 120 s on 10-04). Deciding fates
		// is judgment and keeps it. DeepSeek V4 Flash honors `enabled: false`.
		...(operationType === 'consolidation_merge_reconcile'
			? {}
			: { reasoning: { enabled: false } }),
		projectId: ctx.run.root_project_id,
		metadata: { consolidation_run_id: ctx.run.id, consolidation_cluster: ctx.key },
		onUsage: ctx.usage.onUsage
	});
}

async function extractAll(ctx: CallContext, sources: MergeSource[]): Promise<MergeLedger> {
	const pieces = sources.flatMap((source) => {
		// Smaller pieces: each reader returns faster and misses less.
		const chunks = chunkSource(source.content, 6_000);
		return chunks.map((chunk, part) => ({ source, chunk, part, parts: chunks.length }));
	});
	// One failed piece fails the job; the pieces still running are cancelled, not paid for.
	const results = await mapLimit(
		pieces,
		EXTRACT_CONCURRENCY,
		async (piece, _index, signal) =>
			parseExtraction(
				await call(
					ctx,
					'consolidation_merge_extract',
					EXTRACT_SYSTEM_PROMPT,
					extractUserPrompt(
						piece.source,
						piece.chunk,
						piece.part,
						piece.parts,
						sources
							.filter((other) => other.id !== piece.source.id)
							.map((other) => other.title)
					),
					signal
				),
				piece.source
			),
		ctx.signal
	);
	// One extraction per source, in source order; chunk results join their source.
	const bySource = new Map<string, Extraction>();
	results.forEach((result, index) => {
		const id = pieces[index]!.source.id;
		const seen = bySource.get(id);
		bySource.set(
			id,
			seen
				? {
						facts: [...seen.facts, ...result.facts],
						unverified: [...seen.unverified, ...result.unverified],
						flags: [...seen.flags, ...result.flags]
					}
				: result
		);
	});
	return numberFacts(sources.map((source) => bySource.get(source.id)!).filter(Boolean));
}

/** One editor pass; a ledger with gaps gets one retry naming them, then code repairs the rest. */
async function reconcile(
	ctx: CallContext,
	ledger: MergeLedger,
	sources: MergeSource[],
	title: string
) {
	const ask = async (problems?: string[]) =>
		parseReconcile(
			await call(
				ctx,
				'consolidation_merge_reconcile',
				RECONCILE_SYSTEM_PROMPT,
				reconcileUserPrompt({ ledger, sources, title, problems })
			),
			ledger
		);
	let result = await ask();
	const problems = checkLedger(result.ledger);
	if (problems.length) {
		const retry = await ask(
			problems.slice(0, 40).map((item) => `${item.fact_id ?? 'ledger'}: ${item.problem}`)
		);
		if (checkLedger(retry.ledger).length < problems.length) result = retry;
	}
	return { ledger: repairLedger(result.ledger), questions: result.questions };
}

async function writeDraft(
	ctx: CallContext,
	title: string,
	ledger: MergeLedger,
	sources: MergeSource[]
): Promise<{ markdown: string; coverage: MergeCoverage }> {
	const titleOf = (id: string) => sources.find((source) => source.id === id)?.title ?? 'a source';
	const write = async (missed?: string[]) =>
		parseWrite(
			await call(
				ctx,
				'consolidation_merge_write',
				WRITE_SYSTEM_PROMPT,
				writeUserPrompt({ title, ledger, titleOf, missed })
			)
		);
	let body = await write();
	let uncited = uncitedFacts(body, ledger);
	if (body && uncited.length) {
		const second = await write(uncited);
		const secondUncited = uncitedFacts(second, ledger);
		if (second && secondUncited.length < uncited.length) {
			body = second;
			uncited = secondUncited;
		}
	}
	if (!body) throw new Error('The writer returned an empty draft.');
	const prose = stripMarkers(body);
	const notStated = parseNotStated(
		await call(
			ctx,
			'consolidation_merge_check',
			CHECK_SYSTEM_PROMPT,
			checkUserPrompt(prose, ledger)
		),
		ledger
	);
	// Anything the prose did not state goes in word for word: nothing is lost.
	const appended = [...new Set([...uncited, ...notStated])];
	const placed = placedCount(ledger);
	return {
		markdown: assembleDocument({
			body: prose,
			ledger,
			sources,
			appended,
			mergedOn: new Date().toISOString().slice(0, 10)
		}),
		coverage: { placed, stated: placed - appended.length, appended_fact_ids: appended }
	};
}

export async function processMerge(
	job: ProcessingJob<ConsolidationRunJobMetadata>,
	run: RunRow,
	mode: 'merge' | 'merge_write'
) {
	const key = job.data.clusterKey!;
	const merge = await loadMerge(run.id, key);
	if (!merge) return { skipped: 'no merge for this group' };
	const start = mergeStart(mode, merge);
	if (start.do === 'skip') return { skipped: start.reason };
	const moved = { skipped: 'the run or this merge changed meanwhile' };
	if (!(await stillWanted(run.id, key))) return moved;

	// The cap counts every attempt at this merge, including other jobs running now.
	const ctx: CallContext = {
		llm: new SmartLLMService({ supabase, appName: 'BuildOS Consolidation Worker' }),
		run,
		key,
		usage: usageTracker(await loggedSpend(run, { cluster: key }), MERGE_COST_CAP_USD, 'merge'),
		signal: job.signal
	};
	/** Before each paid step: still wanted, still under the cap, not cancelled. */
	const proceed = async () => {
		job.signal.throwIfAborted();
		if (!(await stillWanted(run.id, key))) return false;
		ctx.usage.sync(await loggedSpend(run, { cluster: key }));
		ctx.usage.check();
		return true;
	};

	const { sources, missing } = await loadSources(run, merge.source_ids);
	// Never draft from the docs that are left: the doc would say nothing of the rest.
	if (missing.length)
		throw new PermanentQueueError(
			'consolidation_merge_sources',
			`${missing.length === 1 ? 'One of these docs was' : `${missing.length} of these docs were`} moved out of this project, archived or deleted since the survey, so a merge would lose ${missing.length === 1 ? 'it' : 'them'}. Leave this group alone, or start a new consolidation.`
		);
	if (merge.ledger) {
		const stale = staleSources(merge.ledger, sources);
		if (stale.length)
			throw new PermanentQueueError(
				'consolidation_merge_stale',
				`“${stale[0]}”${stale.length > 1 ? ` and ${stale.length - 1} more` : ''} changed after this draft read ${stale.length > 1 ? 'them' : 'it'}. Try again to read the docs as they are now.`
			);
	}
	const titleOf = (id: string) => sources.find((source) => source.id === id)?.title ?? 'a source';
	const cardRows = (ledger: MergeLedger, drafted: MergeQuestionDraft[]) =>
		mergeQuestionRows({
			clusterKey: key,
			drafts: [...drafted, ...requiredQuestions(ledger, drafted, titleOf)],
			ledger,
			sourceIds: sources.map((source) => source.id),
			titleOf
		});

	let version: string | null = merge.updated_at;
	if (start.do === 'extract') {
		if (!(await proceed())) return moved;
		version = await saveMerge(merge.id, version, { status: 'extracting', error: null });
		if (!version) return moved;
		await withdrawQuestions(run.id, key);
		const extracted = await extractAll(ctx, sources);
		if (extracted.facts.length === 0)
			throw new PermanentQueueError(
				'consolidation_merge_empty',
				'Found nothing to keep in these docs.'
			);
		await job.updateProgress({ current: 2, total: 3, message: 'Sorting facts' });
		if (!(await proceed())) return moved;
		version = await saveMerge(merge.id, version, { status: 'reconciling' });
		if (!version) return moved;
		const reconciled = await reconcile(ctx, extracted, sources, merge.title);
		if (!(await proceed())) return moved;
		// Saved before the cards go up: a crash between the two resumes from here.
		const ledger: MergeLedger = {
			...reconciled.ledger,
			source_versions: Object.fromEntries(
				sources.map((source) => [source.id, source.updated_at])
			),
			questions_posted: false
		};
		version = await saveMerge(merge.id, version, { ledger: ledger as unknown as Json });
		if (!version) return moved;
		await postQuestions(run, key, cardRows(ledger, reconciled.questions));
		version = await saveMerge(merge.id, version, {
			ledger: { ...ledger, questions_posted: true } as unknown as Json
		});
		if (!version) return moved;
	} else if (start.do === 'post_questions') {
		// Resumed after a crash between saving the ledger and posting its cards. The
		// editor's own questions are gone; the ones the rules require are rebuilt.
		if (!(await proceed())) return moved;
		const ledger = merge.ledger!;
		await postQuestions(run, key, cardRows(ledger, []));
		version = await saveMerge(merge.id, version, {
			ledger: { ...ledger, questions_posted: true } as unknown as Json
		});
		if (!version) return moved;
	}

	// Write with what the owner has said so far. Each pass starts from the row as
	// stored and saves only if no answer landed meanwhile; otherwise it goes again.
	for (let pass = 0; pass < MAX_WRITE_PASSES; pass++) {
		if (!(await proceed())) return moved;
		const current = await loadMerge(run.id, key);
		if (!current?.ledger) return { skipped: 'the merge is reading its sources again' };
		const questions = await mergeQuestions(run.id, key);
		const answered = answersFingerprint(questions);
		if (current.status === 'ready' && current.ledger.written_for === answered)
			return { skipped: 'the draft already has every answer' };
		const writing = await saveMerge(current.id, current.updated_at, {
			status: 'writing',
			error: null
		});
		if (!writing) continue;
		let ledger = current.ledger;
		const typed = ownerAnswers(questions).filter(
			(answer) => !(ledger.owner_question_ids ?? []).includes(answer.question_id)
		);
		if (typed.length) {
			// Typed answers become the owner's own facts; the editor places them.
			const withOwner = addOwnerFacts(ledger, typed, new Date().toISOString().slice(0, 10));
			ledger = (await reconcile(ctx, withOwner, sources, merge.title)).ledger;
			if (!(await proceed())) return moved;
		}
		const effective = applyEdits(ledger, questions.flatMap(questionEdits));
		const draft = await writeDraft(ctx, merge.title, effective, sources);
		if (!(await proceed())) return moved;
		const mergeSpent = await loggedSpend(run, { cluster: key }).catch(() => ctx.usage.total);
		const saved = await saveMerge(current.id, writing, {
			status: 'ready',
			error: null,
			ledger: { ...ledger, written_for: answered } as unknown as Json,
			markdown: draft.markdown,
			coverage: draft.coverage as unknown as Json,
			cost_usd: mergeSpent
		});
		if (!saved) continue;
		const runSpent = await loggedSpend(run).catch(() => null);
		if (runSpent !== null)
			await updateRun(run.id, { cost_usd: runSpent }, DECIDING).catch(() => false);
		return {
			facts: ledger.facts.length,
			placed: draft.coverage.placed,
			appended: draft.coverage.appended_fact_ids.length,
			cost_usd: mergeSpent
		};
	}
	throw new Error('Answers kept arriving while the draft was written; will retry.');
}
