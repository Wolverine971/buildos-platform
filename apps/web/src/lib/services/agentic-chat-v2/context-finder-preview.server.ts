// apps/web/src/lib/services/agentic-chat-v2/context-finder-preview.server.ts
//
// Workflow Lab preview: rank the project for a question and return the plan as chips, before
// any review starts. The project is read with the caller's RLS-scoped client, so a preview
// can only see what the user can see. The plan carries titles and scores, never record text.
import {
	contextFinderCandidates,
	findProjectContext,
	loadContextFinderProject,
	ContextFinderLoadError,
	type ContextEvidenceRankerV1,
	type ContextFinderCandidateV1,
	type ContextFinderDecider,
	type ContextFinderReadClient,
	type ContextPlanV1
} from '@buildos/agentic-chat-runtime/context-finder';
import { normalizeAgenticChatText } from '@buildos/shared-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ContextFinderPreviewError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

export type ContextFinderPreviewV1 = {
	status: 'selected' | 'empty' | 'unavailable';
	question: string;
	plan: ContextPlanV1 | null;
	ranker: ContextEvidenceRankerV1 | null;
	/** Everything ranked, best first, so the user can add what Jev missed. */
	candidates: ContextFinderCandidateV1[];
	coverage: { fullChars: number; summaryChars: number; budgetChars: number };
};

export async function previewProjectContext(input: {
	client: ContextFinderReadClient;
	decider: ContextFinderDecider;
	userId: string;
	projectId: string;
	question: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}): Promise<ContextFinderPreviewV1> {
	const question = normalizeAgenticChatText(input.question);
	if (!UUID.test(input.projectId) || [...question].length < 3 || [...question].length > 6000)
		throw new ContextFinderPreviewError(
			422,
			'Enter a project question between 3 and 6,000 characters.'
		);
	let project;
	try {
		project = await loadContextFinderProject(
			input.client,
			input.projectId,
			input.signal ?? new AbortController().signal
		);
	} catch (error) {
		// RLS hides projects the user cannot read; the loader reports them as missing.
		if (error instanceof ContextFinderLoadError && error.table === 'onto_projects')
			throw new ContextFinderPreviewError(404, 'Project not found.');
		throw new ContextFinderPreviewError(503, 'Project records could not be read. Try again.');
	}
	const result = await findProjectContext({
		project,
		message: question,
		decider: input.decider,
		signal: input.signal,
		timeoutMs: input.timeoutMs,
		usage: {
			operationType: 'agentic_chat_context_finder_preview',
			userId: input.userId,
			projectId: input.projectId
		}
	});
	return {
		status: result.evidence.status,
		question,
		plan: result.plan,
		ranker: result.evidence.ranker,
		candidates: contextFinderCandidates(result.entities, result.ranking),
		coverage: result.evidence.coverage
	};
}
