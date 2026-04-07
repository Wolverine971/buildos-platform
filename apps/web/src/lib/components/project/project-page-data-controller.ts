// apps/web/src/lib/components/project/project-page-data-controller.ts
import type {
	Document,
	Goal,
	Milestone,
	OntoEvent,
	Plan,
	Project,
	Risk,
	Task
} from '$lib/types/onto';
import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
import type { Database } from '@buildos/shared-types';
import type { ProjectLogEntryWithMeta } from '@buildos/shared-types';
import { requireApiData } from '$lib/utils/api-client-helpers';

export type OntoEventWithSync = OntoEvent & {
	onto_event_sync?: Database['public']['Tables']['onto_event_sync']['Row'][];
};

export type ProjectNotificationSettings = {
	project_id: string;
	member_count: number;
	is_shared_project: boolean;
	project_default_enabled: boolean;
	member_enabled: boolean;
	effective_enabled: boolean;
	member_overridden: boolean;
	can_manage_default: boolean;
};

export type ProjectMemberRow = {
	actor_id: string;
	actor: {
		id: string;
		user_id: string | null;
		name: string | null;
		email: string | null;
	} | null;
};

export type ProjectFullData = {
	project?: Project;
	tasks?: Task[];
	documents?: Document[];
	images?: OntologyImageAsset[];
	plans?: Plan[];
	goals?: Goal[];
	milestones?: Milestone[];
	risks?: Risk[];
	context_document?: Document | null;
};

type JsonRecord = Record<string, unknown>;

export type ProjectActivityLogPage = {
	logs: ProjectLogEntryWithMeta[];
	total: number;
	hasMore: boolean;
};

export type ProjectBriefSummary = {
	id: string;
	brief_content: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
	brief_date: string | null;
	daily_brief_id: string | null;
	executive_summary: string | null;
	priority_actions: string[] | null;
};

export type ProjectBriefsPage = {
	briefs: ProjectBriefSummary[];
	total: number;
	hasMore: boolean;
};

export type GeneratedProjectNextStep = {
	next_step_short: string;
	next_step_long: string;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null;
}

function requireRecord(value: unknown, fallback: string): JsonRecord {
	if (!isRecord(value)) {
		throw new Error(fallback);
	}
	return value;
}

function requireArray<T>(value: unknown, fallback: string): T[] {
	if (!Array.isArray(value)) {
		throw new Error(fallback);
	}
	return value as T[];
}

function requireBoolean(value: unknown, fallback: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(fallback);
	}
	return value;
}

function requireNumber(value: unknown, fallback: string): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	throw new Error(fallback);
}

function requireString(value: unknown, fallback: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(fallback);
	}
	return value;
}

function readNullableString(value: unknown, fallback: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== 'string') {
		throw new Error(fallback);
	}
	return value;
}

async function requestApiDataRecord(
	url: string,
	fallbackMessage: string,
	init?: RequestInit
): Promise<JsonRecord> {
	const response = await fetch(url, init);
	const payload = await requireApiData<unknown>(response, fallbackMessage);
	return requireRecord(payload, fallbackMessage);
}

function parseProjectNotificationSettings(
	value: unknown,
	fallbackMessage: string
): ProjectNotificationSettings {
	const settings = requireRecord(value, fallbackMessage);
	return {
		project_id: requireString(settings.project_id, fallbackMessage),
		member_count: requireNumber(settings.member_count, fallbackMessage),
		is_shared_project: requireBoolean(settings.is_shared_project, fallbackMessage),
		project_default_enabled: requireBoolean(settings.project_default_enabled, fallbackMessage),
		member_enabled: requireBoolean(settings.member_enabled, fallbackMessage),
		effective_enabled: requireBoolean(settings.effective_enabled, fallbackMessage),
		member_overridden: requireBoolean(settings.member_overridden, fallbackMessage),
		can_manage_default: requireBoolean(settings.can_manage_default, fallbackMessage)
	};
}

export async function fetchProjectFullData(projectId: string): Promise<ProjectFullData> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/full`,
		'Failed to load project data'
	);
	if (!isRecord(data.project)) {
		throw new Error('Invalid project data response');
	}
	return data as ProjectFullData;
}

export async function fetchProjectSnapshot(projectId: string): Promise<ProjectFullData> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}`,
		'Failed to refresh data'
	);
	if (!isRecord(data.project)) {
		throw new Error('Invalid project snapshot response');
	}
	return data as ProjectFullData;
}

export async function fetchProjectMembers(projectId: string): Promise<{
	members: ProjectMemberRow[];
	actorId: string | null;
}> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/members`,
		'Failed to load project members',
		{
			method: 'GET',
			credentials: 'same-origin'
		}
	);
	const members = requireArray<ProjectMemberRow>(
		data.members,
		'Invalid project members response'
	);
	const actorId =
		data.actorId === null || data.actorId === undefined
			? null
			: requireString(data.actorId, 'Invalid project members response');
	return { members, actorId };
}

export async function fetchProjectEvents(projectId: string): Promise<OntoEventWithSync[]> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/events`,
		'Failed to load events'
	);
	return requireArray<OntoEventWithSync>(data.events, 'Invalid project events response');
}

export async function fetchProjectNotificationSettings(
	projectId: string
): Promise<ProjectNotificationSettings> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/notification-settings`,
		'Failed to load notification settings',
		{
			method: 'GET',
			credentials: 'same-origin'
		}
	);
	return parseProjectNotificationSettings(
		data.settings,
		'Invalid project notification settings response'
	);
}

export async function updateProjectNotificationSettings(options: {
	projectId: string;
	memberEnabled: boolean;
}): Promise<ProjectNotificationSettings> {
	const { projectId, memberEnabled } = options;
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/notification-settings`,
		'Failed to update notification settings',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ member_enabled: memberEnabled })
		}
	);
	return parseProjectNotificationSettings(
		data.settings,
		'Invalid project notification settings response'
	);
}

export async function fetchProjectLogs(options: {
	projectId: string;
	limit: number;
	offset: number;
}): Promise<ProjectActivityLogPage> {
	const { projectId, limit, offset } = options;
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset)
	});
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/logs?${params.toString()}`,
		'Failed to fetch logs'
	);

	return {
		logs: requireArray<ProjectLogEntryWithMeta>(data.logs, 'Invalid project logs response'),
		total: requireNumber(data.total, 'Invalid project logs response'),
		hasMore: requireBoolean(data.hasMore, 'Invalid project logs response')
	};
}

export async function fetchProjectBriefs(options: {
	projectId: string;
	limit: number;
	offset: number;
}): Promise<ProjectBriefsPage> {
	const { projectId, limit, offset } = options;
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset)
	});
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/briefs?${params.toString()}`,
		'Failed to fetch briefs'
	);

	return {
		briefs: requireArray<ProjectBriefSummary>(data.briefs, 'Invalid project briefs response'),
		total: requireNumber(data.total, 'Invalid project briefs response'),
		hasMore: requireBoolean(data.hasMore, 'Invalid project briefs response')
	};
}

export async function generateProjectNextStep(
	projectId: string
): Promise<GeneratedProjectNextStep> {
	const data = await requestApiDataRecord(
		`/api/onto/projects/${projectId}/next-step/generate`,
		'Failed to generate next step',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	const nextStepShort = requireString(data.next_step_short, 'Invalid next step response');
	const nextStepLong = readNullableString(data.next_step_long, 'Invalid next step response');
	const nextStepSource =
		data.next_step_source === 'ai' || data.next_step_source === 'user'
			? data.next_step_source
			: null;

	return {
		next_step_short: nextStepShort,
		next_step_long: nextStepLong ?? nextStepShort,
		next_step_source: nextStepSource,
		next_step_updated_at: readNullableString(
			data.next_step_updated_at,
			'Invalid next step response'
		)
	};
}

export async function moveProjectDocument(options: {
	projectId: string;
	documentId: string;
	newParentId: string | null;
	newPosition: number;
}): Promise<JsonRecord> {
	const { projectId, documentId, newParentId, newPosition } = options;
	return requestApiDataRecord(
		`/api/onto/projects/${projectId}/doc-tree/move`,
		'Failed to move document',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				document_id: documentId,
				new_parent_id: newParentId,
				new_position: newPosition
			})
		}
	);
}

export async function archiveProjectDocument(options: {
	documentId: string;
	mode: 'archive_children' | 'promote_children' | 'unlink_children';
}): Promise<JsonRecord> {
	const { documentId, mode } = options;
	return requestApiDataRecord(`/api/onto/documents/${documentId}`, 'Failed to archive document', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'archive',
			archive_children_mode: mode
		})
	});
}

export async function updateProjectMilestoneState(options: {
	milestoneId: string;
	stateKey: string;
}): Promise<JsonRecord> {
	const { milestoneId, stateKey } = options;
	return requestApiDataRecord(
		`/api/onto/milestones/${milestoneId}`,
		'Failed to update milestone',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: stateKey })
		}
	);
}

export async function deleteProject(projectId: string): Promise<JsonRecord> {
	return requestApiDataRecord(`/api/onto/projects/${projectId}`, 'Failed to delete project', {
		method: 'DELETE'
	});
}
