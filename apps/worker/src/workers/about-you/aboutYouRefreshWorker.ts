// apps/worker/src/workers/about-you/aboutYouRefreshWorker.ts
//
// about_you_refresh (tasker/146): keeps the "About you" note in a person's
// Workspace, inferred from their own chat messages. Queued by the hourly sweep
// (scheduler) for people in the cohort who said enough since the last run.
//
// The note is an ordinary Workspace document (ABOUT_YOU_TYPE_KEY), so the person
// can read, edit or delete it like any doc. Its bookkeeping rides in
// props.about_you: the newest message read (watermark), the exact text last
// written (so a line the person deleted is noticed and never comes back), the
// suppressed line keys, and the input hash.
//
// Cost guards: cohort only, at most one model run per DAILY_WINDOW_HOURS, nothing
// runs until MIN_NEW_MESSAGES new messages arrive, and the call is capped at
// ABOUT_YOU_MAX_COST_PER_CALL_USD.
import type {
	AboutYouRefreshJobMetadata,
	AboutYouRefreshResult,
	AgentCallScope,
	Json
} from '@buildos/shared-types';
import {
	ABOUT_YOU_TITLE,
	ABOUT_YOU_TYPE_KEY,
	findUserRemovedAboutYouLines,
	mergeAboutYouProposal,
	parseAboutYouDocument,
	renderAboutYouDocument,
	type AboutYouSection
} from '@buildos/shared-agent-ops/ontology/about-you';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	ensureActorId,
	ensureWorkspaceProjectId
} from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import {
	ABOUT_YOU_MIN_NEW_MESSAGES,
	type AboutYouEvidenceMessage,
	type JsonCaller,
	aboutYouInputHash,
	askForAboutYouRefresh,
	buildAboutYouRefreshPrompt,
	checkAboutYouRefreshAnswer,
	selectAboutYouEvidence
} from './about-you-refresh';
import { isAboutYouUser } from './about-you-cohort';

/** One model run per person per window (a day, with slack for the hourly sweep). */
export const DAILY_WINDOW_HOURS = 20;
/** First run, or a run after a long gap, reads at most this far back. */
const FIRST_RUN_LOOKBACK_DAYS = 30;
const MESSAGE_READ_LIMIT = 80;
const DESCRIPTION = 'What BuildOS has picked up from your chats. Edit or delete anything.';

type Deps = { supabase: typeof defaultSupabase; llm: JsonCaller; now: () => Date };

let sharedLlm: SmartLLMService | null = null;

export type AboutYouState = {
	watermark_at: string | null;
	last_written: string | null;
	suppressed_keys: string[];
	input_hash: string | null;
	refreshed_at: string | null;
};

export function readAboutYouState(props: unknown): AboutYouState {
	const record =
		props && typeof props === 'object' && !Array.isArray(props)
			? ((props as Record<string, unknown>).about_you as Record<string, unknown> | undefined)
			: undefined;
	const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
	return {
		watermark_at: text(record?.watermark_at),
		last_written: text(record?.last_written),
		suppressed_keys: Array.isArray(record?.suppressed_keys)
			? (record!.suppressed_keys as unknown[]).filter(
					(key): key is string => typeof key === 'string' && key.length > 0
				)
			: [],
		input_hash: text(record?.input_hash),
		refreshed_at: text(record?.refreshed_at)
	};
}

function documentScope(projectId: string): AgentCallScope {
	return {
		mode: 'read_write',
		project_ids: [projectId],
		allowed_ops: ['onto.document.create', 'onto.document.update']
	};
}

const WHERE_BY_CONTEXT: Record<string, string> = {
	global: 'Workspace chat',
	general: 'Workspace chat',
	daily_brief: 'Daily brief chat',
	calendar: 'Calendar chat',
	project_create: 'Project setup'
};

export async function processAboutYouRefreshJob(
	job: ProcessingJob<AboutYouRefreshJobMetadata>,
	deps: Partial<Deps> = {}
): Promise<AboutYouRefreshResult> {
	const db = deps.supabase ?? defaultSupabase;
	const now = (deps.now ?? (() => new Date()))();
	const userId = typeof job.data?.userId === 'string' ? job.data.userId : '';
	if (!userId) throw new Error('about_you_refresh needs userId');
	const requested = job.data?.reason === 'requested';
	const done = (
		outcome: AboutYouRefreshResult['outcome'],
		extra: Partial<AboutYouRefreshResult> = {}
	): AboutYouRefreshResult => ({ success: outcome !== 'failed', userId, outcome, ...extra });

	if (!isAboutYouUser(userId)) return done('skipped', { reason: 'not in cohort' });

	// Daily cap: count runs that called the model (updated or unchanged).
	const windowStart = new Date(now.getTime() - DAILY_WINDOW_HOURS * 3600_000).toISOString();
	const { data: recentRuns, error: runsError } = await db
		.from('queue_jobs')
		.select('result, completed_at')
		.eq('user_id', userId)
		.eq('job_type', 'about_you_refresh')
		.eq('status', 'completed')
		.order('completed_at', { ascending: false })
		.limit(10);
	if (runsError) throw new Error(`Could not read recent runs: ${runsError.message}`);
	const lastResult = (recentRuns ?? [])
		.map((run) => run.result as AboutYouRefreshResult | null)
		.find((result) => result?.outcome === 'updated' || result?.outcome === 'unchanged');
	const ranRecently = (recentRuns ?? []).some((run) => {
		const outcome = (run.result as AboutYouRefreshResult | null)?.outcome;
		return (
			(outcome === 'updated' || outcome === 'unchanged') &&
			typeof run.completed_at === 'string' &&
			run.completed_at >= windowStart
		);
	});
	if (ranRecently && !requested) return done('skipped', { reason: 'daily cap' });

	const workspaceId = await ensureWorkspaceProjectId(db as never, userId);
	const { data: document, error: documentError } = await db
		.from('onto_documents')
		.select('id, content, props, updated_at')
		.eq('project_id', workspaceId)
		.eq('type_key', ABOUT_YOU_TYPE_KEY)
		.is('deleted_at', null)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (documentError) throw new Error(`Could not load About you: ${documentError.message}`);

	const state: AboutYouState = document
		? readAboutYouState(document.props)
		: {
				watermark_at: lastResult?.watermarkAt ?? null,
				last_written: null,
				suppressed_keys: [],
				input_hash: lastResult?.inputHash ?? null,
				refreshed_at: null
			};

	const lookbackStart = new Date(
		now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000
	).toISOString();
	const since =
		state.watermark_at && state.watermark_at > lookbackStart
			? state.watermark_at
			: lookbackStart;
	const { data: messageRows, error: messageError } = await db
		.from('chat_messages')
		.select('id, content, created_at, session_id')
		.eq('user_id', userId)
		.eq('role', 'user')
		.gt('created_at', since)
		.order('created_at', { ascending: false })
		.limit(MESSAGE_READ_LIMIT);
	if (messageError) throw new Error(`Could not read messages: ${messageError.message}`);
	const messages = (messageRows ?? []).filter(
		(row) => typeof row.content === 'string' && row.content.trim()
	);
	if (messages.length < ABOUT_YOU_MIN_NEW_MESSAGES && !requested) {
		return done('nothing_new', { messagesRead: messages.length });
	}

	const actorId = await ensureActorId(db as never, userId);
	const sessionIds = [...new Set(messages.map((row) => row.session_id).filter(Boolean))];
	const [sessions, summaries] = await Promise.all([
		sessionIds.length
			? db
					.from('chat_sessions')
					.select('id, context_type, entity_id')
					.eq('user_id', userId)
					.in('id', sessionIds)
			: Promise.resolve({ data: [], error: null }),
		db.rpc('get_onto_project_summaries_v1', { p_actor_id: actorId })
	]);
	if (sessions.error) throw new Error(`Could not read sessions: ${sessions.error.message}`);
	if (summaries.error) throw new Error(`Could not read projects: ${summaries.error.message}`);
	type SummaryRow = { id: string; name: string; kind: string | null; state_key: string };
	const projectRows = ((summaries.data ?? []) as SummaryRow[]).filter(
		(row) => row.kind !== 'workspace'
	);
	const projectNameById = new Map(projectRows.map((row) => [row.id, row.name]));
	const sessionById = new Map(
		(
			(sessions.data ?? []) as Array<{
				id: string;
				context_type: string | null;
				entity_id: string | null;
			}>
		).map((row) => [row.id, row])
	);
	const evidenceSource: AboutYouEvidenceMessage[] = messages.map((row) => {
		const session = row.session_id ? sessionById.get(row.session_id) : undefined;
		const contextType = session?.context_type ?? 'global';
		const where =
			contextType === 'project' || contextType === 'ontology'
				? (session?.entity_id && projectNameById.get(session.entity_id)) || 'a project'
				: (WHERE_BY_CONTEXT[contextType] ?? 'chat');
		return { at: row.created_at as string, where, text: row.content as string };
	});
	const evidence = selectAboutYouEvidence(evidenceSource);
	const newestRead = messages.reduce<string | null>(
		(latest, row) =>
			!latest || (row.created_at as string) > latest ? (row.created_at as string) : latest,
		null
	);
	const watermarkAt = newestRead ?? state.watermark_at ?? undefined;

	const current = parseAboutYouDocument(document?.content ?? '');
	// No document yet: nothing is current and nothing was written. A document with no
	// record of what BuildOS wrote is treated as entirely the person's own.
	const lastWritten: AboutYouSection[] | null = document
		? state.last_written !== null
			? parseAboutYouDocument(state.last_written)
			: null
		: [];
	const removedNow = lastWritten ? findUserRemovedAboutYouLines(lastWritten, current) : [];
	const suppressedForPrompt = [...new Set([...removedNow, ...state.suppressed_keys])];

	const inputHash = aboutYouInputHash({
		current,
		suppressedKeys: suppressedForPrompt,
		messages: evidence
	});
	if (!requested && inputHash === state.input_hash) {
		return done('nothing_new', { watermarkAt, inputHash, messagesRead: messages.length });
	}

	if (job.signal.aborted) return done('skipped', { reason: 'job aborted' });
	const prompt = buildAboutYouRefreshPrompt({
		today: now.toISOString().slice(0, 10),
		current,
		suppressedKeys: suppressedForPrompt,
		messages: evidence,
		projectNames: projectRows.map((row) => row.name)
	});
	const llm = deps.llm ?? (sharedLlm ??= new SmartLLMService());
	let raw: unknown;
	try {
		raw = await askForAboutYouRefresh(llm, prompt, {
			userId,
			projectId: workspaceId,
			signal: job.signal
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unknown';
		await job.log(`About you: model call failed (${message})`);
		return done('failed', { reason: message });
	}
	if (job.signal.aborted) return done('skipped', { reason: 'job aborted' });

	const answer = checkAboutYouRefreshAnswer(raw);
	if (answer.notes.length) await job.log(`About you: ${answer.notes.join('; ')}`);
	const merged = mergeAboutYouProposal({
		current,
		lastWritten,
		suppressedKeys: state.suppressed_keys,
		proposed: answer.lines,
		now
	});
	const content = renderAboutYouDocument(merged.sections);
	const nextState: AboutYouState = {
		watermark_at: watermarkAt ?? null,
		last_written: content,
		suppressed_keys: merged.suppressedKeys,
		input_hash: inputHash,
		refreshed_at: now.toISOString()
	};
	const counts = {
		watermarkAt,
		inputHash,
		messagesRead: messages.length,
		linesWritten: merged.sections.reduce((sum, section) => sum + section.lines.length, 0),
		linesDropped: merged.dropped.length
	};

	if (!document) {
		// An empty note is fine: don't put an empty document in the Workspace.
		if (merged.sections.length === 0) return done('unchanged', counts);
		const created = await runGatewayWriteOp({
			admin: db as never,
			userId,
			scope: documentScope(workspaceId),
			op: 'onto.document.create',
			args: {
				project_id: workspaceId,
				title: ABOUT_YOU_TITLE,
				type_key: ABOUT_YOU_TYPE_KEY,
				description: DESCRIPTION,
				content,
				props: { about_you: nextState as unknown as Json }
			},
			signal: job.signal
		});
		if (!created.ok)
			throw new Error(`About you write failed: ${created.error?.message ?? 'unknown error'}`);
		await job.log(
			`About you: created with ${counts.linesWritten} line(s) from ${messages.length} message(s) (${answer.changed})`
		);
		return done('updated', { ...counts, documentId: created.entityId ?? undefined });
	}

	// The person may have edited the note while the model ran: never write over that.
	const { data: fresh, error: freshError } = await db
		.from('onto_documents')
		.select('updated_at')
		.eq('id', document.id)
		.maybeSingle();
	if (freshError) throw new Error(`Could not re-check About you: ${freshError.message}`);
	if (!fresh || fresh.updated_at !== document.updated_at) {
		return done('skipped', { reason: 'edited during run', documentId: document.id });
	}

	const changed = content.trim() !== (document.content ?? '').trim();
	const updated = await runGatewayWriteOp({
		admin: db as never,
		userId,
		scope: documentScope(workspaceId),
		op: 'onto.document.update',
		args: {
			document_id: document.id,
			...(changed ? { content, update_strategy: 'replace', allow_large_deletion: true } : {}),
			props: { about_you: nextState as unknown as Json }
		},
		signal: job.signal
	});
	if (!updated.ok)
		throw new Error(`About you write failed: ${updated.error?.message ?? 'unknown error'}`);
	await job.log(
		`About you: ${changed ? 'updated' : 'unchanged'}, ${counts.linesWritten} line(s), ${counts.linesDropped} dropped, ${messages.length} message(s) read (${answer.changed})`
	);
	return done(changed ? 'updated' : 'unchanged', { ...counts, documentId: document.id });
}
