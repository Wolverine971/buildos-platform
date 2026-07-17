// apps/web/src/lib/server/project-full-api-helpers.ts
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { pickStartHereDocument } from '$lib/services/ontology/start-here-selector';
import type { ProjectEventsCoverage } from '$lib/types/project-full-data';

export type PublicPageCounts = {
	total: number;
	live: number;
};

export type ProjectFullProfile = 'classic' | 'v2-initial';

type ProjectEventWithSync = Awaited<ReturnType<OntoEventSyncService['listProjectEvents']>>[number];

export type ProjectEventWindowResult = {
	events: ProjectEventWithSync[];
	coverage: ProjectEventsCoverage;
};

const INITIAL_EVENT_RECENT_DAYS = 30;
const INITIAL_EVENT_RECENT_LIMIT = 25;
const INITIAL_EVENT_UPCOMING_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONTEXT_DOCUMENT_FALLBACK_COLUMNS = [
	'archived_at',
	'children',
	'content',
	'created_at',
	'created_by',
	'deleted_at',
	'description',
	'id',
	'project_id',
	'props',
	'state_key',
	'title',
	'type_key',
	'updated_at'
].join(',');

const CONTEXT_DOCUMENT_METADATA_COLUMNS = [
	'created_at',
	'description',
	'id',
	'state_key',
	'title',
	'type_key',
	'updated_at'
].join(',');

export async function fetchContextDocumentByTypeKey(
	supabase: App.Locals['supabase'],
	projectId: string,
	options: { includeContent?: boolean } = {}
): Promise<unknown | null> {
	const columns =
		options.includeContent === false
			? CONTEXT_DOCUMENT_METADATA_COLUMNS
			: CONTEXT_DOCUMENT_FALLBACK_COLUMNS;
	const { data, error } = await supabase
		.from('onto_documents')
		.select(columns)
		.eq('project_id', projectId)
		.eq('type_key', 'document.context.project')
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(20);

	if (error) {
		throw error;
	}

	return pickStartHereDocument((data ?? []) as unknown as Array<Record<string, unknown>>) ?? null;
}

export async function fetchPublicPageCounts(
	supabase: App.Locals['supabase'],
	projectId: string
): Promise<PublicPageCounts> {
	const [totalResult, liveResult] = await Promise.all([
		(supabase as any)
			.from('onto_public_pages')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', projectId)
			.is('deleted_at', null),
		(supabase as any)
			.from('onto_public_pages')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', projectId)
			.eq('public_status', 'live')
			.is('deleted_at', null)
	]);

	if (totalResult.error) {
		throw totalResult.error;
	}
	if (liveResult.error) {
		throw liveResult.error;
	}

	return {
		total: totalResult.count ?? 0,
		live: liveResult.count ?? 0
	};
}

export function extractErrorMessage(error: unknown): string {
	if (!error) return 'Unknown error';
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (typeof error === 'object') {
		const err = error as Record<string, unknown>;
		const message = typeof err.message === 'string' ? err.message : null;
		if (message) return message;
		const errorDescription =
			typeof err.error_description === 'string' ? err.error_description : null;
		if (errorDescription) return errorDescription;
		const errorMessage = typeof err.error === 'string' ? err.error : null;
		if (errorMessage) return errorMessage;
		const details = typeof err.details === 'string' ? err.details : null;
		if (details) return details;
		const hint = typeof err.hint === 'string' ? err.hint : null;
		if (hint) return hint;
		try {
			return JSON.stringify(err);
		} catch {
			return String(error);
		}
	}
	return String(error);
}

export function resolveProfile(url: URL): ProjectFullProfile {
	const profile = url.searchParams.get('profile');
	return profile === 'v2' || profile === 'v2-initial' ? 'v2-initial' : 'classic';
}

function resolveProjectFullPerfSampleRate(): number {
	if (process.env.NODE_ENV === 'test') return 0;
	const configured = Number(process.env.PROJECT_FULL_PERF_SAMPLE_RATE);
	if (Number.isFinite(configured)) {
		return Math.min(1, Math.max(0, configured));
	}
	return process.env.NODE_ENV === 'production' ? 0.01 : 1;
}

export function shouldSampleProjectFullPerf(): boolean {
	return Math.random() < resolveProjectFullPerfSampleRate();
}

export function arrayLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

export async function loadInitialProjectEventWindow(
	eventService: OntoEventSyncService,
	projectId: string,
	userId: string,
	now = new Date()
): Promise<ProjectEventWindowResult> {
	const nowIso = now.toISOString();
	const recentSince = new Date(now.getTime() - INITIAL_EVENT_RECENT_DAYS * DAY_MS).toISOString();
	const [recentRows, upcomingRows] = await Promise.all([
		eventService.listProjectEvents(
			projectId,
			{
				timeMin: recentSince,
				timeMax: nowIso,
				includeDeleted: false,
				limit: INITIAL_EVENT_RECENT_LIMIT + 1,
				orderDirection: 'descending'
			},
			userId
		),
		eventService.listProjectEvents(
			projectId,
			{
				timeMin: nowIso,
				includeDeleted: false,
				limit: INITIAL_EVENT_UPCOMING_LIMIT + 1,
				orderDirection: 'ascending'
			},
			userId
		)
	]);

	const recentHasMore = recentRows.length > INITIAL_EVENT_RECENT_LIMIT;
	const upcomingHasMore = upcomingRows.length > INITIAL_EVENT_UPCOMING_LIMIT;
	const byId = new Map<string, ProjectEventWithSync>();
	for (const event of recentRows.slice(0, INITIAL_EVENT_RECENT_LIMIT)) {
		byId.set(event.id, event);
	}
	for (const event of upcomingRows.slice(0, INITIAL_EVENT_UPCOMING_LIMIT)) {
		byId.set(event.id, event);
	}
	const events = [...byId.values()];

	return {
		events,
		coverage: {
			scope: 'initial-window',
			complete: false,
			returned: events.length,
			recent_since: recentSince,
			recent_limit: INITIAL_EVENT_RECENT_LIMIT,
			upcoming_limit: INITIAL_EVENT_UPCOMING_LIMIT,
			recent_has_more: recentHasMore,
			upcoming_has_more: upcomingHasMore
		}
	};
}
