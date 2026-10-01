// apps/web/src/lib/components/project/project-family.ts
//
// Client calls for the project hierarchy (Phase 1): a project's family, moving
// it under a parent, and copying a shared doc from the parent's shelf.
// Types only from shared-types so the browser bundle never depends on a
// freshly built dist for these calls.
import type { ProjectFamilyV1, ProjectSetParentResultV1 } from '@buildos/shared-types';
import { parseApiResponse } from '$lib/utils/api-client-helpers';

/** Shown on a shared doc that a sub-project opens from its shelf. */
export type DocumentInheritance = {
	/** The parent project that owns the document. */
	ownerProjectId: string;
	ownerName: string;
	/** Every sub-project of the owner ("shown in N projects"). */
	sharedWithCount: number;
	/** Whether the viewer may edit the owner's copy. */
	canEditOwner: boolean;
	/** The sub-project the viewer opened it from; "Copy here" lands there. */
	inheritedIntoProjectId: string;
	/** Whether the viewer may add documents to the sub-project. */
	canCopy?: boolean;
};

export type CopiedDocument = { id: string; title: string };

/** A failed call with the server's message and machine code (e.g. `project_has_children`). */
export class ProjectFamilyRequestError extends Error {
	readonly status: number;
	readonly code: string | null;

	constructor(message: string, status: number, code: string | null) {
		super(message);
		this.name = 'ProjectFamilyRequestError';
		this.status = status;
		this.code = code;
	}
}

async function requestData<T>(
	url: string,
	fallback: string,
	init?: { method: 'PUT' | 'POST'; body: unknown }
): Promise<T> {
	const response = await fetch(url, {
		method: init?.method ?? 'GET',
		headers: init
			? { Accept: 'application/json', 'Content-Type': 'application/json' }
			: { Accept: 'application/json' },
		body: init ? JSON.stringify(init.body) : undefined
	});
	const result = await parseApiResponse<T>(response);
	if (!response.ok || !result.success || result.data === undefined) {
		throw new ProjectFamilyRequestError(
			result.error || fallback,
			response.status,
			result.code ?? null
		);
	}
	return result.data;
}

export async function fetchProjectFamily(projectId: string): Promise<ProjectFamilyV1 | null> {
	const data = await requestData<ProjectFamilyV1 | null>(
		`/api/onto/projects/${projectId}/family`,
		'Failed to load related projects'
	);
	return data && typeof data === 'object' && typeof data.project_id === 'string' ? data : null;
}

export function setProjectParent(
	projectId: string,
	parentProjectId: string | null
): Promise<ProjectSetParentResultV1> {
	return requestData<ProjectSetParentResultV1>(
		`/api/onto/projects/${projectId}/parent`,
		parentProjectId ? 'Failed to move this project' : 'Failed to remove the parent project',
		{ method: 'PUT', body: { parent_project_id: parentProjectId } }
	);
}

export async function copyInheritedDocument(
	projectId: string,
	documentId: string
): Promise<CopiedDocument> {
	const data = await requestData<{ document?: { id?: unknown; title?: unknown } }>(
		`/api/onto/projects/${projectId}/inherited-docs/copy`,
		'Failed to copy document',
		{ method: 'POST', body: { document_id: documentId } }
	);
	const id = typeof data.document?.id === 'string' ? data.document.id : null;
	if (!id) throw new ProjectFamilyRequestError('Failed to copy document', 500, null);
	return {
		id,
		title: typeof data.document?.title === 'string' ? data.document.title : 'Untitled'
	};
}

/** A project "Move under…" can offer, with what decides whether it's a valid parent. */
export type ParentCandidate = {
	id: string;
	name: string;
	stateKey: string;
	updatedAt: string;
	/** Only when the viewer can open that parent. */
	parentProjectId: string | null;
	parentProjectName: string | null;
	hasChildren: boolean;
	/** Null when unknown; the server still decides. */
	accessLevel: 'read' | 'write' | 'admin' | null;
};

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Projects for "Move under…", with nesting and access facts (one request). */
export async function fetchParentCandidates(params: {
	search: string;
	limit: number;
	signal?: AbortSignal;
}): Promise<ParentCandidate[]> {
	const query = new URLSearchParams({ limit: String(params.limit), include: 'hierarchy' });
	if (params.search) query.set('search', params.search);
	const response = await fetch(`/api/onto/projects?${query.toString()}`, {
		headers: { Accept: 'application/json' },
		cache: 'no-store',
		signal: params.signal
	});
	const result = await parseApiResponse<{ projects?: unknown }>(response);
	if (!response.ok || !result.success) {
		throw new ProjectFamilyRequestError(
			result.error || 'Failed to load projects',
			response.status,
			result.code ?? null
		);
	}
	const projects = result.data?.projects;
	const rows: unknown[] = Array.isArray(projects) ? projects : [];
	return rows.flatMap((raw) => {
		const row = (raw ?? {}) as Record<string, unknown>;
		const id = str(row.id);
		if (!id) return [];
		const access = str(row.access_level);
		return [
			{
				id,
				name: str(row.name) ?? 'Untitled project',
				stateKey: str(row.state_key) ?? 'planning',
				updatedAt: str(row.updated_at) ?? '',
				parentProjectId: str(row.parent_project_id),
				parentProjectName: str(row.parent_project_name),
				hasChildren: row.has_children === true,
				accessLevel:
					access === 'read' || access === 'write' || access === 'admin' ? access : null
			}
		];
	});
}

/** Take a project out of its parent (admin on either side). */
export function detachProject(projectId: string): Promise<ProjectSetParentResultV1> {
	return setProjectParent(projectId, null);
}

/** "Wayne Strategies' shared docs", "Redline's shared docs". */
export function possessive(name: string): string {
	return name.toLowerCase().endsWith('s') ? `${name}'` : `${name}'s`;
}

export function pluralizeProjects(count: number): string {
	return `${count} ${count === 1 ? 'project' : 'projects'}`;
}
