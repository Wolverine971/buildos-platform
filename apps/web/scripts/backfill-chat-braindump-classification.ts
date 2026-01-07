// apps/web/scripts/backfill-chat-braindump-classification.ts
// Queue classification/processing jobs for chats and braindumps missing metadata.

import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
	process.env.PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.SUPABASE_SERVICE_KEY;
const WORKER_URL = process.env.PUBLIC_RAILWAY_WORKER_URL;
const WORKER_TOKEN = process.env.PRIVATE_RAILWAY_WORKER_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_DIRECT = process.argv.includes('--direct');
const MAX_ITEMS = parseNonNegativeInt(getArgValue('--max') ?? process.env.MAX_ITEMS, 0);
const BATCH_SIZE = parsePositiveInt(process.env.BATCH_SIZE, 200);
const CONCURRENCY = parsePositiveInt(process.env.CONCURRENCY, 5);
const ONLY_CHATS = process.argv.includes('--chats-only');
const ONLY_BRAINDUMPS = process.argv.includes('--braindumps-only');

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing required environment variables');
	console.error('  PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
	console.error(
		'  PRIVATE_SUPABASE_SERVICE_KEY:',
		SERVICE_KEY ? 'Set' : 'Missing (also tried PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY)'
	);
	process.exit(1);
}

const USE_DIRECT_QUEUE = FORCE_DIRECT || !WORKER_URL;
let workerUnavailable = USE_DIRECT_QUEUE;

const supabase = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

type ChatSessionRow = {
	id: string;
	user_id: string;
	title: string | null;
	auto_title: string | null;
	chat_topics: string[] | null;
	summary: string | null;
	message_count: number | null;
	status: string;
};

type BraindumpRow = {
	id: string;
	user_id: string;
	title: string | null;
	topics: string[] | null;
	summary: string | null;
	status: string;
};

const DEFAULT_CHAT_TITLES = new Set(
	[
		'Agent Session',
		'Project Assistant',
		'Task Assistant',
		'Calendar Assistant',
		'General Assistant',
		'New Project Creation',
		'Project Audit',
		'Project Forecast',
		'Task Update',
		'Daily Brief Settings',
		'Chat session',
		'Untitled Chat'
	].map((title) => title.toLowerCase())
);

const DEFAULT_BRAINDUMP_TITLES = new Set(
	['untitled braindump', 'braindump', 'untitled'].map((title) => title.toLowerCase())
);

function isPlaceholderChatTitle(title?: string | null): boolean {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_CHAT_TITLES.has(normalized);
}

function isPlaceholderBraindumpTitle(title?: string | null): boolean {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_BRAINDUMP_TITLES.has(normalized);
}

function needsChatClassification(session: ChatSessionRow): boolean {
	const hasTopics = (session.chat_topics?.length ?? 0) > 0;
	const hasSummary = !!session.summary;
	const rawTitle = session.title?.trim() || '';
	const autoTitle = session.auto_title?.trim() || '';
	const hasTitle = !!autoTitle || (!!rawTitle && !isPlaceholderChatTitle(rawTitle));
	return !(hasTitle && hasTopics && hasSummary);
}

function needsBraindumpProcessing(braindump: BraindumpRow): boolean {
	const hasTopics = (braindump.topics?.length ?? 0) > 0;
	const hasSummary = !!braindump.summary;
	const hasTitle = !!braindump.title && !isPlaceholderBraindumpTitle(braindump.title);
	const isProcessing = braindump.status === 'processing';
	return !isProcessing && !(hasTitle && hasTopics && hasSummary);
}

function getArgValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index === -1) return undefined;
	return process.argv[index + 1];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isFinite(parsed) && parsed >= 0) return parsed;
	return fallback;
}

function shouldFallbackToDirect(error: unknown): boolean {
	if (!error) return false;
	if (typeof error === 'object' && 'cause' in error) {
		const cause = (error as { cause?: { code?: string } }).cause;
		if (cause?.code === 'ECONNREFUSED') return true;
	}
	return (error as Error)?.message?.includes('fetch failed') ?? false;
}

async function queueJobDirect(params: {
	jobType: 'classify_chat_session' | 'process_onto_braindump';
	userId: string;
	metadata: Record<string, unknown>;
	dedupKey: string;
	priority: number;
}): Promise<'queued'> {
	if (DRY_RUN) {
		return 'queued';
	}

	const { error } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: params.jobType,
		p_metadata: params.metadata,
		p_priority: params.priority,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: params.dedupKey
	});

	if (error) {
		throw new Error(error.message);
	}

	return 'queued';
}

async function queueChatClassification(session: ChatSessionRow): Promise<'queued' | 'skipped'> {
	if (USE_DIRECT_QUEUE || workerUnavailable) {
		return queueJobDirect({
			jobType: 'classify_chat_session',
			userId: session.user_id,
			metadata: { sessionId: session.id, userId: session.user_id },
			dedupKey: `classify-session-${session.id}`,
			priority: 8
		});
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (WORKER_TOKEN) {
		headers.Authorization = `Bearer ${WORKER_TOKEN}`;
	}

	try {
		const response = await fetch(`${WORKER_URL}/queue/chat/classify`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ sessionId: session.id, userId: session.user_id })
		});

		if (response.status === 409) {
			return 'skipped';
		}

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			throw new Error(payload?.error || `HTTP ${response.status}`);
		}

		return 'queued';
	} catch (error) {
		if (shouldFallbackToDirect(error)) {
			if (!workerUnavailable) {
				console.warn('Worker unreachable. Falling back to direct queueing.');
			}
			workerUnavailable = true;
			return queueJobDirect({
				jobType: 'classify_chat_session',
				userId: session.user_id,
				metadata: { sessionId: session.id, userId: session.user_id },
				dedupKey: `classify-session-${session.id}`,
				priority: 8
			});
		}
		throw error;
	}
}

async function queueBraindumpProcessing(braindump: BraindumpRow): Promise<'queued' | 'skipped'> {
	if (USE_DIRECT_QUEUE || workerUnavailable) {
		return queueJobDirect({
			jobType: 'process_onto_braindump',
			userId: braindump.user_id,
			metadata: { braindumpId: braindump.id, userId: braindump.user_id },
			dedupKey: `process-onto-braindump-${braindump.id}`,
			priority: 7
		});
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (WORKER_TOKEN) {
		headers.Authorization = `Bearer ${WORKER_TOKEN}`;
	}

	try {
		const response = await fetch(`${WORKER_URL}/queue/braindump/process`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ braindumpId: braindump.id, userId: braindump.user_id })
		});

		if (response.status === 409) {
			return 'skipped';
		}

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			throw new Error(payload?.error || `HTTP ${response.status}`);
		}

		return 'queued';
	} catch (error) {
		if (shouldFallbackToDirect(error)) {
			if (!workerUnavailable) {
				console.warn('Worker unreachable. Falling back to direct queueing.');
			}
			workerUnavailable = true;
			return queueJobDirect({
				jobType: 'process_onto_braindump',
				userId: braindump.user_id,
				metadata: { braindumpId: braindump.id, userId: braindump.user_id },
				dedupKey: `process-onto-braindump-${braindump.id}`,
				priority: 7
			});
		}
		throw error;
	}
}

async function processInBatches<T>(
	items: T[],
	handler: (item: T) => Promise<'queued' | 'skipped'>
): Promise<{ queued: number; skipped: number; failed: number }> {
	let queued = 0;
	let skipped = 0;
	let failed = 0;

	for (let i = 0; i < items.length; i += CONCURRENCY) {
		const slice = items.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(slice.map((item) => handler(item)));

		for (const result of results) {
			if (result.status === 'fulfilled') {
				if (result.value === 'queued') {
					queued += 1;
				} else {
					skipped += 1;
				}
			} else {
				failed += 1;
				console.error('Queue failed:', result.reason);
			}
		}
	}

	return { queued, skipped, failed };
}

async function runChatBackfill() {
	let offset = 0;
	let queuedTotal = 0;
	let skippedTotal = 0;
	let failedTotal = 0;
	let processed = 0;

	for (;;) {
		const { data, error } = await supabase
			.from('chat_sessions')
			.select('id, user_id, title, auto_title, chat_topics, summary, message_count, status')
			.neq('status', 'archived')
			.order('created_at', { ascending: false })
			.range(offset, offset + BATCH_SIZE - 1);

		if (error) {
			throw new Error(error.message);
		}

		const sessions = (data ?? []) as ChatSessionRow[];
		if (sessions.length === 0) break;

		const targets = sessions.filter(needsChatClassification);
		if (targets.length > 0) {
			console.log(`Chats: queueing ${targets.length} sessions (offset ${offset})`);
		}

		const { queued, skipped, failed } = await processInBatches(
			targets,
			queueChatClassification
		);
		queuedTotal += queued;
		skippedTotal += skipped;
		failedTotal += failed;
		processed += sessions.length;

		if (MAX_ITEMS > 0 && processed >= MAX_ITEMS) {
			break;
		}

		offset += BATCH_SIZE;
	}

	console.log('Chat classification backfill complete');
	console.log(`Queued: ${queuedTotal}, Skipped: ${skippedTotal}, Failed: ${failedTotal}`);
}

async function runBraindumpBackfill() {
	let offset = 0;
	let queuedTotal = 0;
	let skippedTotal = 0;
	let failedTotal = 0;
	let processed = 0;

	for (;;) {
		const { data, error } = await supabase
			.from('onto_braindumps')
			.select('id, user_id, title, topics, summary, status')
			.order('created_at', { ascending: false })
			.range(offset, offset + BATCH_SIZE - 1);

		if (error) {
			throw new Error(error.message);
		}

		const braindumps = (data ?? []) as BraindumpRow[];
		if (braindumps.length === 0) break;

		const targets = braindumps.filter(needsBraindumpProcessing);
		if (targets.length > 0) {
			console.log(`Braindumps: queueing ${targets.length} records (offset ${offset})`);
		}

		const { queued, skipped, failed } = await processInBatches(
			targets,
			queueBraindumpProcessing
		);
		queuedTotal += queued;
		skippedTotal += skipped;
		failedTotal += failed;
		processed += braindumps.length;

		if (MAX_ITEMS > 0 && processed >= MAX_ITEMS) {
			break;
		}

		offset += BATCH_SIZE;
	}

	console.log('Braindump processing backfill complete');
	console.log(`Queued: ${queuedTotal}, Skipped: ${skippedTotal}, Failed: ${failedTotal}`);
}

async function main() {
	console.log('Starting classification backfill...');
	if (DRY_RUN) {
		console.log('DRY RUN MODE - No jobs will be queued');
	}
	if (USE_DIRECT_QUEUE) {
		console.log('Direct queue mode enabled (add_queue_job RPC).');
	}

	if (!ONLY_BRAINDUMPS) {
		await runChatBackfill();
	}

	if (!ONLY_CHATS) {
		await runBraindumpBackfill();
	}

	if (workerUnavailable) {
		console.warn(
			'Worker unreachable or disabled. Jobs were queued directly; ensure a worker is running to process them.'
		);
	}

	console.log('Backfill finished.');
}

main().catch((error) => {
	console.error('Backfill failed:', error);
	process.exit(1);
});
