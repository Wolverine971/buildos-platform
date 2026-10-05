// apps/worker/src/config/deepResearch.ts

/**
 * Deep Research kill switch (2026-10-04).
 *
 * A `deep_research` Agent Run fans out to two paid web researchers plus a
 * synthesis call ($0.25–$1 per run) and its July quality gate failed, so it is
 * parked (tasker/29-deep-research-production-track.md). The web dispatcher
 * refuses new deep-research runs unless PRIVATE_DEEP_RESEARCH_ENABLED=true; the
 * worker reads the same variable and refuses any deep-research job it is still
 * handed (stale clients, resumed runs, sweep re-enqueues, already-queued jobs)
 * before a single provider call.
 *
 * Read per call rather than captured at import so tests and an env change on
 * the next process start both take effect without module reloading tricks.
 */
export const DEEP_RESEARCH_FLAG_NAME = 'PRIVATE_DEEP_RESEARCH_ENABLED';

export const DEEP_RESEARCH_DISABLED_ERROR = 'deep_research_disabled';

export const DEEP_RESEARCH_DISABLED_MESSAGE =
	'Deep research is turned off right now, so this run was stopped before doing any more research. Nothing further will be charged for it.';

export function isDeepResearchEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
	return String(environment[DEEP_RESEARCH_FLAG_NAME] ?? 'false').toLowerCase() === 'true';
}
