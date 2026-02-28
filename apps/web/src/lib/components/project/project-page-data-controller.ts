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

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
	if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim().length > 0) {
		return payload.error;
	}
	return fallback;
}

function getDataRecord(payload: unknown): JsonRecord {
	if (!isRecord(payload) || !isRecord(payload.data)) {
		return {};
	}
	return payload.data;
}

async function fetchJson(
	url: string,
	init?: RequestInit
): Promise<{ response: Response; payload: unknown }> {
	const response = await fetch(url, init);
	const payload = await response.json().catch(() => null);
	return { response, payload };
}

export async function fetchProjectFullData(projectId: string): Promise<ProjectFullData> {
	const { response, payload } = await fetchJson(`/api/onto/projects/${projectId}/full`);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to load project data'));
	}

	const data = getDataRecord(payload);
	if (Object.keys(data).length === 0) {
		throw new Error('No data returned from server');
	}

	return data as ProjectFullData;
}

export async function fetchProjectSnapshot(projectId: string): Promise<ProjectFullData> {
	const { response, payload } = await fetchJson(`/api/onto/projects/${projectId}`);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to refresh data'));
	}
	return getDataRecord(payload) as ProjectFullData;
}

export async function fetchProjectMembers(projectId: string): Promise<{
	members: ProjectMemberRow[];
	actorId: string | null;
}> {
	const { response, payload } = await fetchJson(`/api/onto/projects/${projectId}/members`, {
		method: 'GET',
		credentials: 'same-origin'
	});
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to load project members'));
	}

	const data = getDataRecord(payload);
	const members = Array.isArray(data.members) ? (data.members as ProjectMemberRow[]) : [];
	const actorId = typeof data.actorId === 'string' ? data.actorId : null;
	return { members, actorId };
}

export async function fetchProjectEvents(projectId: string): Promise<OntoEventWithSync[]> {
	const { response, payload } = await fetchJson(`/api/onto/projects/${projectId}/events`);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to load events'));
	}

	const data = getDataRecord(payload);
	return Array.isArray(data.events) ? (data.events as OntoEventWithSync[]) : [];
}

export async function fetchProjectNotificationSettings(
	projectId: string
): Promise<ProjectNotificationSettings | null> {
	const { response, payload } = await fetchJson(
		`/api/onto/projects/${projectId}/notification-settings`,
		{
			method: 'GET',
			credentials: 'same-origin'
		}
	);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to load notification settings'));
	}

	const data = getDataRecord(payload);
	if (!isRecord(data.settings)) {
		return null;
	}
	return data.settings as ProjectNotificationSettings;
}

export async function updateProjectNotificationSettings(options: {
	projectId: string;
	memberEnabled: boolean;
}): Promise<ProjectNotificationSettings | null> {
	const { projectId, memberEnabled } = options;
	const { response, payload } = await fetchJson(
		`/api/onto/projects/${projectId}/notification-settings`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ member_enabled: memberEnabled })
		}
	);

	if (!response.ok) {
		throw new Error(getErrorMessage(payload, 'Failed to update notification settings'));
	}

	const data = getDataRecord(payload);
	if (!isRecord(data.settings)) {
		return null;
	}
	return data.settings as ProjectNotificationSettings;
}
