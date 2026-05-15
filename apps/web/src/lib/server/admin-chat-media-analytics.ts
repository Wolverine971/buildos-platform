// apps/web/src/lib/server/admin-chat-media-analytics.ts

export type ChatMediaTimeframe = '24h' | '7d' | '30d' | '90d' | '365d';

export type ChatMediaEventType =
	| 'upload_requested'
	| 'upload_deduped'
	| 'upload_completed'
	| 'attachment_linked'
	| 'ocr_queued'
	| 'ocr_failed'
	| 'asset_unlinked'
	| 'live_vision_requested'
	| 'live_vision_failed';

export type ChatMediaEventRow = {
	id?: string | null;
	user_id?: string | null;
	project_id?: string | null;
	session_id?: string | null;
	message_id?: string | null;
	asset_id?: string | null;
	external_agent_caller_id?: string | null;
	source?: string | null;
	event_type?: ChatMediaEventType | string | null;
	media_type?: string | null;
	content_type?: string | null;
	file_size_bytes?: number | string | null;
	checksum_sha256?: string | null;
	metadata?: unknown;
	created_at?: string | null;
};

export type ChatMediaAssetRow = {
	id?: string | null;
	project_id?: string | null;
	kind?: string | null;
	file_size_bytes?: number | string | null;
	ocr_status?: string | null;
	created_at?: string | null;
	deleted_at?: string | null;
};

export type ChatMediaProjectRow = {
	id: string;
	name?: string | null;
};

export type ChatMediaUsageAnalytics = {
	kpis: {
		totalEvents: number;
		uploadRequests: number;
		uploadDedupes: number;
		duplicateAttemptRate: number;
		uploadedBytes: number;
		attachmentLinks: number;
		ocrQueued: number;
		ocrFailed: number;
		ocrFailureRate: number;
		liveVisionRequests: number;
		liveVisionFailures: number;
		liveVisionFailureRate: number;
		currentImageAssets: number;
		currentImageStorageBytes: number;
		averageImageBytes: number;
	};
	by_event_type: Array<{
		event_type: string;
		count: number;
		bytes: number;
	}>;
	by_source: Array<{
		source: string;
		count: number;
		bytes: number;
	}>;
	top_projects: Array<{
		project_id: string;
		project_name: string | null;
		event_count: number;
		upload_count: number;
		upload_bytes: number;
		dedupe_count: number;
		live_vision_requests: number;
		live_vision_failures: number;
		current_image_count: number;
		current_storage_bytes: number;
	}>;
	recent_events: Array<{
		id: string | null;
		created_at: string | null;
		event_type: string;
		source: string;
		project_id: string | null;
		project_name: string | null;
		asset_id: string | null;
		media_type: string | null;
		content_type: string | null;
		file_size_bytes: number;
		checksum_sha256_suffix: string | null;
	}>;
	date_range: {
		start: string;
		end: string;
		timeframe: ChatMediaTimeframe;
	};
	data_health: {
		rows: {
			mediaEvents: number;
			imageAssets: number;
		};
		truncated: Record<string, boolean>;
	};
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

function parseTimeframe(value: string | null | undefined): ChatMediaTimeframe {
	if (
		value === '24h' ||
		value === '7d' ||
		value === '30d' ||
		value === '90d' ||
		value === '365d'
	) {
		return value;
	}
	return '7d';
}

function timeframeToMs(timeframe: ChatMediaTimeframe): number {
	switch (timeframe) {
		case '24h':
			return 24 * 60 * 60 * 1000;
		case '30d':
			return 30 * 24 * 60 * 60 * 1000;
		case '90d':
			return 90 * 24 * 60 * 60 * 1000;
		case '365d':
			return 365 * 24 * 60 * 60 * 1000;
		case '7d':
		default:
			return 7 * 24 * 60 * 60 * 1000;
	}
}

function numeric(value: number | string | null | undefined): number {
	const parsed = typeof value === 'number' ? value : Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator: number, denominator: number): number {
	if (denominator <= 0) return 0;
	return Math.round((numerator / denominator) * 1000) / 10;
}

function incrementCounter(
	map: Map<string, { count: number; bytes: number }>,
	key: string,
	bytes: number
) {
	const existing = map.get(key) ?? { count: 0, bytes: 0 };
	existing.count += 1;
	existing.bytes += Math.max(0, bytes);
	map.set(key, existing);
}

function checksumSuffix(value: string | null | undefined): string | null {
	if (!value || value.length < 8) return value ?? null;
	return value.slice(-8);
}

async function fetchAllRows<T>(
	buildQuery: (from: number, to: number) => PromiseLike<{ data?: unknown; error?: unknown }>
): Promise<{ rows: T[]; truncated: boolean }> {
	const rows: T[] = [];
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const from = page * PAGE_SIZE;
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await buildQuery(from, to);
		if (error) throw error;
		const pageRows = Array.isArray(data) ? (data as T[]) : [];
		rows.push(...pageRows);
		if (pageRows.length < PAGE_SIZE) {
			return { rows, truncated: false };
		}
	}
	return { rows, truncated: true };
}

export function buildChatMediaUsageAnalytics(params: {
	events: ChatMediaEventRow[];
	assets: ChatMediaAssetRow[];
	projects?: ChatMediaProjectRow[];
	startIso: string;
	endIso: string;
	timeframe: ChatMediaTimeframe;
	truncated?: Record<string, boolean>;
}): ChatMediaUsageAnalytics {
	const projectsById = new Map((params.projects ?? []).map((project) => [project.id, project]));
	const eventTypeCounts = new Map<string, { count: number; bytes: number }>();
	const sourceCounts = new Map<string, { count: number; bytes: number }>();
	const projectStats = new Map<
		string,
		{
			project_id: string;
			project_name: string | null;
			event_count: number;
			upload_count: number;
			upload_bytes: number;
			dedupe_count: number;
			live_vision_requests: number;
			live_vision_failures: number;
			current_image_count: number;
			current_storage_bytes: number;
		}
	>();

	let uploadRequests = 0;
	let uploadDedupes = 0;
	let uploadedBytes = 0;
	let attachmentLinks = 0;
	let ocrQueued = 0;
	let ocrFailed = 0;
	let liveVisionRequests = 0;
	let liveVisionFailures = 0;

	function projectEntry(projectId: string) {
		const existing = projectStats.get(projectId);
		if (existing) return existing;
		const project = projectsById.get(projectId);
		const entry = {
			project_id: projectId,
			project_name: project?.name ?? null,
			event_count: 0,
			upload_count: 0,
			upload_bytes: 0,
			dedupe_count: 0,
			live_vision_requests: 0,
			live_vision_failures: 0,
			current_image_count: 0,
			current_storage_bytes: 0
		};
		projectStats.set(projectId, entry);
		return entry;
	}

	for (const event of params.events) {
		const eventType = event.event_type || 'unknown';
		const source = event.source || 'unknown';
		const bytes = Math.max(0, numeric(event.file_size_bytes));
		incrementCounter(eventTypeCounts, eventType, bytes);
		incrementCounter(sourceCounts, source, bytes);

		if (event.event_type === 'upload_requested') {
			uploadRequests += 1;
			uploadedBytes += bytes;
		}
		if (event.event_type === 'upload_deduped') uploadDedupes += 1;
		if (event.event_type === 'attachment_linked') attachmentLinks += 1;
		if (event.event_type === 'ocr_queued') ocrQueued += 1;
		if (event.event_type === 'ocr_failed') ocrFailed += 1;
		if (event.event_type === 'live_vision_requested') liveVisionRequests += 1;
		if (event.event_type === 'live_vision_failed') liveVisionFailures += 1;

		if (event.project_id) {
			const project = projectEntry(event.project_id);
			project.event_count += 1;
			if (event.event_type === 'upload_requested') {
				project.upload_count += 1;
				project.upload_bytes += bytes;
			}
			if (event.event_type === 'upload_deduped') project.dedupe_count += 1;
			if (event.event_type === 'live_vision_requested') project.live_vision_requests += 1;
			if (event.event_type === 'live_vision_failed') project.live_vision_failures += 1;
		}
	}

	let currentImageAssets = 0;
	let currentImageStorageBytes = 0;
	for (const asset of params.assets) {
		if (asset.kind && asset.kind !== 'image') continue;
		if (asset.deleted_at) continue;
		const bytes = Math.max(0, numeric(asset.file_size_bytes));
		currentImageAssets += 1;
		currentImageStorageBytes += bytes;
		if (asset.project_id) {
			const project = projectEntry(asset.project_id);
			project.current_image_count += 1;
			project.current_storage_bytes += bytes;
		}
	}

	const byEventType = Array.from(eventTypeCounts.entries())
		.map(([event_type, value]) => ({ event_type, ...value }))
		.sort((a, b) => b.count - a.count);

	const bySource = Array.from(sourceCounts.entries())
		.map(([source, value]) => ({ source, ...value }))
		.sort((a, b) => b.count - a.count);

	const topProjects = Array.from(projectStats.values())
		.sort(
			(a, b) =>
				b.current_storage_bytes - a.current_storage_bytes ||
				b.event_count - a.event_count ||
				b.upload_bytes - a.upload_bytes
		)
		.slice(0, 10);

	const recentEvents = [...params.events]
		.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
		.slice(0, 20)
		.map((event) => {
			const projectId = event.project_id ?? null;
			return {
				id: event.id ?? null,
				created_at: event.created_at ?? null,
				event_type: event.event_type || 'unknown',
				source: event.source || 'unknown',
				project_id: projectId,
				project_name: projectId ? (projectsById.get(projectId)?.name ?? null) : null,
				asset_id: event.asset_id ?? null,
				media_type: event.media_type ?? null,
				content_type: event.content_type ?? null,
				file_size_bytes: Math.max(0, numeric(event.file_size_bytes)),
				checksum_sha256_suffix: checksumSuffix(event.checksum_sha256)
			};
		});

	return {
		kpis: {
			totalEvents: params.events.length,
			uploadRequests,
			uploadDedupes,
			duplicateAttemptRate: percent(uploadDedupes, uploadRequests + uploadDedupes),
			uploadedBytes,
			attachmentLinks,
			ocrQueued,
			ocrFailed,
			ocrFailureRate: percent(ocrFailed, ocrQueued + ocrFailed),
			liveVisionRequests,
			liveVisionFailures,
			liveVisionFailureRate: percent(
				liveVisionFailures,
				liveVisionRequests + liveVisionFailures
			),
			currentImageAssets,
			currentImageStorageBytes,
			averageImageBytes:
				currentImageAssets > 0 ? currentImageStorageBytes / currentImageAssets : 0
		},
		by_event_type: byEventType,
		by_source: bySource,
		top_projects: topProjects,
		recent_events: recentEvents,
		date_range: {
			start: params.startIso,
			end: params.endIso,
			timeframe: params.timeframe
		},
		data_health: {
			rows: {
				mediaEvents: params.events.length,
				imageAssets: params.assets.length
			},
			truncated: params.truncated ?? {}
		}
	};
}

export async function getAdminChatMediaUsageAnalytics(
	supabase: any,
	timeframeValue: string | null | undefined
): Promise<ChatMediaUsageAnalytics> {
	const timeframe = parseTimeframe(timeframeValue);
	const endDate = new Date();
	const startDate = new Date(endDate.getTime() - timeframeToMs(timeframe));
	const startIso = startDate.toISOString();
	const endIso = endDate.toISOString();

	const [eventResult, assetResult] = await Promise.all([
		fetchAllRows<ChatMediaEventRow>((from, to) =>
			supabase
				.from('agent_chat_media_events')
				.select(
					'id, user_id, project_id, session_id, message_id, asset_id, external_agent_caller_id, source, event_type, media_type, content_type, file_size_bytes, checksum_sha256, metadata, created_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatMediaAssetRow>((from, to) =>
			supabase
				.from('onto_assets')
				.select('id, project_id, kind, file_size_bytes, ocr_status, created_at, deleted_at')
				.eq('kind', 'image')
				.is('deleted_at', null)
				.order('created_at', { ascending: false })
				.range(from, to)
		)
	]);

	const projectIds = Array.from(
		new Set(
			[
				...eventResult.rows.map((row) => row.project_id),
				...assetResult.rows.map((row) => row.project_id)
			].filter(Boolean)
		)
	) as string[];

	let projects: ChatMediaProjectRow[] = [];
	if (projectIds.length > 0) {
		const { data, error } = await supabase
			.from('onto_projects')
			.select('id, name')
			.in('id', projectIds.slice(0, 500));
		if (error) throw error;
		projects = (data ?? []) as ChatMediaProjectRow[];
	}

	return buildChatMediaUsageAnalytics({
		events: eventResult.rows,
		assets: assetResult.rows,
		projects,
		startIso,
		endIso,
		timeframe,
		truncated: {
			mediaEvents: eventResult.truncated,
			imageAssets: assetResult.truncated
		}
	});
}
