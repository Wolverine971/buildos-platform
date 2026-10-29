// apps/mobile/src/hooks/use-entities.ts
import type {
	DocumentDetailResponse,
	DocumentUpdateInput,
	ProjectFullResponse,
	TaskUpdateInput
} from '@buildos/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { applyTaskEdit, serverFields, type TaskFields } from '@/lib/task-cache';
import { useAuth } from '@/providers/auth-provider';

/**
 * Reads and writes for projects, tasks and docs. Every cache that shows a task (the task
 * itself, Today, its project) is patched in place after a change, so Mark done strikes the row
 * on the list you came from at once, without a refetch that would drop it.
 */

function useUserId(): string | null {
	const { session } = useAuth();
	return session?.user.id ?? null;
}

export function useProjects() {
	const userId = useUserId();
	return useQuery({
		queryKey: ['projects', userId],
		queryFn: async () => (await api.projects.list({ limit: 100 })).projects,
		enabled: Boolean(userId)
	});
}

export function useProject(projectId: string | undefined) {
	const userId = useUserId();
	return useQuery({
		queryKey: ['project', userId, projectId],
		// The lean first-render read the website's project page uses (task text trimmed; the
		// reader loads the full task).
		queryFn: () => api.projects.full(projectId as string, { profile: 'v2-initial' }),
		enabled: Boolean(userId && projectId)
	});
}

export function useTask(taskId: string | undefined) {
	const userId = useUserId();
	return useQuery({
		queryKey: ['task', userId, taskId],
		queryFn: () => api.tasks.get(taskId as string),
		enabled: Boolean(userId && taskId)
	});
}

export function useDocument(documentId: string | undefined) {
	const userId = useUserId();
	return useQuery({
		queryKey: ['document', userId, documentId],
		queryFn: () => api.documents.get(documentId as string),
		enabled: Boolean(userId && documentId)
	});
}

/** A civil day (`YYYY-MM-DD`) shown at local noon until the server answers with its timestamp. */
function displayDate(value: string | null | undefined): string | null | undefined {
	if (value === undefined || value === null) return value;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y!, m! - 1, d!, 12).toISOString();
	}
	return value;
}

function fieldsFromPatch(patch: TaskUpdateInput): TaskFields {
	const fields: TaskFields = {};
	if (patch.title !== undefined) fields.title = patch.title;
	if (patch.description !== undefined) fields.description = patch.description;
	if (patch.state_key !== undefined && patch.state_key !== null) {
		fields.state_key = patch.state_key as TaskFields['state_key'];
	}
	if (patch.due_at !== undefined) fields.due_at = displayDate(patch.due_at) ?? null;
	if (patch.start_at !== undefined) fields.start_at = displayDate(patch.start_at) ?? null;
	if (patch.priority !== undefined) fields.priority = patch.priority;
	return fields;
}

/**
 * Saves a task change. Shows at once everywhere the task appears; the server's answer then
 * replaces only the fields this change touched, and a failure puts back only those fields.
 * Call with `mutateAsync` so every call gets its own result.
 */
export function useUpdateTask() {
	const queryClient = useQueryClient();
	const userId = useUserId();
	return useMutation({
		mutationFn: ({ taskId, patch }: { taskId: string; patch: TaskUpdateInput }) =>
			api.tasks.update(taskId, patch),
		onMutate: async ({ taskId, patch }) => {
			// A refetch landing mid-save must not overwrite the change on screen.
			await queryClient.cancelQueries({ queryKey: ['task', userId, taskId] });
			const sent = fieldsFromPatch(patch);
			return { sent, edit: applyTaskEdit(queryClient, userId, taskId, sent) };
		},
		onError: (_error, _variables, context) => context?.edit.undo(),
		onSuccess: ({ task }, _variables, context) => {
			if (context) context.edit.confirm(serverFields(task, context.sent));
		}
	});
}

type DocumentSave = {
	documentId: string;
	patch: Omit<DocumentUpdateInput, 'expected_editor_revision'>;
	/**
	 * The revision this save is based on, read when the save is sent (saves of one doc run one
	 * at a time). Defaults to the newest revision this phone has seen.
	 */
	revision?: () => string | undefined;
	/** Told the revision the save was based on and the new one, before the next save starts. */
	onSaved?: (previous: string | undefined, next: string) => void;
};

/**
 * Saves a doc change. Saves of one doc run one after another, so a title rename and a body save
 * never race each other into a false "someone else edited this". Call with `mutateAsync`.
 */
export function useUpdateDocument(documentId: string) {
	const queryClient = useQueryClient();
	const userId = useUserId();
	const key = ['document', userId, documentId] as const;
	return useMutation({
		scope: { id: `document:${documentId}` },
		mutationFn: async ({ patch, revision }: DocumentSave) => {
			const expected =
				revision?.() ??
				queryClient.getQueryData<DocumentDetailResponse>(key)?.editor_revision;
			const response = await api.documents.update(documentId, {
				...patch,
				expected_editor_revision: expected
			});
			return { response, expected };
		},
		onSuccess: ({ response, expected }, { onSaved }) => {
			if (!('editor_revision' in response)) return;
			queryClient.setQueryData<DocumentDetailResponse>(key, {
				document: response.document,
				editor_revision: response.editor_revision
			});
			onSaved?.(expected, response.editor_revision);
			const rename = <T extends { id: string; title: string | null; updated_at: string }>(
				doc: T
			): T =>
				doc.id === documentId
					? {
							...doc,
							title: response.document.title,
							updated_at: response.document.updated_at
						}
					: doc;
			for (const [projectKey, project] of queryClient.getQueriesData<ProjectFullResponse>({
				queryKey: ['project', userId]
			})) {
				if (!project) continue;
				const inList = project.documents.some((doc) => doc.id === documentId);
				const isContext = project.context_document?.id === documentId;
				if (!inList && !isContext) continue;
				queryClient.setQueryData<ProjectFullResponse>(projectKey, {
					...project,
					documents: project.documents.map(rename),
					context_document: project.context_document
						? rename(project.context_document)
						: project.context_document
				});
			}
		}
	});
}
