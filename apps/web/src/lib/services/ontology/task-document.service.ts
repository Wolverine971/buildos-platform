// apps/web/src/lib/services/ontology/task-document.service.ts
import type { ApiSuccess } from '$lib/utils/api-response';

export type TaskWorkspaceDocument = {
	document: Record<string, any>;
	edge: Record<string, any>;
};

type FetchResponse = {
	documents: TaskWorkspaceDocument[];
	scratch_pad: TaskWorkspaceDocument | null;
};

export type CreateTaskDocumentPayload = {
	title?: string;
	type_key?: string;
	state_key?: string;
	role?: string;
	body_markdown?: string;
	props?: Record<string, unknown>;
	document_id?: string;
};

export type PromoteTaskDocumentPayload = {
	target_state?: string;
};

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => null)) as ApiSuccess<T> | null;
	if (!response.ok || !payload) {
		const message = (payload as any)?.error || (payload as any)?.message || 'Request failed';
		throw new Error(message);
	}
	return payload.data as T;
}

export async function fetchTaskDocuments(taskId: string): Promise<FetchResponse> {
	const response = await fetch(`/api/onto/tasks/${taskId}/documents`);
	return handleResponse<FetchResponse>(response);
}

export async function createTaskDocument(
	taskId: string,
	payload: CreateTaskDocumentPayload
): Promise<TaskWorkspaceDocument> {
	const response = await fetch(`/api/onto/tasks/${taskId}/documents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	const data = await handleResponse<{ document: Record<string, any>; edge: Record<string, any> }>(
		response
	);

	return {
		document: data.document,
		edge: data.edge
	};
}

export async function promoteTaskDocument(
	taskId: string,
	documentId: string,
	payload: PromoteTaskDocumentPayload = {}
): Promise<TaskWorkspaceDocument> {
	const response = await fetch(`/api/onto/tasks/${taskId}/documents/${documentId}/promote`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	const data = await handleResponse<{
		document: Record<string, any>;
		edge: Record<string, any>;
	}>(response);

	return {
		document: data.document,
		edge: data.edge
	};
}
