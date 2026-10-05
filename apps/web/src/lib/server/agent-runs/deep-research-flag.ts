// apps/web/src/lib/server/agent-runs/deep-research-flag.ts
import { env } from '$env/dynamic/private';

/**
 * Deep Research kill switch (2026-10-04).
 *
 * A `deep_research` Agent Run fans out to two paid web researchers plus a
 * synthesis call ($0.25–$1 per run) and its July quality gate failed, so it is
 * parked (tasker/29-deep-research-production-track.md). It stays off unless a
 * deployment explicitly sets PRIVATE_DEEP_RESEARCH_ENABLED=true. The worker
 * reads the same variable and refuses any deep-research job it is handed while
 * the switch is off, so stale clients and already-queued jobs cannot spend.
 */
export const DEEP_RESEARCH_FLAG_NAME = 'PRIVATE_DEEP_RESEARCH_ENABLED';

export const DEEP_RESEARCH_DISABLED_CODE = 'DEEP_RESEARCH_DISABLED';

export const DEEP_RESEARCH_DISABLED_MESSAGE =
	'Deep research is turned off right now, so nothing was started and nothing was charged.';

export function isDeepResearchEnabled(): boolean {
	return String(env[DEEP_RESEARCH_FLAG_NAME] ?? 'false').toLowerCase() === 'true';
}
