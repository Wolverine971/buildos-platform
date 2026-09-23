// apps/worker/scripts/chat-checkpoint-backfill.ts
//
// One-time backfill for chat checkpoint capture (tasker/95): replay a user's past
// project chats that were never captured, oldest first, through the same engine
// the live sweep uses. A backfilled capture is dated to when the user said it and
// leaves today's Current state snapshot alone (see runChatCheckpointCapture).
//
//   Dry run (free, read-only; the default):
//     pnpm --filter @buildos/worker exec tsx scripts/chat-checkpoint-backfill.ts --user <uuid>
//   Apply (calls the model; needs DJ's OK):
//     ... --apply --confirm <project-ref> [--max-usd 1] [--limit N]
//
// Options: --since-days N (default 60), --project <uuid>, --include-recent (also
// take sessions active within the live sweep's 3-day window), --limit N sessions.
//
// Safety:
// - The database is whatever PUBLIC_SUPABASE_URL points at. apps/worker/.env is
//   PROD; `set -a; source .env.agentic-gate.local; set +a` first for QA.
// - --apply refuses unless --confirm names that database's project ref.
// - --max-usd is a hard cap on model spend, checked before every capture.
// - A dry run never calls the model and never writes.

import { parseArgs } from 'node:util';
import { supabase } from '../src/lib/supabase';
import { runChatCheckpointCapture } from '../src/workers/chat/checkpoint/checkpointCapture';
import { createCheckpointCompleteJson } from '../src/workers/chat/checkpoint/checkpointLlm';
import { createSupabaseCheckpointPorts } from '../src/workers/chat/checkpoint/supabaseCheckpointPorts';

const SWEEP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // checkpointJob's sweep lookback
const PAGE = 500;
const MAX_BATCHES_PER_SESSION = 20; // the engine captures 60 messages per run
// Estimate only: DeepSeek V4 Flash list price per token, ~4 characters a token,
// and fixed prompt overhead per call. The fast profile can fall back to pricier
// models, so the cap guards real spend, not this estimate.
const INPUT_USD_PER_TOKEN = 0.098 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.196 / 1_000_000;
const PROMPT_OVERHEAD_TOKENS = 2_500;
const OUTPUT_TOKENS_PER_CAPTURE = 1_500;

const { values } = parseArgs({
	options: {
		user: { type: 'string' },
		project: { type: 'string' },
		'since-days': { type: 'string', default: '60' },
		limit: { type: 'string' },
		apply: { type: 'boolean', default: false },
		confirm: { type: 'string' },
		'max-usd': { type: 'string', default: '1' },
		'include-recent': { type: 'boolean', default: false }
	}
});

const userId = values.user?.trim();
if (!userId) throw new Error('--user <uuid> is required');
const sinceDays = Number(values['since-days']);
const limit = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;
const maxUsd = Number(values['max-usd']);
if (!Number.isFinite(sinceDays) || sinceDays <= 0) throw new Error('--since-days must be > 0');
if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error('--max-usd must be > 0');

const dbRef = new URL(process.env.PUBLIC_SUPABASE_URL ?? 'http://unset').hostname.split('.')[0];
const isolated = process.env.AGENTIC_GATE_DATABASE_ISOLATED === 'true';
console.info(`Database: ${dbRef}${isolated ? ' (isolated QA)' : ' (NOT the isolated QA db)'}`);
if (values.apply && values.confirm !== dbRef) {
	throw new Error(`--apply writes to ${dbRef}; pass --confirm ${dbRef} to proceed`);
}

type Candidate = {
	id: string;
	projectId: string;
	projectName: string;
	title: string;
	firstAt: string;
	lastAt: string;
	userMessages: number;
	userChars: number;
	allChars: number;
	batches: number;
};

async function loadSessions() {
	const now = Date.now();
	const rows: Array<{
		id: string;
		entity_id: string | null;
		title: string | null;
		auto_title: string | null;
		last_message_at: string | null;
		capture_watermark_at: string | null;
	}> = [];
	// Before the tasker/95 migration a dry run still works: every chat counts as uncaptured.
	let columns = 'id, entity_id, title, auto_title, last_message_at, capture_watermark_at';
	for (let from = 0; ; from += PAGE) {
		let query = supabase
			.from('chat_sessions')
			.select(columns)
			.eq('user_id', userId!)
			.eq('context_type', 'project')
			.not('entity_id', 'is', null)
			.gte('last_message_at', new Date(now - sinceDays * 86_400_000).toISOString())
			.order('last_message_at', { ascending: true })
			.range(from, from + PAGE - 1);
		if (values.project) query = query.eq('entity_id', values.project);
		const { data, error } = await query;
		if (error?.code === '42703' && columns.includes('capture_watermark_at')) {
			if (values.apply)
				throw new Error(`${dbRef} lacks the tasker/95 migrations; apply them first`);
			console.info(
				'Watermark columns not migrated here yet; every chat counts as uncaptured.'
			);
			columns = 'id, entity_id, title, auto_title, last_message_at';
			from -= PAGE;
			continue;
		}
		if (error) throw error;
		rows.push(...((data ?? []) as unknown as typeof rows));
		if ((data ?? []).length < PAGE) break;
	}
	const uncaptured = rows.filter(
		(row) =>
			row.last_message_at &&
			(!row.capture_watermark_at || row.last_message_at > row.capture_watermark_at)
	);
	const recent = values['include-recent']
		? []
		: uncaptured.filter((row) => now - Date.parse(row.last_message_at!) < SWEEP_WINDOW_MS);
	const recentIds = new Set(recent.map((row) => row.id));
	return {
		total: rows.length,
		recent: recent.length,
		sessions: uncaptured.filter((row) => !recentIds.has(row.id))
	};
}

async function describe(
	session: Awaited<ReturnType<typeof loadSessions>>['sessions'][number],
	projects: Map<string, string>
): Promise<Candidate | null> {
	const messages: Array<{ role: string; content: string | null; created_at: string | null }> = [];
	for (let from = 0; ; from += PAGE) {
		let query = supabase
			.from('chat_messages')
			.select('role, content, created_at')
			.eq('session_id', session.id)
			.in('role', ['user', 'assistant'])
			.order('created_at', { ascending: true })
			.range(from, from + PAGE - 1);
		if (session.capture_watermark_at)
			query = query.gt('created_at', session.capture_watermark_at);
		const { data, error } = await query;
		if (error) throw error;
		messages.push(...(data ?? []));
		if ((data ?? []).length < PAGE) break;
	}
	const user = messages.filter((message) => message.role === 'user' && message.content?.trim());
	const projectName = projects.get(session.entity_id!);
	if (user.length === 0 || projectName === undefined) return null;
	return {
		id: session.id,
		projectId: session.entity_id!,
		projectName,
		title: session.title?.trim() || session.auto_title?.trim() || '(untitled)',
		firstAt: user[0]!.created_at ?? session.last_message_at!,
		lastAt: messages[messages.length - 1]!.created_at ?? session.last_message_at!,
		userMessages: user.length,
		userChars: user.reduce((sum, message) => sum + message.content!.trim().length, 0),
		allChars: messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0),
		batches: Math.ceil(messages.length / 60)
	};
}

async function startHereChars(projectIds: string[]): Promise<Map<string, number>> {
	const chars = new Map<string, number>();
	for (let from = 0; from < projectIds.length; from += 100) {
		const { data, error } = await supabase
			.from('onto_documents')
			.select('project_id, content')
			.in('project_id', projectIds.slice(from, from + 100))
			.eq('type_key', 'document.context.project')
			.is('deleted_at', null);
		if (error) throw error;
		for (const doc of data ?? []) chars.set(doc.project_id, doc.content?.length ?? 0);
	}
	return chars;
}

function estimateUsd(candidate: Candidate, docChars: number): number {
	// Two calls per batch: the log call reads the chat, the synthesis call reads
	// the chat and START HERE.
	const inputTokens =
		(2 * candidate.allChars + candidate.batches * docChars) / 4 +
		candidate.batches * 2 * PROMPT_OVERHEAD_TOKENS;
	const outputTokens = candidate.batches * OUTPUT_TOKENS_PER_CAPTURE;
	return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
}

async function main() {
	const { total, recent, sessions } = await loadSessions();
	const projectIds = [...new Set(sessions.map((session) => session.entity_id!))];
	const projects = new Map<string, string>();
	for (let from = 0; from < projectIds.length; from += 100) {
		const { data, error } = await supabase
			.from('onto_projects')
			.select('id, name')
			.in('id', projectIds.slice(from, from + 100))
			.is('deleted_at', null);
		if (error) throw error;
		for (const project of data ?? []) projects.set(project.id, project.name ?? '(unnamed)');
	}

	const candidates: Candidate[] = [];
	for (const session of sessions) {
		const candidate = await describe(session, projects);
		if (candidate) candidates.push(candidate);
	}
	candidates.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
	const selected = candidates.slice(0, limit);
	const docChars = await startHereChars([...new Set(selected.map((c) => c.projectId))]);
	const estimates = new Map(
		selected.map((candidate) => [
			candidate.id,
			estimateUsd(candidate, docChars.get(candidate.projectId) ?? 0)
		])
	);

	console.info(
		`\n${total} project chat(s) in the last ${sinceDays} days; ${sessions.length + recent} uncaptured; ` +
			`${recent} active in the last 3 days left to the live sweep; ` +
			`${candidates.length} with user messages in a live project.`
	);
	for (const candidate of selected) {
		console.info(
			`  ${candidate.firstAt.slice(0, 10)}  ${candidate.projectName.slice(0, 28).padEnd(28)}  ` +
				`${candidate.title.slice(0, 40).padEnd(40)}  ${String(candidate.userMessages).padStart(3)} msg  ` +
				`${String(candidate.userChars).padStart(6)} ch  ~$${estimates.get(candidate.id)!.toFixed(4)}`
		);
	}
	const estimatedTotal = [...estimates.values()].reduce((sum, usd) => sum + usd, 0);
	console.info(
		`\n${selected.length} session(s) across ${new Set(selected.map((c) => c.projectId)).size} project(s); ` +
			`estimated ~$${estimatedTotal.toFixed(3)} at DeepSeek V4 Flash prices (cap $${maxUsd.toFixed(2)}).`
	);

	if (!values.apply) {
		console.info(
			'\nDry run: nothing captured. Re-run with --apply --confirm <ref> to capture.'
		);
		return;
	}

	let spent = 0;
	const totals = { captured: 0, noop: 0, failed: 0, reviews: 0, logEntries: 0 };
	const completeJson = createCheckpointCompleteJson({
		onUsage: (event) => {
			spent += event.totalCost;
		}
	});
	const ports = createSupabaseCheckpointPorts({ completeJson });
	console.info('\nCapturing, oldest first…');
	for (const candidate of selected) {
		for (let batch = 0; batch < MAX_BATCHES_PER_SESSION; batch++) {
			if (spent >= maxUsd) {
				console.info(`Spend cap reached ($${spent.toFixed(4)}); stopping.`);
				break;
			}
			try {
				const outcome = await runChatCheckpointCapture(ports, {
					sessionId: candidate.id,
					userId: userId!,
					trigger: 'backfill'
				});
				if (outcome.status === 'skipped') break;
				const record = outcome.record;
				totals[outcome.status] += 1;
				if (record.thinkingLog) totals.logEntries += 1;
				if (record.review) totals.reviews += 1;
				console.info(
					`  ${candidate.firstAt.slice(0, 10)} ${candidate.title.slice(0, 40)}: ${outcome.status}` +
						` · log ${record.thinkingLog?.passageCount ?? 0}` +
						` · applied [${record.startHere?.appliedSections.join(', ') ?? ''}]` +
						` · review [${record.review?.sections.join(', ') ?? ''}]` +
						(record.invariantViolations.length
							? ` · invariants ${record.invariantViolations.join(', ')}`
							: '')
				);
			} catch (error) {
				totals.failed += 1;
				console.warn(
					`  ${candidate.title.slice(0, 40)}: failed (${error instanceof Error ? error.message : String(error)}); next session`
				);
				break;
			}
		}
		if (spent >= maxUsd) break;
	}
	console.info(
		`\nDone: ${totals.captured} captured, ${totals.noop} no-op, ${totals.failed} failed; ` +
			`${totals.logEntries} log entr${totals.logEntries === 1 ? 'y' : 'ies'}, ${totals.reviews} review(s) staged; ` +
			`spent $${spent.toFixed(4)}.`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
