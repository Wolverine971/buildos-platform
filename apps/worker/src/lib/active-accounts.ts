// apps/worker/src/lib/active-accounts.ts
//
// Who counts as an "active account" for catch-up reads (tasker 162 tasks, tasker 165 documents):
// a user who, in the last 30 days, opened BuildOS signed in (users.last_visit, written at most
// every 6 h by the web app), signed in (auth last_sign_in_at, covers the phone app), sent a chat
// message (chat_sessions.last_message_at), or created a project, task or document. Accounts
// pending deletion or restricted never count.
//
// Record updated_at is deliberately not a signal: background jobs (document outlines and
// digests, project next steps) rewrite rows of people who have not been back in months.

import type { TypedSupabaseClient } from '@buildos/supabase-client';

/** The account tables can be read even when the client has no Auth admin API. */
export interface ActiveAccountsClient extends Pick<TypedSupabaseClient, 'from'> {
	auth?: { admin?: Pick<TypedSupabaseClient['auth']['admin'], 'listUsers'> };
}

export const ACTIVE_ACCOUNT_DAYS = 30;

export type ActiveAccountSignal = 'visit' | 'sign_in' | 'chat' | 'project' | 'task' | 'document';

export interface ActiveAccount {
	userId: string;
	signals: ActiveAccountSignal[];
	/** The most recent signal. */
	lastActiveAt: string;
}

export interface AccountRow {
	id: string;
	last_visit: string | null;
	deletion_status: string | null;
	access_restricted: boolean | null;
}

export interface ActivitySignal {
	userId: string;
	signal: ActiveAccountSignal;
	at: string;
}

const PAGE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "3mo", "90d", "2w" (counted back from now) or an ISO date. Months are calendar months.
 * Throws on anything else so a typo never widens a paid run.
 */
export function parseSince(value: string, now: Date = new Date()): Date {
	const relative = /^(\d{1,4})(mo|d|w)$/.exec(value.trim());
	if (relative) {
		const amount = Number(relative[1]);
		const unit = relative[2];
		if (unit === 'mo') {
			const date = new Date(now);
			date.setUTCMonth(date.getUTCMonth() - amount);
			return date;
		}
		return new Date(now.getTime() - amount * (unit === 'w' ? 7 : 1) * MS_PER_DAY);
	}
	const parsed = Date.parse(value);
	if (!value.trim() || Number.isNaN(parsed)) {
		throw new Error(`Not a date or a span like 3mo / 90d / 2w: ${value}`);
	}
	return new Date(parsed);
}

/** Pure: accounts with at least one signal at or after `since`, minus deleted/restricted ones. */
export function activeAccountsFromSignals(
	accounts: AccountRow[],
	signals: ActivitySignal[],
	since: Date
): Map<string, ActiveAccount> {
	const cutoff = since.toISOString();
	const eligible = new Map(
		accounts
			.filter((row) => !row.deletion_status && row.access_restricted !== true)
			.map((row) => [row.id, row])
	);
	const out = new Map<string, ActiveAccount>();
	const add = (userId: string, signal: ActiveAccountSignal, at: string | null) => {
		if (!at || at < cutoff || !eligible.has(userId)) return;
		const current = out.get(userId) ?? { userId, signals: [], lastActiveAt: at };
		if (!current.signals.includes(signal)) current.signals.push(signal);
		if (at > current.lastActiveAt) current.lastActiveAt = at;
		out.set(userId, current);
	};
	for (const row of accounts) add(row.id, 'visit', row.last_visit);
	for (const signal of signals) add(signal.userId, signal.signal, signal.at);
	return out;
}

async function readAll<T>(
	build: (
		from: number,
		to: number
	) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build(from, from + PAGE - 1);
		if (error) throw new Error(error.message);
		const page = data ?? [];
		rows.push(...page);
		if (page.length < PAGE) return rows;
	}
}

/** Reads production (service client) and returns the active accounts by user id. */
export async function findActiveAccounts(
	db: ActiveAccountsClient,
	options: { days?: number; now?: Date } = {}
): Promise<Map<string, ActiveAccount>> {
	const now = options.now ?? new Date();
	const since = new Date(now.getTime() - (options.days ?? ACTIVE_ACCOUNT_DAYS) * MS_PER_DAY);
	const cutoff = since.toISOString();

	const accounts = await readAll((from, to) =>
		db
			.from('users')
			.select('id, last_visit, deletion_status, access_restricted')
			.order('id')
			.range(from, to)
	);
	const signals: ActivitySignal[] = [];

	// Sign-ins (the phone app signs in without a web page visit). Best effort: skipped when the
	// client has no admin API.
	const admin = db.auth?.admin;
	if (admin) {
		for (let page = 1; page <= 100; page++) {
			const { data, error } = await admin.listUsers({ page, perPage: PAGE });
			if (error) throw new Error(`List sign-ins: ${error.message}`);
			const users = data?.users ?? [];
			for (const user of users) {
				if (user.last_sign_in_at)
					signals.push({ userId: user.id, signal: 'sign_in', at: user.last_sign_in_at });
			}
			if (users.length < PAGE) break;
		}
	}

	const chats = await readAll((from, to) =>
		db
			.from('chat_sessions')
			.select('user_id, last_message_at')
			.gte('last_message_at', cutoff)
			.order('id')
			.range(from, to)
	);
	for (const chat of chats) {
		if (chat.last_message_at)
			signals.push({ userId: chat.user_id, signal: 'chat', at: chat.last_message_at });
	}

	const created: Array<{ actor: string; signal: ActiveAccountSignal; at: string }> = [];
	for (const [table, signal] of [
		['onto_projects', 'project'],
		['onto_tasks', 'task'],
		['onto_documents', 'document']
	] as const) {
		const rows = await readAll((from, to) =>
			db
				.from(table)
				.select('created_by, created_at')
				.gte('created_at', cutoff)
				.order('id')
				.range(from, to)
		);
		for (const row of rows) created.push({ actor: row.created_by, signal, at: row.created_at });
	}
	const actorIds = [...new Set(created.map((row) => row.actor).filter(Boolean))];
	const userByActor = new Map<string, string>();
	for (let i = 0; i < actorIds.length; i += 150) {
		const { data, error } = await db
			.from('onto_actors')
			.select('id, user_id')
			.in('id', actorIds.slice(i, i + 150));
		if (error) throw new Error(error.message);
		for (const actor of data ?? []) {
			if (actor.user_id) userByActor.set(actor.id, actor.user_id);
		}
	}
	for (const row of created) {
		const userId = userByActor.get(row.actor);
		if (userId) signals.push({ userId, signal: row.signal, at: row.at });
	}

	return activeAccountsFromSignals(accounts, signals, since);
}
