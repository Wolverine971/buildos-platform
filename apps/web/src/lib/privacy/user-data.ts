// apps/web/src/lib/privacy/user-data.ts
//
// Shapes and pure helpers for Settings → Your data: the live summary from
// get_my_data_summary() and the "Download my data" export rows
// (supabase/migrations/20260924190300_user_data_panel_and_exports.sql).

export type UserDataExportStatus = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

export interface UserDataExportRow {
	id: string;
	user_id: string;
	status: string;
	storage_path: string | null;
	byte_size: number | null;
	part_count: number | null;
	error_code: string | null;
	requested_at: string;
	started_at: string | null;
	completed_at: string | null;
	expires_at: string | null;
}

export interface UserDataExportView {
	id: string;
	status: UserDataExportStatus;
	requestedAt: string;
	startedAt: string | null;
	completedAt: string | null;
	expiresAt: string | null;
	byteSize: number | null;
	errorCode: string | null;
	/** Same-origin download routes, one per part; empty unless ready and in its window. */
	downloadPaths: string[];
}

export interface ConnectedAgent {
	id: string;
	provider: string;
	name: string | null;
	lastUsedAt: string | null;
}

export interface DataSummary {
	generatedAt: string | null;
	workspace: {
		projects: number;
		documents: number;
		tasks: number;
		chats: number;
		messages: number;
		voiceNotes: number;
		dailyBriefs: number;
		uploads: number;
	};
	traces: {
		toolTraces: number;
		promptSnapshots: number;
		aiUsageRecords: number;
	};
	connections: {
		gmail: { connected: boolean; needsReconnect: boolean; lastReadAt: string | null };
		calendar: { connected: boolean; lastSyncedAt: string | null };
		agents: ConnectedAgent[];
	};
}

export interface DataPanelPayload {
	summary: DataSummary;
	export: UserDataExportView | null;
	remainingToday: number;
}

export interface ExportStatusPayload {
	export: UserDataExportView | null;
	remainingToday: number;
}

export const USER_DATA_EXPORT_BUCKET = 'user-exports';
export const USER_DATA_EXPORT_STALE_MS = 2 * 60 * 60 * 1000;

const EXPORT_STATUSES = new Set<UserDataExportStatus>([
	'queued',
	'running',
	'ready',
	'failed',
	'expired'
]);

/** Part 1 is {user_id}/{export_id}.zip; later parts add .part{n} (the worker writes the same names). */
export function userDataExportObjectPath(userId: string, exportId: string, part = 1): string {
	return part <= 1 ? `${userId}/${exportId}.zip` : `${userId}/${exportId}.part${part}.zip`;
}

export function userDataExportFileName(completedAt: string | null, part: number, parts: number) {
	const day = (completedAt ?? new Date().toISOString()).slice(0, 10);
	return parts > 1 ? `buildos-data-${day}-part${part}.zip` : `buildos-data-${day}.zip`;
}

export function isActiveExport(view: Pick<UserDataExportView, 'status'> | null): boolean {
	return view?.status === 'queued' || view?.status === 'running';
}

export function toExportView(row: UserDataExportRow, now = Date.now()): UserDataExportView {
	let status: UserDataExportStatus = EXPORT_STATUSES.has(row.status as UserDataExportStatus)
		? (row.status as UserDataExportStatus)
		: 'failed';
	const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= now;
	if (status === 'ready' && expired) status = 'expired';
	// Mirrors request_user_data_export(): an export whose worker died stops looking busy.
	const stale = now - new Date(row.requested_at).getTime() >= USER_DATA_EXPORT_STALE_MS;
	if ((status === 'queued' || status === 'running') && stale) status = 'failed';

	const parts = Math.max(1, row.part_count ?? 1);
	return {
		id: row.id,
		status,
		requestedAt: row.requested_at,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		expiresAt: row.expires_at,
		byteSize: row.byte_size,
		errorCode: status === 'failed' ? (row.error_code ?? 'stale') : null,
		downloadPaths:
			status === 'ready'
				? Array.from(
						{ length: parts },
						(_, index) => `/api/account/exports/${row.id}/download?part=${index + 1}`
					)
				: []
	};
}

function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function timestamp(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Normalizes the get_my_data_summary() jsonb; missing parts read as zero / not connected. */
export function toDataSummary(raw: unknown): DataSummary {
	const root = record(raw);
	const workspace = record(root.workspace);
	const traces = record(root.traces);
	const connections = record(root.connections);
	const gmail = record(connections.gmail);
	const calendar = record(connections.calendar);
	const agents = Array.isArray(connections.agents) ? connections.agents : [];

	return {
		generatedAt: timestamp(root.generated_at),
		workspace: {
			projects: count(workspace.projects),
			documents: count(workspace.documents),
			tasks: count(workspace.tasks),
			chats: count(workspace.chats),
			messages: count(workspace.messages),
			voiceNotes: count(workspace.voice_notes),
			dailyBriefs: count(workspace.daily_briefs),
			uploads: count(workspace.uploads)
		},
		traces: {
			toolTraces: count(traces.tool_traces),
			promptSnapshots: count(traces.prompt_snapshots),
			aiUsageRecords: count(traces.ai_usage_records)
		},
		connections: {
			gmail: {
				connected: gmail.connected === true,
				needsReconnect: gmail.needs_reconnect === true,
				lastReadAt: timestamp(gmail.last_read_at)
			},
			calendar: {
				connected: calendar.connected === true,
				lastSyncedAt: timestamp(calendar.last_synced_at)
			},
			agents: agents.flatMap((entry) => {
				const agent = record(entry);
				if (typeof agent.id !== 'string' || typeof agent.provider !== 'string') return [];
				return [
					{
						id: agent.id,
						provider: agent.provider,
						name: typeof agent.name === 'string' && agent.name ? agent.name : null,
						lastUsedAt: timestamp(agent.last_used_at)
					}
				];
			})
		}
	};
}

const numberFormat = new Intl.NumberFormat('en-US');

export function formatCount(value: number): string {
	return numberFormat.format(value);
}

export function plural(value: number, one: string, many: string): string {
	return `${formatCount(value)} ${value === 1 ? one : many}`;
}

export function formatBytes(bytes: number | null): string {
	if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	const mb = bytes / (1024 * 1024);
	return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

/** "just now", "5 min ago", "2h ago", "today", "yesterday", "Sep 1". */
export function formatRelativeTime(iso: string | null, now = new Date()): string {
	if (!iso) return '';
	const then = new Date(iso);
	const ms = now.getTime() - then.getTime();
	if (!Number.isFinite(ms)) return '';
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 12) return `${hours}h ago`;
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	if (then >= startOfToday) return 'today';
	const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
	if (then >= startOfYesterday) return 'yesterday';
	return then.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	});
}

/** "Oct 1, 3:04 PM" for an expiry the viewer will act on. */
export function formatDateTime(iso: string | null): string {
	if (!iso) return '';
	return new Date(iso).toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}
