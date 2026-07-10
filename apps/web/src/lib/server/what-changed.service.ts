// apps/web/src/lib/server/what-changed.service.ts
// Cross-project "what changed since you were here" feed, built on
// onto_project_logs (the canonical per-change activity log). Collapses repeated
// edits to the same entity into one receipt and attributes each to an actor.
import type { TypedSupabaseClient } from '@buildos/supabase-client';

import type { ServerTiming } from '$lib/server/server-timing';
import { enrichLogsForDisplay } from '$lib/server/project-logs-enrich';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { WhatChangedEntry, WhatChangedFeed } from '$lib/types/today';

const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOG_FETCH_LIMIT = 300;
const ENTRY_CAP = 100;

function clampSince(since: string | null | undefined, now: Date): string {
	const floor = now.getTime() - MAX_WINDOW_MS;
	const fallback = now.getTime() - DEFAULT_WINDOW_MS;
	const parsed = since ? Date.parse(since) : NaN;
	const target = Number.isFinite(parsed) ? parsed : fallback;
	return new Date(Math.min(Math.max(target, floor), now.getTime())).toISOString();
}

function collapseAction(actions: Set<string>, latestAction: string): WhatChangedEntry['action'] {
	if (latestAction === 'deleted') return 'deleted';
	if (actions.has('created')) return 'created';
	if (latestAction === 'created') return 'created';
	return 'updated';
}

function resolveActor(
	log: {
		changed_by: string | null;
		change_source: string | null;
		external_agent_caller_name: string | null;
		changed_by_name: string | null;
	},
	userId: string
): { kind: WhatChangedEntry['actor_kind']; label: string } {
	if (log.external_agent_caller_name) {
		return { kind: 'external_agent', label: log.external_agent_caller_name };
	}
	if (log.change_source === 'chat') {
		return { kind: 'agent', label: 'Agent chat' };
	}
	if (log.change_source === 'agent_call') {
		return { kind: 'agent', label: 'Agent run' };
	}
	if (log.change_source === 'brain_dump') {
		return { kind: 'you', label: 'Brain dump' };
	}
	if (log.changed_by === userId) {
		return { kind: 'you', label: 'You' };
	}
	if (log.changed_by_name) {
		return { kind: 'member', label: log.changed_by_name };
	}
	return { kind: 'system', label: 'BuildOS' };
}

export async function getWhatChangedFeed({
	supabase,
	userId,
	since,
	timing
}: {
	supabase: TypedSupabaseClient;
	userId: string;
	since?: string | null;
	timing?: ServerTiming;
}): Promise<WhatChangedFeed> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const now = new Date();
	const sinceIso = clampSince(since, now);

	const actorId = await measure('changes.actor', () => ensureActorId(supabase, userId));
	const projects = (await measure('changes.projects', () =>
		fetchProjectSummaries(supabase, actorId, timing)
	)).filter((project) => project.state_key !== 'paused');
	const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
	const projectIds = Array.from(projectNameById.keys());

	if (projectIds.length === 0) {
		return { since: sinceIso, entries: [], totalLogCount: 0, truncated: false };
	}

	const { data: logRows, error } = await measure('changes.logs', () =>
		supabase
			.from('onto_project_logs')
			.select(
				'id, project_id, entity_type, entity_id, action, before_data, after_data, changed_by, changed_by_actor_id, external_agent_caller_id, agent_call_session_id, change_source, created_at'
			)
			.in('project_id', projectIds)
			.gte('created_at', sinceIso)
			// Edge (relationship) logs are structural noise at feed granularity.
			.neq('entity_type', 'edge')
			.order('created_at', { ascending: false })
			.limit(LOG_FETCH_LIMIT)
	);

	if (error) {
		console.error('[WhatChanged] Failed to load project logs:', error);
		return { since: sinceIso, entries: [], totalLogCount: 0, truncated: false };
	}

	const logs = logRows ?? [];
	if (logs.length === 0) {
		return { since: sinceIso, entries: [], totalLogCount: 0, truncated: false };
	}

	const enriched = await measure('changes.enrich', () => enrichLogsForDisplay(supabase, logs));

	// Collapse to one entry per entity. Logs are newest-first, so the first log
	// seen for an entity is the one whose actor/timestamp the entry keeps.
	const byEntity = new Map<
		string,
		{ newest: (typeof enriched)[number]; actions: Set<string>; occurrences: number }
	>();
	for (const log of enriched) {
		const key = `${log.entity_type}:${log.entity_id}`;
		const existing = byEntity.get(key);
		if (existing) {
			existing.actions.add(log.action);
			existing.occurrences += 1;
		} else {
			byEntity.set(key, { newest: log, actions: new Set([log.action]), occurrences: 1 });
		}
	}

	const entries: WhatChangedEntry[] = [];
	for (const { newest, actions, occurrences } of byEntity.values()) {
		const projectName = projectNameById.get(newest.project_id);
		if (!projectName) continue;
		const actor = resolveActor(newest, userId);
		entries.push({
			id: newest.id,
			project_id: newest.project_id,
			project_name: projectName,
			entity_type: newest.entity_type,
			entity_id: newest.entity_id,
			entity_name: newest.entity_name,
			action: collapseAction(actions, newest.action),
			change_source: newest.change_source,
			actor_kind: actor.kind,
			actor_label: actor.label,
			occurrences,
			latest_at: newest.created_at
		});
		if (entries.length >= ENTRY_CAP) break;
	}

	return {
		since: sinceIso,
		entries,
		totalLogCount: logs.length,
		truncated: logs.length >= LOG_FETCH_LIMIT
	};
}
