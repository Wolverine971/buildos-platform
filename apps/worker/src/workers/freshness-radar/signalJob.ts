// apps/worker/src/workers/freshness-radar/signalJob.ts
//
// Queue job 'freshness_radar_scan' (plan section 1). A per-session debounced
// signal becomes up to three per-project scans:
//   [1] context -> [2] Jev R1/R2/R3 in parallel -> [3] code combine ->
//   [4] ledger -> [5] live only: auto-apply -> inbox cleanup -> bundle ->
//   attention budget -> chat card.
// Fail closed and silent: any Jev or network failure ends the scan as failed
// with no flags, no card and no entity writes. FRESHNESS_RADAR_MODE=off is the
// kill switch; shadow writes the ledger only.

import {
	type FreshnessScanJobMetadata,
	type Json,
	type LoopOperation
} from '@buildos/shared-types';
import {
	JevClient,
	type JevDecider,
	type JevDecisionResult,
	type JevQuestionSet,
	LLMUsageLogger
} from '@buildos/smart-llm';
import { computeProjectSuggestionFreshnessFingerprint } from '@buildos/shared-agent-ops';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	applyProjectAttentionBudget,
	markInboxItemFreshness,
	retireInboxSourceForFreshness,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops/inbox-index';
import { verifyProjectSuggestionIntegrity } from '@buildos/shared-agent-ops/proposal-context';
import { supabase } from '../../lib/supabase';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import {
	AUTO_APPLY_READY_REASON,
	type AutoApplyCandidate,
	type GatewayRunner,
	reconcileClaimedAutoApplies,
	runAutoApply,
	sessionHasActiveTurn
} from './autoApply';
import { buildFreshnessCard, deliverFreshnessCard } from './card';
import {
	type AnswerMap,
	type EntityDecision,
	type InboxDecision,
	combineEntityDecisions,
	decideInboxCleanup,
	rankCardDecisions
} from './combine';
import {
	type FreshnessScanContext,
	buildFreshnessScanContext,
	candidateSnapshot,
	entityKey,
	snapshotsMatch,
	trackSubjectView
} from './context';
import { type FreshnessDataPort, type FreshnessDb, SupabaseFreshnessDataPort } from './dataPort';
import {
	type CarriedFlagRow,
	type DraftBundleDeps,
	type DraftItem,
	buildDraftBundle
} from './drafts';
import {
	FRESHNESS_POLICY_V1,
	type FreshnessPolicyV1,
	type FreshnessRadarMode,
	type FreshnessRadarUserFlags,
	effectiveScanMode,
	readFreshnessRadarJevModel,
	readFreshnessRadarMode
} from './freshnessPolicy';
import { type InboxCleanupOps, runInboxCleanup } from './inboxCleanup';
import {
	type FlagInsert,
	type ScanJevStats,
	type ScanMode,
	type ScanRow,
	type ScanTrigger,
	beginScan,
	finishScan,
	insertFlags,
	insertTrackScores,
	updateFlag
} from './ledger';
import { labelImplicitOutcomes } from './outcomes';
import {
	type FreshnessJevRequest,
	type R1Subject,
	buildR1Request,
	buildR2Request,
	buildR3Request
} from './questions';
import { gaugeChanges, scoreTrackSubjects, trackScoreRows } from './trackScores';

export const FRESHNESS_RADAR_JOB_TYPE = 'freshness_radar_scan' as const;
export const FRESHNESS_JEV_OPERATION_TYPE = 'freshness_radar_decisions';

const RESCHEDULE_BUSY_MS = 60_000;
const SIGNAL_PROJECT_LOOKBACK_MS = 5 * 60_000;

export type FreshnessRadarDeps = {
	db: FreshnessDb;
	port: FreshnessDataPort;
	/** null when no OpenRouter key is configured: every scan fails closed. */
	jev: JevDecider | null;
	mode: FreshnessRadarMode;
	model: string;
	policy: FreshnessPolicyV1;
	now: () => Date;
	runGateway: GatewayRunner;
	draftDeps: DraftBundleDeps;
	inboxOps: InboxCleanupOps;
};

type SignalRow = {
	id: string;
	session_id: string;
	user_id: string;
	status: string;
	project_id_hints: string[] | null;
	first_turn_at: string;
	last_turn_at: string;
	due_at: string;
	queue_job_id: string | null;
};

export type FreshnessScanJobResult = {
	success: boolean;
	skipped?: string;
	rescheduled?: boolean;
	scans?: Array<{ projectId: string; scanId: string | null; status: string; reason?: string }>;
};

type Log = (message: string) => Promise<void> | void;

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------

async function loadSignal(db: FreshnessDb, signalId: string): Promise<SignalRow | null> {
	const result = await db
		.from('freshness_radar_signals')
		.select(
			'id, session_id, user_id, status, project_id_hints, first_turn_at, last_turn_at, due_at, queue_job_id'
		)
		.eq('id', signalId)
		.maybeSingle();
	if (result.error) throw new Error(`freshness signal read failed: ${result.error.message}`);
	return (result.data ?? null) as SignalRow | null;
}

function minuteKey(iso: string): string {
	return iso.slice(0, 16);
}

export function freshnessRetryDedupKey(signalId: string, dueAt: string): string {
	return `freshness-radar:${signalId}:retry:${minuteKey(dueAt)}`;
}

async function rescheduleSignal(db: FreshnessDb, signal: SignalRow, dueAt: string): Promise<void> {
	const result = await db.rpc('add_queue_job', {
		p_user_id: signal.user_id,
		p_job_type: FRESHNESS_RADAR_JOB_TYPE,
		p_metadata: {
			signalId: signal.id,
			sessionId: signal.session_id,
			userId: signal.user_id
		} as unknown as Json,
		p_priority: 9,
		p_scheduled_for: dueAt,
		p_dedup_key: freshnessRetryDedupKey(signal.id, dueAt)
	});
	if (result?.error)
		throw new Error(`freshness signal reschedule failed: ${result.error.message}`);
}

async function loadUserFlags(
	db: FreshnessDb,
	userId: string
): Promise<{ cohort: boolean; flags: FreshnessRadarUserFlags }> {
	const result = await db
		.from('feature_flags')
		.select('feature_name, enabled')
		.eq('user_id', userId)
		.in('feature_name', [
			'freshness_radar',
			'freshness_radar.surfaces',
			'freshness_radar.auto_apply',
			'freshness_radar.inbox_cleanup'
		]);
	const enabled = new Set(
		((result.error ? [] : result.data) ?? [])
			.filter((row: { enabled: boolean }) => row.enabled === true)
			.map((row: { feature_name: string }) => row.feature_name)
	);
	return {
		cohort: enabled.has('freshness_radar'),
		flags: {
			surfaces: enabled.has('freshness_radar.surfaces'),
			autoApply: enabled.has('freshness_radar.auto_apply'),
			inboxCleanup: enabled.has('freshness_radar.inbox_cleanup')
		}
	};
}

/** turn.project_id hints first, then projects the session wrote to (cap 3). */
async function projectsForSignal(
	db: FreshnessDb,
	signal: SignalRow,
	cap: number
): Promise<string[]> {
	const since = new Date(
		Date.parse(signal.first_turn_at) - SIGNAL_PROJECT_LOOKBACK_MS
	).toISOString();
	const result = await db
		.from('onto_project_logs')
		.select('project_id, created_at')
		.eq('chat_session_id', signal.session_id)
		.gte('created_at', since)
		.order('created_at', { ascending: false })
		.limit(200);
	if (result.error)
		throw new Error(`freshness signal project read failed: ${result.error.message}`);
	const counts = new Map<string, number>();
	for (const row of (result.data ?? []) as Array<{ project_id: string }>) {
		counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
	}
	const written = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([projectId]) => projectId);
	return [...new Set([...(signal.project_id_hints ?? []), ...written])].slice(0, cap);
}

async function finishSignal(
	db: FreshnessDb,
	signalId: string,
	status: 'completed' | 'failed',
	now: Date,
	errorMessage: string | null
) {
	await db
		.from('freshness_radar_signals')
		.update({
			status,
			finished_at: now.toISOString(),
			error_message: errorMessage ? errorMessage.slice(0, 500) : null
		})
		.eq('id', signalId)
		.eq('status', 'processing');
}

export async function processFreshnessRadarScanJob(
	job: ProcessingJob<FreshnessScanJobMetadata>,
	deps: FreshnessRadarDeps = createDefaultFreshnessRadarDeps()
): Promise<FreshnessScanJobResult> {
	const log: Log = (message) => job.log(message);
	const { db } = deps;
	const signalId = job.data?.signalId;
	if (!signalId) return { success: true, skipped: 'missing_signal_id' };

	const signal = await loadSignal(db, signalId);
	if (!signal) return { success: true, skipped: 'signal_not_found' };
	const jobKey = job.queueRowId ?? job.id;

	if (deps.mode === 'off') {
		if (signal.status === 'pending') {
			await db
				.from('freshness_radar_signals')
				.update({
					status: 'completed',
					finished_at: deps.now().toISOString(),
					error_message: 'radar_mode_off'
				})
				.eq('id', signal.id)
				.eq('status', 'pending');
		}
		await log('Freshness radar is off (FRESHNESS_RADAR_MODE); signal closed without scanning.');
		return { success: true, skipped: 'mode_off' };
	}

	let resuming = false;
	if (signal.status === 'processing' && signal.queue_job_id === jobKey) {
		resuming = true; // a queue retry of the job that claimed it
	} else if (signal.status !== 'pending') {
		return { success: true, skipped: `signal_${signal.status}` };
	}

	const now = deps.now();
	if (!resuming) {
		const dueMs = Date.parse(signal.due_at);
		if (Number.isFinite(dueMs) && dueMs > now.getTime() + 1_000) {
			await rescheduleSignal(db, signal, signal.due_at);
			await log(
				`Freshness signal ${signal.id} is not due until ${signal.due_at}; rescheduled.`
			);
			return { success: true, rescheduled: true };
		}
		if (await sessionHasActiveTurn(db, signal.session_id)) {
			const next = new Date(now.getTime() + RESCHEDULE_BUSY_MS).toISOString();
			await rescheduleSignal(db, signal, next);
			await log(
				`Freshness signal ${signal.id}: a turn is still running; rescheduled to ${next}.`
			);
			return { success: true, rescheduled: true };
		}
		const claimed = await db
			.from('freshness_radar_signals')
			.update({ status: 'processing', started_at: now.toISOString(), queue_job_id: jobKey })
			.eq('id', signal.id)
			.eq('status', 'pending')
			.lte('due_at', now.toISOString())
			.select('id');
		if (claimed.error)
			throw new Error(`freshness signal claim failed: ${claimed.error.message}`);
		if (!(claimed.data ?? []).length) {
			await log(`Freshness signal ${signal.id} was already claimed or deferred; skipping.`);
			return { success: true, skipped: 'not_claimed' };
		}
	}

	const { cohort, flags } = await loadUserFlags(db, signal.user_id);
	if (!cohort) {
		await finishSignal(db, signal.id, 'completed', deps.now(), 'cohort_flag_off');
		return { success: true, skipped: 'cohort_flag_off' };
	}
	const mode = effectiveScanMode(deps.mode, flags);
	if (mode === 'off') {
		await finishSignal(db, signal.id, 'completed', deps.now(), 'radar_mode_off');
		return { success: true, skipped: 'mode_off' };
	}

	const projectIds = await projectsForSignal(db, signal, deps.policy.maxProjectsPerSignal);
	const scans: NonNullable<FreshnessScanJobResult['scans']> = [];
	let unexpected = 0;
	for (const projectId of projectIds) {
		try {
			const outcome = await runFreshnessProjectScan({
				deps,
				mode,
				flags,
				signalId: signal.id,
				projectId,
				userId: signal.user_id,
				trigger: 'chat_turn',
				triggerSessionId: signal.session_id,
				extraSessionIds: (signal.project_id_hints ?? []).includes(projectId)
					? [signal.session_id]
					: [],
				abortSignal: job.signal,
				log
			});
			scans.push({ projectId, ...outcome });
		} catch (error) {
			unexpected += 1;
			const message = error instanceof Error ? error.message : String(error);
			await log(`Freshness scan for project ${projectId} failed: ${message}`);
			scans.push({ projectId, scanId: null, status: 'failed', reason: 'unexpected_error' });
		}
	}
	await finishSignal(
		db,
		signal.id,
		projectIds.length && unexpected === projectIds.length ? 'failed' : 'completed',
		deps.now(),
		projectIds.length ? null : 'no_projects'
	);
	return { success: true, scans };
}

// ---------------------------------------------------------------------------
// One project scan
// ---------------------------------------------------------------------------

export type ProjectScanOutcome = {
	scanId: string | null;
	status: 'completed' | 'skipped' | 'failed';
	reason?: string;
};

type JevRun = {
	answers: AnswerMap;
	stats: ScanJevStats;
	error: string | null;
};

async function askJev(params: {
	jev: JevDecider;
	requests: Array<{ name: string; request: FreshnessJevRequest }>;
	timeoutMs: number;
	signal?: AbortSignal;
	usage: { userId: string; projectId: string; chatSessionId: string | null; scanId: string };
}): Promise<JevRun> {
	const results = await Promise.all(
		params.requests.map(({ name, request }) =>
			params.jev
				.decide(
					{ state: request.state, questions: request.questions as JevQuestionSet },
					{
						signal: params.signal,
						timeoutMs: params.timeoutMs,
						usage: {
							operationType: FRESHNESS_JEV_OPERATION_TYPE,
							userId: params.usage.userId,
							projectId: params.usage.projectId,
							chatSessionId: params.usage.chatSessionId ?? undefined,
							metadata: { freshnessScanId: params.usage.scanId, request: name }
						}
					}
				)
				.then((result) => ({ name, result }))
				.catch(() => ({
					name,
					result: {
						ok: false,
						error: 'jev_request_failed',
						receipt: null
					} as unknown as JevDecisionResult<JevQuestionSet>
				}))
		)
	);
	const stats: ScanJevStats = {
		modelUsed: null,
		requests: 0,
		inputTokens: 0,
		costUsd: 0,
		latencyMs: []
	};
	const answers: Record<string, unknown> = {};
	const errors: string[] = [];
	for (const { name, result } of results) {
		const receipt = result.receipt;
		if (receipt) {
			stats.requests += 1;
			stats.inputTokens += receipt.inputTokens ?? 0;
			stats.costUsd += receipt.costUsd ?? 0;
			stats.latencyMs.push(receipt.durationMs);
			stats.modelUsed = stats.modelUsed ?? receipt.modelUsed;
		}
		if (!result.ok) {
			errors.push(`${name}:${result.error}`);
			continue;
		}
		// Namespaced by request: R1/R2/R3 question keys never collide, but keep them apart.
		for (const [key, answer] of Object.entries(result.answers))
			answers[`${name}.${key}`] = answer;
	}
	return { answers: answers as AnswerMap, stats, error: errors.length ? errors.join(',') : null };
}

function scoped(answers: AnswerMap, name: string): AnswerMap {
	const prefix = `${name}.`;
	const scopedAnswers: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(answers)) {
		if (key.startsWith(prefix)) scopedAnswers[key.slice(prefix.length)] = value;
	}
	return scopedAnswers as AnswerMap;
}

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

function draftUndoOperation(decision: EntityDecision): LoopOperation | null {
	const proposal = decision.proposal;
	if (!proposal) return null;
	const idArg = Object.keys(proposal.operation.args).find(
		(key) => key.endsWith('_id') && key !== 'project_id'
	)!;
	return {
		tool: proposal.operation.tool,
		args: {
			[idArg]: decision.candidate.id,
			project_id: proposal.operation.args.project_id,
			[proposal.field]: proposal.previousRaw
		},
		label: `Restore ${decision.candidate.kind} "${decision.candidate.title}"`
	};
}

function entityFlagInsert(decision: EntityDecision, mode: ScanMode): FlagInsert {
	let disposition = decision.disposition;
	let reason: string | null = decision.reason || null;
	if (disposition === 'auto_apply_pending') {
		// Live claims these by reason; shadow never writes.
		reason = mode === 'live' ? AUTO_APPLY_READY_REASON : 'shadow_would_auto_apply';
		if (mode !== 'live') disposition = 'drafted';
	}
	const undo = draftUndoOperation(decision);
	return {
		subject_kind: decision.candidate.kind,
		subject_id: decision.candidate.id,
		subject_title: decision.candidate.title,
		subject_updated_at: decision.candidate.updatedAt,
		subject_snapshot: candidateSnapshot(decision.candidate),
		probability: decision.probability,
		change_kind: decision.changeKind,
		change_kind_probability: decision.changeKindProbability,
		date_choice: decision.dateChoice,
		date_choice_probability: decision.dateChoiceProbability,
		answers: decision.answers,
		features: {
			...decision.features,
			status_news: decision.statusNews,
			...(decision.dateMention
				? {
						date_mention: {
							id: decision.dateMention.id,
							date: decision.dateMention.date,
							as_written: decision.dateMention.as_written
						}
					}
				: {}),
			...(undo ? { draft_undo: undo } : {}),
			...(decision.proposal
				? {
						proposal: {
							field: decision.proposal.field,
							from: decision.proposal.from,
							to: decision.proposal.to,
							summary: decision.proposal.summary
						}
					}
				: {})
		},
		evidence: decision.evidence,
		disposition,
		disposition_reason: reason,
		proposed_operation: decision.proposal?.operation ?? null
	};
}

function inboxFlagInsert(
	context: FreshnessScanContext,
	index: number,
	decision: InboxDecision,
	inboxLive: boolean
): FlagInsert {
	const subject = context.inboxSubjects[index]!;
	const pendingAction =
		decision.action === 'retire' || decision.action === 'mark'
			? `${inboxLive ? 'pending' : 'would'}_${decision.action}`
			: decision.reason;
	return {
		subject_kind: 'inbox_item',
		subject_id: subject.row.id,
		subject_title: subject.row.title,
		subject_updated_at: subject.row.updated_at,
		subject_snapshot: subject.snapshot,
		probability: decision.probability,
		change_kind: null,
		change_kind_probability: null,
		date_choice: null,
		date_choice_probability: null,
		answers: decision.answers,
		features: {
			source_type: subject.row.source_type,
			eligible_for_retire: subject.eligibleForRetire,
			decided_action: decision.action,
			decided_reason: decision.reason
		},
		evidence: null,
		// Retire/mark dispositions are written only after the side effect succeeds.
		disposition: 'evaluated',
		disposition_reason: pendingAction,
		proposed_operation: null
	};
}

export async function runFreshnessProjectScan(params: {
	deps: FreshnessRadarDeps;
	mode: Exclude<FreshnessRadarMode, 'off'>;
	flags: FreshnessRadarUserFlags;
	signalId: string | null;
	projectId: string;
	userId: string;
	trigger: ScanTrigger;
	triggerSessionId: string | null;
	extraSessionIds: readonly string[];
	abortSignal?: AbortSignal;
	log: Log;
}): Promise<ProjectScanOutcome> {
	const { deps, projectId, userId, mode } = params;
	const { db, policy } = deps;
	const startedAt = deps.now();

	const begun = await beginScan({
		db,
		signalId: params.signalId,
		projectId,
		userId,
		trigger: params.trigger,
		mode,
		triggerSessionId: params.triggerSessionId,
		policy,
		modelRequested: deps.model,
		now: startedAt.toISOString()
	});
	if (begun.kind === 'locked') {
		return {
			scanId: begun.scan?.id ?? null,
			status: 'skipped',
			reason: 'project_scan_running'
		};
	}
	const scan: ScanRow = begun.scan;
	if (begun.kind === 'existing') {
		if (scan.status !== 'running') {
			return { scanId: scan.id, status: 'skipped', reason: `already_${scan.status}` };
		}
		// A retry after a crash mid-scan: reconcile claimed auto-applies and close
		// the scan. The cursor does not advance, so the next signal re-reads.
		const timeZone = await deps.port.loadUserTimezone(userId);
		await reconcileClaimedAutoApplies({ db, projectId, timeZone, now: deps.now });
		await finishScan(db, scan.id, {
			status: 'failed',
			errorMessage: 'interrupted_before_finish',
			now: deps.now().toISOString()
		});
		return { scanId: scan.id, status: 'failed', reason: 'interrupted_before_finish' };
	}

	const fail = async (reason: string, extra: Partial<Parameters<typeof finishScan>[2]> = {}) => {
		await finishScan(db, scan.id, {
			status: 'failed',
			errorMessage: reason,
			now: deps.now().toISOString(),
			...extra
		});
		return { scanId: scan.id, status: 'failed' as const, reason };
	};

	try {
		const context = await buildFreshnessScanContext({
			port: deps.port,
			projectId,
			userId,
			extraSessionIds: params.extraSessionIds,
			now: startedAt,
			policy
		});
		// Any scan of the project first repairs an interrupted auto-apply.
		await reconcileClaimedAutoApplies({
			db,
			projectId,
			timeZone: context.timeZone,
			now: deps.now
		});
		await labelImplicitOutcomes({
			db,
			projectId,
			entitiesByKey: context.entitiesByKey,
			now: startedAt,
			policy
		}).catch(() => undefined);

		const windowPatch = {
			sessionIds: context.window.sessionIds,
			messageIds: context.window.messageIds,
			start: context.window.start,
			cursorAt: context.window.cursorAt,
			chars: context.window.chars,
			truncated: context.window.truncated
		};
		if (context.skipReason) {
			await finishScan(db, scan.id, {
				status: 'skipped',
				skipReason: context.skipReason,
				window: windowPatch,
				candidatesTotal: context.candidatesTotal,
				now: deps.now().toISOString()
			});
			return { scanId: scan.id, status: 'skipped', reason: context.skipReason };
		}

		// [2] Jev requests.
		const common = {
			model: deps.model,
			maxBytes: policy.jev.maxRequestBytes,
			today: context.today,
			project: context.project,
			newInformation: context.newInformation,
			titleChars: policy.jev.titleChars
		};
		const r1 = buildR1Request({
			...common,
			dateMentions: context.dateMentions,
			dateSentenceChars: policy.jev.dateSentenceChars,
			subjects: context.prefiltered.map(
				(entry): R1Subject => ({
					kind: entry.candidate.kind,
					view: context.entityViews.get(
						entityKey(entry.candidate.kind, entry.candidate.id)
					)!
				})
			)
		});
		const r2 = buildR2Request({
			...common,
			subjects: context.trackSubjects.map((subject) => ({ view: trackSubjectView(subject) }))
		});
		const r3 = buildR3Request({
			...common,
			subjects: context.inboxSubjects.map((subject) => ({ view: subject.view }))
		});
		const requests = [
			r1.request ? { name: 'r1', request: r1.request } : null,
			r2.request ? { name: 'r2', request: r2.request } : null,
			r3.request ? { name: 'r3', request: r3.request } : null
		].filter(
			(entry): entry is { name: string; request: FreshnessJevRequest } => entry !== null
		);
		const evaluatedEntities = context.prefiltered.slice(0, r1.subjects.length);
		const trackSubjects = context.trackSubjects.slice(0, r2.subjects.length);
		const inboxSubjects = context.inboxSubjects.slice(0, r3.subjects.length);
		if (!requests.length) {
			await finishScan(db, scan.id, {
				status: 'skipped',
				skipReason: 'no_questions',
				window: windowPatch,
				candidatesTotal: context.candidatesTotal,
				now: deps.now().toISOString()
			});
			return { scanId: scan.id, status: 'skipped', reason: 'no_questions' };
		}
		if (!deps.jev) return await fail('jev_unconfigured', { window: windowPatch });

		const jevRun = await askJev({
			jev: deps.jev,
			requests,
			timeoutMs: policy.jev.timeoutMs,
			signal: params.abortSignal,
			usage: { userId, projectId, chatSessionId: params.triggerSessionId, scanId: scan.id }
		});
		if (jevRun.error) {
			// Fail closed and silent: no flags, no card, no writes.
			return await fail(jevRun.error, { window: windowPatch, jev: jevRun.stats });
		}
		if (params.abortSignal?.aborted) return await fail('aborted', { jev: jevRun.stats });

		// [3] Code combine.
		const gateEnabled = mode === 'live' && params.flags.autoApply && params.flags.surfaces;
		const entityDecisions = combineEntityDecisions({
			projectId,
			entities: evaluatedEntities.map((entry, index) => ({
				index,
				candidate: entry.candidate,
				prefilter: entry.features
			})),
			answers: scoped(jevRun.answers, 'r1'),
			dateMentions: context.dateMentions,
			sentences: context.sentences,
			suppressed: context.suppressed,
			gate: { ...context.gate, enabled: gateEnabled },
			today: context.today,
			policy
		});
		const trackDecisions = scoreTrackSubjects({
			subjects: trackSubjects,
			answers: scoped(jevRun.answers, 'r2'),
			policy
		});
		const inboxDecisions = decideInboxCleanup({
			items: inboxSubjects,
			answers: scoped(jevRun.answers, 'r3'),
			policy
		});
		const inboxLive = mode === 'live' && params.flags.inboxCleanup;

		// [4] Ledger.
		const entityInserts = entityDecisions.map((decision) => entityFlagInsert(decision, mode));
		const inboxInserts = inboxDecisions.map((decision, index) =>
			inboxFlagInsert({ ...context, inboxSubjects }, index, decision, inboxLive)
		);
		const inserted = await insertFlags({
			db,
			scanId: scan.id,
			projectId,
			userId,
			modelUsed: jevRun.stats.modelUsed,
			flags: [...entityInserts, ...inboxInserts]
		});
		const flagIdByKey = new Map(
			inserted.map((row) => [`${row.subject_kind}:${row.subject_id}`, row.id])
		);
		await insertTrackScores({
			db,
			scanId: scan.id,
			projectId,
			userId,
			modelUsed: jevRun.stats.modelUsed,
			rows: trackScoreRows(trackDecisions)
		});

		const finalDisposition = new Map<string, string>(
			entityInserts.map((flag) => [
				`${flag.subject_kind}:${flag.subject_id}`,
				flag.disposition
			])
		);
		const counts: Record<string, number> = {
			...countBy(entityInserts.map((flag) => flag.disposition)),
			excluded: context.excludedCount,
			gauges: trackDecisions.length,
			inbox_evaluated: inboxDecisions.length
		};
		const baseFinish = {
			window: windowPatch,
			candidatesTotal: context.candidatesTotal,
			candidatesEvaluated: evaluatedEntities.length,
			jev: jevRun.stats
		};

		if (mode !== 'live' || params.abortSignal?.aborted) {
			await finishScan(db, scan.id, {
				status: 'completed',
				counts: {
					...counts,
					would_retire: inboxDecisions.filter((decision) => decision.action === 'retire')
						.length,
					would_mark: inboxDecisions.filter((decision) => decision.action === 'mark')
						.length
				},
				...baseFinish,
				now: deps.now().toISOString()
			});
			return { scanId: scan.id, status: 'completed' };
		}

		// [5a] Auto-apply.
		const autoCandidates: AutoApplyCandidate[] = entityDecisions
			.filter(
				(decision) => decision.disposition === 'auto_apply_pending' && decision.proposal
			)
			.map((decision) => ({
				flagId: flagIdByKey.get(entityKey(decision.candidate.kind, decision.candidate.id))!,
				taskId: decision.candidate.id,
				title: decision.candidate.title,
				snapshotUpdatedAt: decision.candidate.updatedAt,
				field: decision.proposal!.field as 'state_key' | 'due_at',
				to: decision.proposal!.to,
				previousRaw: decision.proposal!.previousRaw,
				summary: decision.proposal!.summary
			}))
			.filter((candidate) => Boolean(candidate.flagId));
		const autoOutcomes = await runAutoApply({
			db,
			userId,
			projectId,
			triggerSessionId: params.triggerSessionId,
			timeZone: context.timeZone,
			candidates: autoCandidates,
			runGateway: deps.runGateway,
			now: deps.now,
			signal: params.abortSignal
		});
		const autoApplied: Parameters<typeof buildFreshnessCard>[0]['autoApplied'] = [];
		for (const outcome of autoOutcomes) {
			const candidate = autoCandidates.find((entry) => entry.flagId === outcome.flagId)!;
			const key = entityKey('task', candidate.taskId);
			if (outcome.status === 'applied') {
				finalDisposition.set(key, 'auto_applied');
				autoApplied.push({
					flagId: outcome.flagId,
					entity: { kind: 'task', id: candidate.taskId, title: candidate.title },
					summary: candidate.summary,
					undoableUntil: new Date(
						Date.parse(outcome.appliedAt) + policy.undo.windowHours * 3_600_000
					).toISOString()
				});
			} else if (outcome.status === 'demoted') {
				finalDisposition.set(key, 'drafted');
			} else if (outcome.status === 'skipped') {
				finalDisposition.set(key, 'auto_apply_skipped');
			}
		}

		// [5b] Inbox cleanup (before the bundle, so retired slots free first).
		const cleanup = inboxLive
			? await runInboxCleanup({
					db,
					ops: deps.inboxOps,
					subjects: inboxSubjects,
					decisions: inboxDecisions,
					flagIds: inboxSubjects.map(
						(subject) => flagIdByKey.get(`inbox_item:${subject.row.id}`) ?? null
					),
					sentences: context.sentences,
					excerptChars: policy.evidence.excerptChars
				})
			: { retired: [], marked: [], reset: [], failed: [] };

		// [5c] Bundle of drafts (tasks, goals, milestones with an operation).
		const draftDecisions = entityDecisions.filter((decision) => {
			const key = entityKey(decision.candidate.kind, decision.candidate.id);
			return finalDisposition.get(key) === 'drafted' && decision.proposal;
		});
		const draftItems: DraftItem[] = draftDecisions.map((decision) => ({
			flagId: flagIdByKey.get(entityKey(decision.candidate.kind, decision.candidate.id))!,
			entityKind: decision.candidate.kind as DraftItem['entityKind'],
			entityId: decision.candidate.id,
			title: decision.candidate.title,
			probability: decision.probability,
			operation: decision.proposal!.operation,
			undo: draftUndoOperation(decision)!
		}));
		const bundle = await buildDraftBundle({
			db,
			deps: deps.draftDeps,
			projectId,
			scanId: scan.id,
			triggerSessionId: params.triggerSessionId,
			today: context.today,
			drafts: draftItems,
			isUnchanged: (flag: CarriedFlagRow) => {
				const current = context.entitiesByKey.get(
					entityKey(flag.subject_kind, flag.subject_id)
				);
				return (
					Boolean(current) &&
					snapshotsMatch(flag.subject_snapshot as never, candidateSnapshot(current!))
				);
			},
			now: deps.now(),
			policy
		});
		if (bundle.status === 'failed') {
			for (const flagId of bundle.flagIds) {
				await updateFlag(db, flagId, {
					disposition: 'surfaced',
					disposition_reason: bundle.reason
				});
			}
			for (const decision of draftDecisions) {
				finalDisposition.set(
					entityKey(decision.candidate.kind, decision.candidate.id),
					'surfaced'
				);
			}
		} else if (bundle.status === 'created') {
			const carried = new Set(bundle.carriedFlagIds);
			for (const flagId of bundle.overCapFlagIds) {
				if (carried.has(flagId)) continue;
				await updateFlag(db, flagId, { status: 'superseded' }).catch(() => false);
			}
			const overCapFresh = new Set(bundle.overCapFlagIds);
			for (const decision of draftDecisions) {
				const flagId = flagIdByKey.get(
					entityKey(decision.candidate.kind, decision.candidate.id)
				);
				if (flagId && overCapFresh.has(flagId)) {
					await updateFlag(db, flagId, {
						disposition: 'surfaced',
						disposition_reason: 'bundle_cap',
						status: 'open'
					});
					finalDisposition.set(
						entityKey(decision.candidate.kind, decision.candidate.id),
						'surfaced'
					);
				}
			}
		}

		// [5d] Budget ran inside the bundle build; cleanup-only scans rebalance here.
		if (bundle.status !== 'created' && cleanup.retired.length) {
			await deps.draftDeps.applyBudget({ supabase: db, projectId }).catch(() => undefined);
		}

		// [5e] Card.
		const cardDecisions = entityDecisions.map((decision) => ({
			...decision,
			disposition: (finalDisposition.get(
				entityKey(decision.candidate.kind, decision.candidate.id)
			) ?? decision.disposition) as EntityDecision['disposition']
		}));
		const ranked = rankCardDecisions(cardDecisions, policy.combine.cardMaxItems);
		const card = params.triggerSessionId
			? buildFreshnessCard({
					scanId: scan.id,
					projectId,
					projectName: context.project.name,
					createdAt: deps.now().toISOString(),
					items: ranked.top.map((decision) => ({
						flagId: flagIdByKey.get(
							entityKey(decision.candidate.kind, decision.candidate.id)
						)!,
						decision
					})),
					moreCount: ranked.more,
					bundle:
						bundle.status === 'created'
							? {
									suggestionId: bundle.suggestionId,
									operationCount: bundle.operationCount
								}
							: null,
					autoApplied,
					inboxCleanup: {
						retired: cleanup.retired,
						possiblyStaleCount: cleanup.marked.length
					},
					gaugeChanges: gaugeChanges(trackDecisions)
				})
			: null;
		const cardMessageId =
			card && params.triggerSessionId
				? await deliverFreshnessCard({
						db,
						sessionId: params.triggerSessionId,
						userId,
						card
					})
				: null;

		const finalCounts = countBy([...finalDisposition.values()]);
		await finishScan(db, scan.id, {
			status: 'completed',
			counts: {
				...counts,
				surfaced: finalCounts.surfaced ?? 0,
				drafted: finalCounts.drafted ?? 0,
				auto_applied: finalCounts.auto_applied ?? 0,
				auto_apply_skipped: finalCounts.auto_apply_skipped ?? 0,
				retired: cleanup.retired.length,
				marked: cleanup.marked.length,
				reset_fresh: cleanup.reset.length,
				bundle_operations: bundle.status === 'created' ? bundle.operationCount : 0
			},
			cardMessageId,
			...baseFinish,
			now: deps.now().toISOString()
		});
		return { scanId: scan.id, status: 'completed' };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await fail(`unexpected: ${message}`).catch(() => undefined);
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Default wiring
// ---------------------------------------------------------------------------

/** The shared inbox-index helpers (Lane A) behind the cleanup port. */
export function createSharedInboxCleanupOps(projectId?: string): InboxCleanupOps {
	return {
		retire: async (params) => {
			const result = await retireInboxSourceForFreshness({
				supabase: params.supabase as never,
				inboxItemId: params.inboxItemId,
				flagId: params.flagId,
				reason: params.reason,
				projectId
			});
			if (!result.ok || result.undo.suggestionId !== params.suggestionId)
				return { ok: false };
			return { ok: true, previousInboxStatus: result.undo.previousInboxStatus };
		},
		mark: async (params) => {
			const row = await markInboxItemFreshness({
				supabase: params.supabase as never,
				inboxItemId: params.inboxItemId,
				state: params.state,
				note: params.note,
				flagId: params.flagId
			});
			return row !== null;
		}
	};
}

let defaultDeps: FreshnessRadarDeps | null = null;

export function createDefaultFreshnessRadarDeps(
	env: Record<string, string | undefined> = process.env
): FreshnessRadarDeps {
	if (defaultDeps) return defaultDeps;
	const db = supabase as unknown as FreshnessDb;
	const model = readFreshnessRadarJevModel(env);
	const apiKey = env.PRIVATE_OPENROUTER_API_KEY?.trim();
	defaultDeps = {
		db,
		port: new SupabaseFreshnessDataPort(db),
		jev: apiKey
			? new JevClient({
					apiKey,
					model,
					timeoutMs: FRESHNESS_POLICY_V1.jev.timeoutMs,
					maxRequestBytes: FRESHNESS_POLICY_V1.jev.maxRequestBytes,
					retryOnce: true,
					title: 'BuildOS Freshness Radar',
					usage: new LLMUsageLogger({ supabase: supabase as never })
				})
			: null,
		mode: readFreshnessRadarMode(env),
		model,
		policy: FRESHNESS_POLICY_V1,
		now: () => new Date(),
		runGateway: runGatewayWriteOp,
		draftDeps: {
			verify: (client, input) =>
				verifyProjectSuggestionIntegrity(client, input) as ReturnType<
					DraftBundleDeps['verify']
				>,
			fingerprint: (client, projectId, operations) =>
				computeProjectSuggestionFreshnessFingerprint(client, projectId, operations),
			syncInbox: (params) =>
				syncInboxItemForProjectSuggestion({
					supabase: params.supabase as never,
					suggestion: params.suggestion
				}),
			applyBudget: (params) =>
				applyProjectAttentionBudget({
					supabase: params.supabase as never,
					projectId: params.projectId
				})
		},
		inboxOps: createSharedInboxCleanupOps()
	};
	return defaultDeps;
}

/** Test seam: replace (or reset with null) the process-wide default deps. */
export function setDefaultFreshnessRadarDeps(deps: FreshnessRadarDeps | null): void {
	defaultDeps = deps;
}
