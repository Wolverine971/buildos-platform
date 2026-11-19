// packages/shared-agent-ops/src/knowledge/spend.ts
//
// Knowledge spend per person per UTC day, against the caps (DJ, 2026-11-18): users never see
// a cap; the admin sees each person's spend against them (/admin/chat, LLM usage) and gets an
// in-app alert when a threshold is reached (worker sweep: knowledgeSpendAlerts.ts).
//
//   wrap-up   the chat wrap-up's own model calls (gate, extraction); a silent
//             per-person daily cap: past it, the wrap-up skips knowledge for the rest of the day
//   research  "Find more" runs (search + model), already capped per person per day by
//             startKnowledgeEnrichment (DAILY_ENRICH_BUDGET_USD / _ADMIN_USD)
import { DAILY_ENRICH_BUDGET_ADMIN_USD, DAILY_ENRICH_BUDGET_USD } from './enrichment';
import type { KnowledgeDataClient } from './types';

/** Per person per day. Wrap-up averages well under a cent a chat (measured 2026-11-18). */
export const CHAT_WRAP_UP_DAILY_CAP_USD = 0.1;
/** All knowledge spend across everyone in one day that warrants a look. */
export const KNOWLEDGE_DAILY_TOTAL_ALERT_USD = 5;

/**
 * llm_usage_logs.operation_type values only the chat wrap-up's knowledge part records. Its
 * identity and circle checks share operation types with research and the sorter, so they are
 * left out: research spend must never stop someone's wrap-up (they are a small share).
 */
export const CHAT_WRAP_UP_OPERATIONS = [
	'chat_checkpoint_knowledge',
	'chat_checkpoint_knowledge_gate'
] as const;

export interface KnowledgeSpendRow {
	userId: string;
	wrapUpUsd: number;
	wrapUpCapUsd: number;
	researchUsd: number;
	researchCapUsd: number;
}

export interface KnowledgeSpendDay {
	/** UTC midnight that starts the day. */
	since: string;
	totalUsd: number;
	totalAlertUsd: number;
	users: KnowledgeSpendRow[];
}

export function utcDayStart(now: Date): string {
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	).toISOString();
}

const PAGE = 1000;

async function readAll<T>(build: (from: number) => PromiseLike<{ data: unknown; error: unknown }>) {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build(from);
		if (error) throw new Error((error as { message?: string }).message ?? String(error));
		const page = (data ?? []) as T[];
		rows.push(...page);
		if (page.length < PAGE) return rows;
	}
}

/** Today's chat wrap-up model spend for one person (the capture checks this before running). */
export async function chatWrapUpSpendToday(
	db: KnowledgeDataClient,
	userId: string,
	now = new Date()
): Promise<number> {
	const rows = await readAll<{ total_cost_usd: number | string | null }>((from) =>
		db
			.from('llm_usage_logs')
			.select('total_cost_usd')
			.eq('user_id', userId)
			.in('operation_type', [...CHAT_WRAP_UP_OPERATIONS])
			.gte('created_at', utcDayStart(now))
			.order('id')
			.range(from, from + PAGE - 1)
	);
	return rows.reduce((sum, row) => sum + Number(row.total_cost_usd ?? 0), 0);
}

/** Everyone's knowledge spend today against their caps, highest first. */
export async function knowledgeSpendToday(
	db: KnowledgeDataClient,
	now = new Date()
): Promise<KnowledgeSpendDay> {
	const since = utcDayStart(now);
	const [usage, runs] = await Promise.all([
		readAll<{ user_id: string; total_cost_usd: number | string | null }>((from) =>
			db
				.from('llm_usage_logs')
				.select('user_id, total_cost_usd')
				.in('operation_type', [...CHAT_WRAP_UP_OPERATIONS])
				.gte('created_at', since)
				.order('id')
				.range(from, from + PAGE - 1)
		),
		readAll<{ owner_user_id: string; cost_usd: number | string | null }>((from) =>
			db
				.from('knowledge_runs')
				.select('owner_user_id, cost_usd')
				.eq('run_type', 'enrichment')
				.gte('created_at', since)
				.order('id')
				.range(from, from + PAGE - 1)
		)
	]);
	const byUser = new Map<string, { wrapUp: number; research: number }>();
	const entry = (userId: string) => {
		let row = byUser.get(userId);
		if (!row) byUser.set(userId, (row = { wrapUp: 0, research: 0 }));
		return row;
	};
	for (const row of usage)
		if (row.user_id) entry(row.user_id).wrapUp += Number(row.total_cost_usd ?? 0);
	for (const row of runs)
		if (row.owner_user_id) entry(row.owner_user_id).research += Number(row.cost_usd ?? 0);

	const ids = [...byUser.keys()];
	const admins = new Set<string>();
	if (ids.length) {
		const { data, error } = await db.from('users').select('id, is_admin').in('id', ids);
		if (error) throw new Error((error as { message?: string }).message ?? String(error));
		for (const row of (data ?? []) as Array<{ id: string; is_admin: boolean | null }>)
			if (row.is_admin) admins.add(row.id);
	}
	const users = ids
		.map((userId) => {
			const spend = byUser.get(userId)!;
			return {
				userId,
				wrapUpUsd: round(spend.wrapUp),
				wrapUpCapUsd: CHAT_WRAP_UP_DAILY_CAP_USD,
				researchUsd: round(spend.research),
				researchCapUsd: admins.has(userId)
					? DAILY_ENRICH_BUDGET_ADMIN_USD
					: DAILY_ENRICH_BUDGET_USD
			};
		})
		.sort((a, b) => b.wrapUpUsd + b.researchUsd - (a.wrapUpUsd + a.researchUsd));
	return {
		since,
		totalUsd: round(users.reduce((sum, u) => sum + u.wrapUpUsd + u.researchUsd, 0)),
		totalAlertUsd: KNOWLEDGE_DAILY_TOTAL_ALERT_USD,
		users
	};
}

export type KnowledgeSpendAlert = {
	/** Stable per day: one alert per key per day. */
	key: string;
	title: string;
	message: string;
};

/** The thresholds a day's spend has reached. */
export function knowledgeSpendAlerts(
	day: KnowledgeSpendDay,
	nameOf: (userId: string) => string
): KnowledgeSpendAlert[] {
	const date = day.since.slice(0, 10);
	const usd = (value: number) => `$${value.toFixed(2)}`;
	const alerts: KnowledgeSpendAlert[] = [];
	for (const user of day.users) {
		if (user.wrapUpUsd >= user.wrapUpCapUsd)
			alerts.push({
				key: `knowledge_spend:${date}:wrap_up:${user.userId}`,
				title: `Chat wrap-up cap reached: ${nameOf(user.userId)}`,
				message: `${nameOf(user.userId)} used ${usd(user.wrapUpUsd)} of chat wrap-up today (cap ${usd(user.wrapUpCapUsd)}). Wrap-up stops adding knowledge for them until tomorrow (UTC); they see nothing.`
			});
		if (user.researchUsd >= user.researchCapUsd)
			alerts.push({
				key: `knowledge_spend:${date}:research:${user.userId}`,
				title: `Research budget reached: ${nameOf(user.userId)}`,
				message: `${nameOf(user.userId)} used ${usd(user.researchUsd)} of "Find more" research today (cap ${usd(user.researchCapUsd)}).`
			});
	}
	if (day.totalUsd >= day.totalAlertUsd)
		alerts.push({
			key: `knowledge_spend:${date}:total`,
			title: `Knowledge spend today: ${usd(day.totalUsd)}`,
			message: `Knowledge spend across everyone passed ${usd(day.totalAlertUsd)} today (${day.users.length} people).`
		});
	return alerts;
}

function round(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}
