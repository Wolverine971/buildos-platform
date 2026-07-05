// apps/web/src/lib/server/project-loop-snapshot.service.ts
import { computeProjectSuggestionFreshnessFingerprint } from '@buildos/shared-agent-ops';
import type { LoopOperation } from '@buildos/shared-types';

type AnySupabase = any;

/**
 * Freshness guard for a pending suggestion at approval time. Fresh (safe to
 * apply) when the entities the suggestion's operations MUTATE are unchanged
 * since it was generated. Scoped per suggestion, so an edit to an unrelated
 * entity no longer supersedes the whole pending queue (audit Tier 1 #4). This
 * replaced the old whole-project fingerprint (loadProjectLoopSourceFingerprint),
 * which superseded every pending item on any edit — a 100% supersede rate in prod.
 *
 * Always fresh when the suggestion has no stored fingerprint, or when it mutates
 * no concrete entity (informational suggestions like drift / audit follow-ups —
 * there is nothing whose staleness could make applying them unsafe).
 */
export async function isProjectSuggestionFresh(
	supabase: AnySupabase,
	projectId: string,
	suggestion: { source_fingerprint?: string | null; operations?: LoopOperation[] | null }
): Promise<boolean> {
	if (!suggestion.source_fingerprint) return true;
	const currentFingerprint = await computeProjectSuggestionFreshnessFingerprint(
		supabase,
		projectId,
		suggestion.operations ?? null
	);
	if (currentFingerprint === null) return true;
	return currentFingerprint === suggestion.source_fingerprint;
}
