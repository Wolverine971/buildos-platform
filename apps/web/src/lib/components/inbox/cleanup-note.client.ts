// apps/web/src/lib/components/inbox/cleanup-note.client.ts
//
// Sends a quick note on one Project cleanup item to Jev (POST .../cleanup/note). Jev reads
// it into apply / not needed / done / hand to an agent and answers with one line.
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';

export type CleanupNoteDecision = 'apply' | 'not_needed' | 'done' | 'agent';

export type CleanupNoteResponse =
	| {
			ok: true;
			decision: CleanupNoteDecision;
			reply: string;
			agentRunId: string | null;
			view: ProjectCleanupView | null;
	  }
	| { ok: false; message: string };

export async function sendCleanupNote(params: {
	projectId: string;
	item: ProjectCleanupItem;
	note: string;
	fetchFn?: typeof fetch;
}): Promise<CleanupNoteResponse> {
	const fetchFn = params.fetchFn ?? fetch;
	try {
		const res = await fetchFn(
			`/api/onto/projects/${encodeURIComponent(params.projectId)}/cleanup/note`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cleanup_item_id: params.item.id,
					note: params.note,
					// What the user was looking at; an apply only goes through if it still matches.
					expected_fingerprints: Object.fromEntries(
						params.item.rows.map((row) => [row.suggestion_id, row.verified_fingerprint])
					)
				})
			}
		);
		const json = await res.json().catch(() => null);
		if (!res.ok) {
			return { ok: false, message: json?.error ?? 'Could not send the note to Jev' };
		}
		return {
			ok: true,
			decision: json?.data?.decision ?? 'agent',
			reply: json?.data?.reply ?? 'Jev is on it.',
			agentRunId: json?.data?.agent_run_id ?? null,
			view: (json?.data?.view ?? null) as ProjectCleanupView | null
		};
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : 'Could not send the note to Jev'
		};
	}
}
