// apps/worker/src/workers/freshness-radar/freshnessPolicy.ts
//
// Jev freshness radar (Tasker 88) policy constants and environment parsing.
// Every threshold the scanner uses lives in FRESHNESS_POLICY_V1 and is
// snapshotted onto each freshness_scans row, so a ledger row can always be
// re-judged against the exact policy that produced it. Named to avoid any
// confusion with the locked agentic-chat/config.ts.
// Plan: docs/architecture/jev-freshness-radar-v1-plan.md sections 1, 4, 6, 7.

import { FRESHNESS_POLICY_VERSION } from '@buildos/shared-types';

// The identifier keeps its v1 name to avoid churn; `version` carries the live
// policy version (v2 added targeting, dig, decisions and rollup, tasker 106).
export const FRESHNESS_POLICY_V1 = Object.freeze({
	version: FRESHNESS_POLICY_VERSION,
	/** Informational: the SQL trigger owns the debounce (60s quiet, 10m cap). */
	debounce: Object.freeze({ quietMs: 60_000, maxMs: 600_000 }),
	maxProjectsPerSignal: 3,
	window: Object.freeze({
		firstScanLookbackHours: 72,
		maxLookbackDays: 7,
		maxSessions: 3,
		maxMessages: 12,
		maxChars: 12_000,
		maxMessageChars: 3_000,
		minMessageChars: 12
	}),
	prefilter: Object.freeze({
		maxEntities: 24,
		minEntities: 6,
		titleWeight: 2,
		descriptionWeight: 0.5,
		dateMentionBonus: 1.5,
		dueSoonBonus: 1,
		dueSoonDays: 30,
		edgeBonus: 1,
		goalMilestoneBonus: 0.5,
		detailsChars: 280,
		docSummaryChars: 400
	}),
	jev: Object.freeze({
		maxRequestBytes: 96_000,
		maxDateMentions: 12,
		maxTrackSubjects: 10,
		maxInboxItems: 10,
		timeoutMs: 5_000,
		titleChars: 80,
		dateSentenceChars: 200
	}),
	combine: Object.freeze({
		statusNewsMin: 0.15,
		staleMin: 0.6,
		draftKindMin: 0.6,
		draftDateMin: 0.6,
		noChangeDisagreeMin: 0.5,
		cardMaxItems: 3,
		cardWeights: Object.freeze({ goal: 1.2, milestone: 1.2, task: 1.0, document: 0.9 })
	}),
	autoApply: Object.freeze({
		staleMin: 0.9,
		kindMin: 0.9,
		dateMin: 0.9,
		maxPerScan: 3,
		maxPerProjectPer24h: 6,
		undoCooldownDays: 30,
		dateHorizonDays: 365,
		negationWindowTokens: 3
	}),
	gauge: Object.freeze({
		evidenceMin: 0.5,
		confidenceMin: 0.35,
		offTrackBelow: 0.75,
		atRiskBelow: 1.5,
		doneHintAtOrAbove: 2.5
	}),
	/**
	 * Recorded START HERE decisions count as news (tasker 106): a record last
	 * changed before a decision may now contradict it.
	 */
	decisions: Object.freeze({ max: 20, textChars: 280 }),
	/**
	 * Jev targeting (hop 1) replaces the word-overlap prefilter: one yes/no per
	 * open record, "would keeping this current need a revision because of what
	 * changed?". The lexical rank only orders the pool when it is over budget,
	 * and is the fallback when Jev fails. Probe 2026-09-24 on the book: stale
	 * records 0.78/0.90, everything else <=0.26.
	 */
	targeting: Object.freeze({
		maxPool: 80,
		maxPoolDocuments: 20,
		maxHeadingsPerDocument: 30,
		headingChars: 80,
		floor: 0.35,
		relativeToTop: 0.5,
		maxSelected: 24,
		timeoutMs: 6_000
	}),
	/**
	 * Section dig (hop 2): each targeted document's own sections are judged
	 * against the news, so a doc is flagged by what it says, not its summary.
	 * Probe 2026-09-24: stale sections 0.70-0.88, current sections <=0.27.
	 */
	dig: Object.freeze({
		maxDocuments: 4,
		maxSectionsPerDocument: 24,
		sectionChars: 1_500,
		bodyChars: 60_000,
		sectionFloor: 0.35,
		maxConcernSections: 3
	}),
	/**
	 * Roll-up (tasker 106). score = max(decayed peak, 1 - prod(1 - discount * p_i * decay_i))
	 * over independent observations (distinct evidence keys) at or above `floor`.
	 * Calibrated against the book ledger: the blueprint task (0.50, 0.42, 0.50,
	 * 0.41 over two days) crosses `bar` on its 4th observation; a one-off 0.5
	 * never does; a single observation at `bar` surfaces at once, as in v1.
	 */
	rollup: Object.freeze({
		floor: 0.35,
		bar: 0.6,
		discount: 0.5,
		halfLifeDays: 7,
		expireDays: 14,
		maxEvidence: 12,
		inboxMaxItems: 5
	}),
	inbox: Object.freeze({ retireMin: 0.9, markMin: 0.6, maxRetiredPerScan: 3 }),
	bundle: Object.freeze({ maxOperations: 5, ttlHours: 72, carryForwardDays: 7 }),
	undo: Object.freeze({ windowHours: 72 }),
	suppression: Object.freeze({ notStaleDays: 14 }),
	outcomes: Object.freeze({ horizonDays: 7, autoKeptHours: 72 }),
	evidence: Object.freeze({ excerptChars: 160 })
});

export type FreshnessPolicyV1 = typeof FRESHNESS_POLICY_V1;

export type FreshnessRadarMode = 'off' | 'shadow' | 'live';

/** `FRESHNESS_RADAR_MODE=off|shadow|live`; anything else (or unset) is `off`. */
export function readFreshnessRadarMode(
	env: Record<string, string | undefined> = process.env
): FreshnessRadarMode {
	const raw = env.FRESHNESS_RADAR_MODE?.trim().toLowerCase();
	return raw === 'shadow' || raw === 'live' ? raw : 'off';
}

export const FRESHNESS_RADAR_DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';

/** `FRESHNESS_RADAR_JEV_MODEL` pins the decision model; default `typesafe/jev-1.13`. */
export function readFreshnessRadarJevModel(
	env: Record<string, string | undefined> = process.env
): string {
	const raw = env.FRESHNESS_RADAR_JEV_MODEL?.trim();
	return raw && /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(raw)
		? raw
		: FRESHNESS_RADAR_DEFAULT_JEV_MODEL;
}

export type FreshnessRadarUserFlags = {
	surfaces: boolean;
	autoApply: boolean;
	inboxCleanup: boolean;
};

/**
 * The scan's effective mode. `live` needs the environment switch AND the
 * user's `freshness_radar.surfaces` flag; otherwise the scan is ledger-only
 * (`shadow`). `off` never scans.
 */
export function effectiveScanMode(
	envMode: FreshnessRadarMode,
	flags: FreshnessRadarUserFlags
): FreshnessRadarMode {
	if (envMode === 'off') return 'off';
	if (envMode === 'live' && flags.surfaces) return 'live';
	return 'shadow';
}
