// apps/web/src/lib/services/admin/research-costs/research-costs.ts
//
// The arithmetic behind /admin/research-costs: what one "Find more" lookup costs, where the
// money goes (web searches against model calls), how people compare with companies, and what
// a month would cost at the current pace. Plain functions with no database or framework
// imports, so the page and the tests share one copy.
//
// A "lookup" is one entry researched in one run (a `knowledge_run_targets` row). Its cost is
// what the worker charged it; the search/model split exists only for lookups run after the
// worker started recording it (`knowledge_runs.stats.costs`, 2026-11-23).

export const RESEARCH_COST_DAY_CHOICES = [7, 30, 90] as const;
export const RESEARCH_COST_DEFAULT_DAYS = 30;
/** The most one lookup may spend (DEFAULT_ENRICH_BUDGET_PER_TARGET_USD in shared-agent-ops). */
export const RESEARCH_LOOKUP_CAP_USD = 0.03;
/** How many of the newest lookups set the "what a lookup costs now" figure. */
export const RECENT_LOOKUPS = 20;
/** Monthly volumes the projection table prices. */
export const PROJECTION_VOLUMES = [100, 1_000, 10_000] as const;

const DAY_MS = 86_400_000;

/** Where a lookup's money went, as the worker recorded it. */
export type ResearchCostSplit = {
	searchUsd: number;
	modelUsd: number;
	searches: number;
	rounds: number;
	/** The type the entry was researched as (it can differ from how it was filed). */
	kind: string | null;
};

/** One entry researched in one run. */
export type ResearchLookupRow = {
	id: string;
	userId: string | null;
	entityName: string | null;
	entityKind: string | null;
	status: string;
	costUsd: number;
	factsAdded: number;
	/** When it finished, or when it was asked for if it never did. */
	at: string;
	/** 'ui' (the Find more button), 'chat' or 'mcp' (a connected app). */
	trigger: string | null;
	split: ResearchCostSplit | null;
};

export type ResearchCostGroupKey = 'person' | 'org' | 'other';

export type ResearchCostGroup = {
	key: ResearchCostGroupKey;
	label: string;
	lookups: number;
	totalUsd: number;
	typicalUsd: number;
	averageUsd: number;
	worstUsd: number;
	details: number;
	/** Money spent per detail saved; null when nothing was saved. */
	usdPerDetail: number | null;
	foundNothing: number;
};

export type ResearchCostDay = {
	/** UTC day, YYYY-MM-DD. */
	date: string;
	lookups: number;
	usd: number;
};

export type ResearchCostSummary = {
	days: number;
	lookups: number;
	totalUsd: number;
	/** Median: what one lookup usually costs. */
	typicalUsd: number;
	averageUsd: number;
	worstUsd: number;
	capUsd: number;
	/** Lookups that used more than half of what one lookup may spend. */
	nearCap: number;
	details: number;
	foundNothing: { lookups: number; usd: number };
	/** Average of the newest lookups: the research flow changes, old lookups cost less. */
	recent: { lookups: number; averageUsd: number };
	groups: ResearchCostGroup[];
	split: {
		/** Lookups that recorded where the money went. */
		lookups: number;
		searchUsd: number;
		modelUsd: number;
		searchShare: number;
		searchesPerLookup: number;
		roundsPerLookup: number;
	} | null;
	daily: ResearchCostDay[];
	pace: {
		/** Days the pace is measured over (the window, at most 30). */
		overDays: number;
		lookupsPerMonth: number;
		usdPerMonth: number;
	};
	projection: Array<{ lookupsPerMonth: number; expectedUsd: number; worstCaseUsd: number }>;
	byTrigger: Array<{ trigger: string; label: string; lookups: number; usd: number }>;
	byUser: Array<{ userId: string; lookups: number; usd: number }>;
	costliest: ResearchLookupRow[];
};

export function researchCostDaysFromParam(value: string | null): number {
	const days = Number(value);
	return (RESEARCH_COST_DAY_CHOICES as readonly number[]).includes(days)
		? days
		: RESEARCH_COST_DEFAULT_DAYS;
}

/** The type a lookup is counted under: what it was researched as, else how it is filed. */
export function researchCostGroupOf(row: ResearchLookupRow): ResearchCostGroupKey {
	const kind = row.split?.kind ?? row.entityKind;
	return kind === 'person' ? 'person' : kind === 'org' ? 'org' : 'other';
}

const GROUP_LABELS: Record<ResearchCostGroupKey, string> = {
	person: 'People',
	org: 'Companies',
	other: 'Everything else'
};

const TRIGGER_LABELS: Record<string, string> = {
	ui: 'Find more button',
	chat: 'Chat',
	mcp: 'Connected app',
	unknown: 'Not recorded'
};

function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** Queued, running and never-started entries are not lookups yet: they have no final cost. */
function isFinished(row: ResearchLookupRow): boolean {
	return row.status === 'done' || row.status === 'failed' || row.costUsd > 0;
}

function utcDay(iso: string): string {
	return new Date(iso).toISOString().slice(0, 10);
}

export function summarizeResearchCosts(
	rows: ResearchLookupRow[],
	options: { days: number; now: Date }
): ResearchCostSummary {
	const { days, now } = options;
	// The window is whole UTC days, today included, so the totals and the day bars agree.
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const since = today - (days - 1) * DAY_MS;
	const lookups = rows
		.filter((row) => isFinished(row) && new Date(row.at).getTime() >= since)
		.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
	const costs = lookups.map((row) => row.costUsd);
	const totalUsd = sum(costs);

	const groups = (['person', 'org', 'other'] as const)
		.map((key): ResearchCostGroup => {
			const members = lookups.filter((row) => researchCostGroupOf(row) === key);
			const memberCosts = members.map((row) => row.costUsd);
			const details = sum(members.map((row) => row.factsAdded));
			return {
				key,
				label: GROUP_LABELS[key],
				lookups: members.length,
				totalUsd: sum(memberCosts),
				typicalUsd: median(memberCosts),
				averageUsd: members.length ? sum(memberCosts) / members.length : 0,
				worstUsd: Math.max(0, ...memberCosts),
				details,
				usdPerDetail: details ? sum(memberCosts) / details : null,
				foundNothing: members.filter((row) => row.factsAdded === 0).length
			};
		})
		.filter((group) => group.lookups > 0);

	const withSplit = lookups.filter((row) => row.split);
	const searchUsd = sum(withSplit.map((row) => row.split!.searchUsd));
	const modelUsd = sum(withSplit.map((row) => row.split!.modelUsd));
	const split = withSplit.length
		? {
				lookups: withSplit.length,
				searchUsd,
				modelUsd,
				searchShare: searchUsd + modelUsd > 0 ? searchUsd / (searchUsd + modelUsd) : 0,
				searchesPerLookup:
					sum(withSplit.map((row) => row.split!.searches)) / withSplit.length,
				roundsPerLookup: sum(withSplit.map((row) => row.split!.rounds)) / withSplit.length
			}
		: null;

	// One bar per UTC day of the window, oldest first, days without research included.
	const byDay = new Map<string, ResearchCostDay>();
	for (let i = days - 1; i >= 0; i--) {
		const date = utcDay(new Date(now.getTime() - i * DAY_MS).toISOString());
		byDay.set(date, { date, lookups: 0, usd: 0 });
	}
	for (const row of lookups) {
		const day = byDay.get(utcDay(row.at));
		if (!day) continue;
		day.lookups++;
		day.usd += row.costUsd;
	}

	const recentRows = lookups.slice(0, RECENT_LOOKUPS);
	const recentAverage = recentRows.length
		? sum(recentRows.map((row) => row.costUsd)) / recentRows.length
		: 0;

	// Pace: the last 30 days at most, so one busy week long ago does not set the month.
	const overDays = Math.min(days, 30);
	const paceSince = today - (overDays - 1) * DAY_MS;
	const paceLookups = lookups.filter((row) => new Date(row.at).getTime() >= paceSince).length;
	const lookupsPerMonth = (paceLookups / overDays) * 30;

	const triggers = new Map<string, { lookups: number; usd: number }>();
	const users = new Map<string, { lookups: number; usd: number }>();
	for (const row of lookups) {
		const trigger = row.trigger && TRIGGER_LABELS[row.trigger] ? row.trigger : 'unknown';
		const t = triggers.get(trigger) ?? { lookups: 0, usd: 0 };
		t.lookups++;
		t.usd += row.costUsd;
		triggers.set(trigger, t);
		if (row.userId) {
			const u = users.get(row.userId) ?? { lookups: 0, usd: 0 };
			u.lookups++;
			u.usd += row.costUsd;
			users.set(row.userId, u);
		}
	}

	const nothing = lookups.filter((row) => row.factsAdded === 0);
	return {
		days,
		lookups: lookups.length,
		totalUsd,
		typicalUsd: median(costs),
		averageUsd: lookups.length ? totalUsd / lookups.length : 0,
		worstUsd: Math.max(0, ...costs),
		capUsd: RESEARCH_LOOKUP_CAP_USD,
		nearCap: lookups.filter((row) => row.costUsd > RESEARCH_LOOKUP_CAP_USD / 2).length,
		details: sum(lookups.map((row) => row.factsAdded)),
		foundNothing: { lookups: nothing.length, usd: sum(nothing.map((row) => row.costUsd)) },
		recent: { lookups: recentRows.length, averageUsd: recentAverage },
		groups,
		split,
		daily: [...byDay.values()],
		pace: { overDays, lookupsPerMonth, usdPerMonth: lookupsPerMonth * recentAverage },
		projection: PROJECTION_VOLUMES.map((volume) => ({
			lookupsPerMonth: volume,
			expectedUsd: volume * recentAverage,
			worstCaseUsd: volume * RESEARCH_LOOKUP_CAP_USD
		})),
		byTrigger: [...triggers.entries()]
			.map(([trigger, value]) => ({ trigger, label: TRIGGER_LABELS[trigger]!, ...value }))
			.sort((a, b) => b.usd - a.usd),
		byUser: [...users.entries()]
			.map(([userId, value]) => ({ userId, ...value }))
			.sort((a, b) => b.usd - a.usd),
		costliest: [...lookups].sort((a, b) => b.costUsd - a.costUsd).slice(0, 10)
	};
}

/**
 * Research money is fractions of a cent: up to four decimals under a cent ("$0.0023"), up to three
 * under a dollar, two above.
 */
export function formatResearchUsd(usd: number): string {
	if (!Number.isFinite(usd) || usd === 0) return '$0';
	const abs = Math.abs(usd);
	if (abs >= 1) return `$${usd.toFixed(2)}`;
	// Zeros past the cent say nothing: $0.0070 reads as $0.007, $0.030 as $0.03.
	const fixed = usd.toFixed(abs < 0.01 ? 4 : 3);
	const [whole, decimals = ''] = fixed.split('.');
	let end = decimals.length;
	while (end > 2 && decimals[end - 1] === '0') end--;
	return `$${whole}.${decimals.slice(0, end)}`;
}

/** The page's one-sentence answer. */
export function researchCostAnswer(summary: ResearchCostSummary): {
	headline: string;
	detail: string;
} {
	if (!summary.lookups) {
		return {
			headline: `No research in the last ${summary.days} days.`,
			detail: 'Nothing was looked up with Find more, so nothing was spent.'
		};
	}
	const count = summary.lookups === 1 ? '1 lookup' : `${summary.lookups} lookups`;
	return {
		headline: `A lookup costs about ${formatResearchUsd(summary.recent.averageUsd)} right now.`,
		detail:
			`${count} in the last ${summary.days} days cost ${formatResearchUsd(summary.totalUsd)} in total. ` +
			`At this pace that is about ${Math.round(summary.pace.lookupsPerMonth)} lookups and ` +
			`${formatResearchUsd(summary.pace.usdPerMonth)} a month.`
	};
}
