// apps/web/src/lib/server/task-document-summaries.ts
//
// The docs made for a task, as the reader lists them: id, title and state, in
// the order they were linked. Scratch pads stay out (they are the task's own
// notes, not docs). `/api/onto/tasks/[id]/documents` returns the same set with
// whole bodies for the task workspace; the reader only needs a list.
import { TASK_DOCUMENT_REL } from '@buildos/agentic-chat-runtime/tools';

export type TaskDocumentSummary = {
	id: string;
	title: string;
	state_key: string;
	type_key: string | null;
};

type Client = { from: (table: string) => any };

export async function loadTaskDocumentSummaries(
	supabase: Client,
	input: { taskId: string; projectId: string }
): Promise<TaskDocumentSummary[]> {
	const { data: edges, error: edgeError } = await supabase
		.from('onto_edges')
		.select('dst_id, props')
		.eq('project_id', input.projectId)
		.eq('src_kind', 'task')
		.eq('src_id', input.taskId)
		.eq('rel', TASK_DOCUMENT_REL)
		.eq('dst_kind', 'document')
		.order('created_at', { ascending: true });
	if (edgeError) throw edgeError;

	const ids = ((edges ?? []) as { dst_id: unknown; props: { role?: unknown } | null }[])
		.filter((edge) => edge.props?.role !== 'scratch' && typeof edge.dst_id === 'string')
		.map((edge) => edge.dst_id as string);
	if (!ids.length) return [];

	const { data: documents, error: documentError } = await supabase
		.from('onto_documents')
		.select('id, title, state_key, type_key')
		.eq('project_id', input.projectId)
		.in('id', ids)
		.is('deleted_at', null);
	if (documentError) throw documentError;

	const byId = new Map(
		((documents ?? []) as TaskDocumentSummary[]).map((document) => [document.id, document])
	);
	return ids.flatMap((id) => {
		const document = byId.get(id);
		return document ? [document] : [];
	});
}
