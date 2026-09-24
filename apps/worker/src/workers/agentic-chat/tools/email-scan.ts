// apps/worker/src/workers/agentic-chat/tools/email-scan.ts
//
// `scan_email_inbox` on the worker: list each account's inbox window, skip what
// the scan ledger says this scope already scored, have Jev score every new
// email 0..1 for relevance, and hand back only the likely-relevant emails —
// with body openings for the top few, so the acting model can triage them in
// one round trip instead of list → search → read.
//
// Latency budget (one account, ~100 emails today): list ~0.3 s, metadata reads
// ~2 s at concurrency 8 (skipped entirely for ledger hits that were not
// relevant), one Jev decision ~0.5 s (p90 ~1.3 s hedged), three body reads in
// parallel ~0.6 s. A repeat scan with no new mail skips Gmail reads and Jev.
import type { JevDecider, JevUsageContext } from '@buildos/smart-llm';
import {
	AgenticChatEmailReadErrorV1,
	type AgenticChatEmailScanAccountV1,
	type AgenticChatEmailScanInputV1,
	type AgenticChatEmailScanMessageV1,
	type AgenticChatEmailScanResultV1,
	type AgenticChatEmailScanScopeV1
} from '@buildos/agentic-chat-runtime/tools';
import type {
	GmailInboxScanMessage,
	GmailInboxWindowScan
} from '@buildos/shared-agent-ops/email/gmail-read-gateway';
import type { ContextFinderReadClient } from '@buildos/agentic-chat-runtime/context-finder';
import {
	type EmailRelevanceFocus,
	type EmailRelevanceItem,
	type EmailScanProjectBrief,
	describeEmailRelevanceTarget,
	isRelevantEmailScore,
	scoreEmailRelevance
} from './email-relevance';
import {
	type EmailScanLedger,
	type EmailScanLedgerEntry,
	emailScanScopeKey
} from './email-scan-ledger';

/** Relevant emails handed to the runtime tool (it shows at most 15). */
const MAX_RELEVANT_RETURNED = 20;
/** Unscored fallback: the newest emails, unfiltered. */
const MAX_UNSCORED_RETURNED = 12;
const BODY_EXCERPT_COUNT = 3;
const BODY_EXCERPT_CHARS = 1_500;
const BODY_EXCERPT_DEADLINE_MS = 2_500;
const MAX_OTHER_SENDERS = 8;
const START_HERE_TYPE_KEY = 'document.context.project';

export type EmailScanAccount = {
	connectionId: string;
	emailAddress: string;
	accountLabel: string;
	status: string;
	readEnabled: boolean;
};

export type EmailScanGateway = {
	scanInboxWindow(params: {
		userId: string;
		connectionId: string;
		afterEpochSeconds: number;
		beforeEpochSeconds: number;
		maxResults: number;
		skipFetch?: (messageIds: readonly string[]) => Promise<ReadonlySet<string>>;
	}): Promise<GmailInboxWindowScan>;
	getMessage(params: {
		userId: string;
		connectionId: string;
		messageId: string;
	}): Promise<{ bodyText: string; bodyTruncated: boolean }>;
};

export type EmailScanDeps = {
	gateway: EmailScanGateway;
	listAccounts(): Promise<EmailScanAccount[]>;
	ledger: EmailScanLedger | null;
	decider: JevDecider | null;
	loadProjectBrief(
		projectId: string,
		signal?: AbortSignal
	): Promise<EmailScanProjectBrief | null>;
	usage?: JevUsageContext;
	now?: () => Date;
	onLedgerWriteError?: (error: unknown) => void;
};

type ScannedMessage = {
	message: GmailInboxScanMessage;
	prior: EmailScanLedgerEntry | null;
	ref: string;
};

function senderName(from: string): string {
	const display = from
		.replace(/<[^>]*>/g, '')
		.replace(/"/g, '')
		.trim();
	return (display || from).slice(0, 120);
}

function focusFor(
	lookingFor: string | null,
	brief: EmailScanProjectBrief | null
): EmailRelevanceFocus {
	if (lookingFor) return { scope: 'request', lookingFor, project: brief };
	if (brief) return { scope: 'project', project: brief };
	return { scope: 'attention' };
}

function toResultMessage(
	scanned: ScannedMessage,
	relevance: number | null
): AgenticChatEmailScanMessageV1 {
	const { message } = scanned;
	return {
		connectionId: message.connectionId,
		accountLabel: message.accountLabel,
		emailAddress: message.emailAddress,
		messageId: message.messageId,
		threadId: message.threadId,
		subject: message.subject,
		from: message.from,
		to: message.to,
		date: message.internalDate,
		snippet: message.snippet,
		relevance,
		previouslyChecked: scanned.prior !== null,
		bodyExcerpt: null,
		bodyTruncated: false
	};
}

async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), ms);
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function runEmailInboxScan(
	userId: string,
	input: AgenticChatEmailScanInputV1,
	deps: EmailScanDeps
): Promise<AgenticChatEmailScanResultV1> {
	const now = deps.now ?? (() => new Date());
	const allAccounts = await deps.listAccounts();
	let accounts = allAccounts;
	if (input.connectionIds?.length) {
		const byId = new Map(allAccounts.map((account) => [account.connectionId, account]));
		const missing = input.connectionIds.find((id) => !byId.has(id));
		if (missing) {
			throw new AgenticChatEmailReadErrorV1(
				'connection_not_found',
				'Gmail account was not found',
				missing
			);
		}
		accounts = [...new Set(input.connectionIds)].map((id) => byId.get(id)!);
	}

	// The project brief loads while Gmail lists and reads.
	const briefPromise: Promise<EmailScanProjectBrief | null> = input.projectId
		? deps.loadProjectBrief(input.projectId, input.signal).catch(() => null)
		: Promise.resolve(null);
	// The scope must be known before the ledger lookup inside the scan, so the
	// project scope keys on the trusted project id rather than the loaded brief.
	const plannedScope: AgenticChatEmailScanScopeV1 = input.lookingFor
		? 'request'
		: input.projectId
			? 'project'
			: 'attention';
	const scopeKey = emailScanScopeKey({
		scope: plannedScope,
		projectId: input.projectId,
		lookingFor: input.lookingFor
	});

	const afterEpochSeconds = Math.floor(input.afterMs / 1000);
	const beforeEpochSeconds = Math.ceil(input.beforeMs / 1000);
	const priorByAccount = new Map<string, Map<string, EmailScanLedgerEntry>>();
	const scans = await Promise.all(
		accounts.map(async (account): Promise<GmailInboxWindowScan> => {
			if (account.status !== 'active' || !account.readEnabled) {
				return {
					account: {
						connectionId: account.connectionId,
						accountLabel: account.accountLabel,
						emailAddress: account.emailAddress,
						status:
							account.status === 'reconnect_required'
								? 'reconnect_required'
								: 'unavailable'
					},
					listedMessageIds: [],
					truncated: false,
					messages: [],
					failedMessageCount: 0
				};
			}
			return deps.gateway.scanInboxWindow({
				userId,
				connectionId: account.connectionId,
				afterEpochSeconds,
				beforeEpochSeconds,
				maxResults: input.maxPerAccount,
				skipFetch: async (messageIds) => {
					const prior = deps.ledger
						? await deps.ledger.load({
								userId,
								connectionId: account.connectionId,
								scopeKey,
								messageIds
							})
						: new Map<string, EmailScanLedgerEntry>();
					priorByAccount.set(account.connectionId, prior);
					// Re-read earlier relevant mail so it can be shown again; skip the rest.
					return new Set(
						[...prior.entries()]
							.filter(([, entry]) => !entry.relevant)
							.map(([messageId]) => messageId)
					);
				}
			});
		})
	);

	const scanned: ScannedMessage[] = [];
	for (const scan of scans) {
		const prior = priorByAccount.get(scan.account.connectionId) ?? new Map();
		for (const message of scan.messages) {
			scanned.push({
				message,
				prior: prior.get(message.messageId) ?? null,
				ref: `e${scanned.length}`
			});
		}
	}
	const fresh = scanned.filter((entry) => entry.prior === null);

	const brief = await briefPromise;
	// A project scope whose brief failed to load still keys on the project, but
	// Jev then judges against "needs attention" rather than an empty project.
	const focus: EmailRelevanceFocus =
		plannedScope === 'project' && !brief
			? { scope: 'attention' }
			: focusFor(input.lookingFor, brief);
	// Scores judged against a fallback target must not be filed under the
	// project's scope, or a later scan would trust them as project scores.
	const ledgerWritable = deps.ledger !== null && focus.scope === plannedScope;

	const scoring =
		fresh.length === 0
			? ({ ok: true, scores: new Map<string, number>(), costUsd: 0 } as const)
			: deps.decider
				? await scoreEmailRelevance({
						decider: deps.decider,
						focus,
						items: fresh.map(
							(entry): EmailRelevanceItem => ({
								ref: entry.ref,
								inbox: entry.message.emailAddress,
								from: entry.message.from,
								to: entry.message.to,
								subject: entry.message.subject,
								date: entry.message.internalDate,
								labelIds: entry.message.labelIds,
								snippet: entry.message.snippet
							})
						),
						...(input.signal ? { signal: input.signal } : {}),
						...(deps.usage ? { usage: deps.usage } : {})
					})
				: ({ ok: false, error: 'jev_unconfigured' } as const);

	let relevant: AgenticChatEmailScanMessageV1[];
	let relevantOmitted = 0;
	const notRelevant: ScannedMessage[] = [];
	const newlyCheckedByAccount = new Map<string, number>();
	if (scoring.ok) {
		const scoreOf = (entry: ScannedMessage): number =>
			entry.prior ? entry.prior.relevance : (scoring.scores.get(entry.ref) ?? 0);
		const topScore = scanned.reduce((top, entry) => Math.max(top, scoreOf(entry)), 0);
		const kept: ScannedMessage[] = [];
		const ledgerRows = new Map<string, Array<{ messageId: string } & EmailScanLedgerEntry>>();
		for (const entry of scanned) {
			if (entry.prior) {
				if (entry.prior.relevant) kept.push(entry);
				continue;
			}
			const score = scoreOf(entry);
			const isRelevant = isRelevantEmailScore(score, topScore);
			if (isRelevant) kept.push(entry);
			else notRelevant.push(entry);
			const accountId = entry.message.connectionId;
			newlyCheckedByAccount.set(accountId, (newlyCheckedByAccount.get(accountId) ?? 0) + 1);
			const rows = ledgerRows.get(accountId) ?? [];
			rows.push({
				messageId: entry.message.messageId,
				relevance: score,
				relevant: isRelevant
			});
			ledgerRows.set(accountId, rows);
		}
		if (deps.ledger && ledgerWritable) {
			// Off the response path: a lost write only means one extra scoring pass later.
			for (const [connectionId, rows] of ledgerRows) {
				void deps.ledger
					.record({ userId, connectionId, scopeKey, rows })
					.catch((error: unknown) => deps.onLedgerWriteError?.(error));
			}
		}
		kept.sort(
			(left, right) =>
				scoreOf(right) - scoreOf(left) ||
				right.message.internalDate.localeCompare(left.message.internalDate)
		);
		relevant = kept
			.slice(0, MAX_RELEVANT_RETURNED)
			.map((entry) => toResultMessage(entry, scoreOf(entry)));
		relevantOmitted = Math.max(0, kept.length - MAX_RELEVANT_RETURNED);
	} else {
		const newest = [...scanned].sort((left, right) =>
			right.message.internalDate.localeCompare(left.message.internalDate)
		);
		relevant = newest
			.slice(0, MAX_UNSCORED_RETURNED)
			.map((entry) => toResultMessage(entry, entry.prior ? entry.prior.relevance : null));
		relevantOmitted = Math.max(0, newest.length - MAX_UNSCORED_RETURNED);
	}

	// Body openings for the top matches let the acting model triage without a
	// get_email_message round trip. Best effort, bounded by a short deadline.
	if (scoring.ok && relevant.length > 0) {
		await Promise.all(
			relevant.slice(0, BODY_EXCERPT_COUNT).map(async (message) => {
				const detail = await withDeadline(
					deps.gateway
						.getMessage({
							userId,
							connectionId: message.connectionId,
							messageId: message.messageId
						})
						.catch(() => null),
					BODY_EXCERPT_DEADLINE_MS
				);
				if (!detail?.bodyText) return;
				message.bodyExcerpt = detail.bodyText.slice(0, BODY_EXCERPT_CHARS);
				message.bodyTruncated =
					detail.bodyTruncated || detail.bodyText.length > BODY_EXCERPT_CHARS;
			})
		);
	}

	const senderCounts = new Map<string, number>();
	for (const entry of notRelevant) {
		const name = senderName(entry.message.from);
		senderCounts.set(name, (senderCounts.get(name) ?? 0) + 1);
	}
	const otherSenders = [...senderCounts.entries()]
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
		.slice(0, MAX_OTHER_SENDERS)
		.map(([from, count]) => ({ from, count }));

	const accountResults: AgenticChatEmailScanAccountV1[] = scans.map((scan) => {
		const prior = priorByAccount.get(scan.account.connectionId);
		return {
			connectionId: scan.account.connectionId,
			accountLabel: scan.account.accountLabel,
			emailAddress: scan.account.emailAddress,
			status: scan.account.status,
			inWindow: scan.listedMessageIds.length,
			newlyChecked: scoring.ok
				? (newlyCheckedByAccount.get(scan.account.connectionId) ?? 0)
				: 0,
			previouslyChecked: prior?.size ?? 0,
			truncated: scan.truncated
		};
	});

	return {
		accounts: accountResults,
		scope: focus.scope,
		scopeLabel: describeEmailRelevanceTarget(focus),
		filter: scoring.ok ? 'scored' : 'unscored',
		relevant,
		relevantOmitted,
		otherSenders,
		fetchedAt: now().toISOString()
	};
}

/**
 * The project context Jev judges "relevant to this project" against: name,
 * description, the START HERE opening, and recently updated task and document
 * titles. The project id comes from the turn's admitted context, whose access
 * was checked at admission, so the service client reads it directly.
 */
export async function loadEmailScanProjectBrief(
	client: ContextFinderReadClient,
	projectId: string,
	signal: AbortSignal = new AbortController().signal
): Promise<EmailScanProjectBrief | null> {
	const [project, startHere, tasks, documents] = await Promise.all([
		client
			.from('onto_projects')
			.select('name,description')
			.eq('id', projectId)
			.is('deleted_at', null)
			.abortSignal(signal)
			.maybeSingle(),
		client
			.from('onto_documents')
			.select('content')
			.eq('project_id', projectId)
			.eq('type_key', START_HERE_TYPE_KEY)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(1)
			.abortSignal(signal),
		client
			.from('onto_tasks')
			.select('title')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(18)
			.abortSignal(signal),
		client
			.from('onto_documents')
			.select('title')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(12)
			.abortSignal(signal)
	]);
	const row = project.data as { name?: unknown; description?: unknown } | null;
	if (project.error || !row || typeof row.name !== 'string') return null;
	const titles = (result: { data: unknown; error: unknown }): string[] =>
		!result.error && Array.isArray(result.data)
			? (result.data as Array<{ title?: unknown }>)
					.map((entry) => (typeof entry.title === 'string' ? entry.title.trim() : ''))
					.filter(Boolean)
			: [];
	const startHereRows =
		!startHere.error && Array.isArray(startHere.data)
			? (startHere.data as Array<{ content?: unknown }>)
			: [];
	const content = typeof startHereRows[0]?.content === 'string' ? startHereRows[0].content : null;
	return {
		name: row.name,
		description: typeof row.description === 'string' ? row.description : null,
		currentState: content ? content.slice(0, 1_500) : null,
		recentWork: [...titles(tasks), ...titles(documents)]
	};
}
