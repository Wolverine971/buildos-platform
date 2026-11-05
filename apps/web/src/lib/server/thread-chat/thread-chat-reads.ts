// apps/web/src/lib/server/thread-chat/thread-chat-reads.ts
//
// How a thread reads. Live: the same shared read tools agentic chat uses
// (`read_document_section`, `get_onto_document_details`, `get_onto_*_details`), run as the
// signed-in person through the web access port, so the thread sees exactly what chat would.
// Replay: the same questions answered from the in-memory replay records, for free.
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextFinderEntity } from '@buildos/agentic-chat-runtime/context-finder';
import {
	executeAgenticChatSharedReadToolV1,
	type AgenticChatSharedReadContextV1
} from '@buildos/agentic-chat-runtime/tools';
import { createWebAgenticChatToolAccessAdapter } from '$lib/services/agentic-chat/tools/core/executors/web-access-adapter';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

/** What the model gets back from one read, clipped. */
export const READ_RESULT_MAX_CHARS = 9_000;

export type ReadResult = { text: string; chars: number; tool: string };

export type ThreadReadPort = {
	/** anchors empty = the document's details (whole if short, otherwise preview + index). */
	readDoc(entity: ContextFinderEntity, anchors: string[]): Promise<ReadResult>;
	readRecord(entity: ContextFinderEntity): Promise<ReadResult>;
};

const DETAIL_TOOL = {
	task: ['get_onto_task_details', 'task_id'],
	goal: ['get_onto_goal_details', 'goal_id'],
	milestone: ['get_onto_milestone_details', 'milestone_id'],
	risk: ['get_onto_risk_details', 'risk_id'],
	plan: ['get_onto_plan_details', 'plan_id'],
	document: ['get_onto_document_details', 'document_id']
} as const;

function result(tool: string, payload: unknown): ReadResult {
	const full = typeof payload === 'string' ? payload : JSON.stringify(payload);
	const text =
		full.length > READ_RESULT_MAX_CHARS
			? `${full.slice(0, READ_RESULT_MAX_CHARS)}… (cut at ${READ_RESULT_MAX_CHARS} of ${full.length} chars)`
			: full;
	return { text, chars: full.length, tool };
}

export function liveReadPort(input: {
	session: SupabaseClient<Database>;
	userId: string;
	timezone: string | null;
	signal?: AbortSignal;
}): ThreadReadPort {
	let actor: Promise<string> | null = null;
	const getActorId = () => (actor ??= ensureActorId(input.session as never, input.userId));
	const context: AgenticChatSharedReadContextV1 = {
		client: input.session,
		access: createWebAgenticChatToolAccessAdapter({
			supabase: input.session as never,
			getActorId
		}),
		userId: input.userId,
		timezone: input.timezone,
		signal: input.signal
	};
	return {
		async readDoc(entity, anchors) {
			if (anchors.length) {
				const payload = await executeAgenticChatSharedReadToolV1({
					toolName: 'read_document_section',
					context,
					arguments: { document_id: entity.id, anchors }
				});
				return result('read_document_section', payload);
			}
			const payload = await executeAgenticChatSharedReadToolV1({
				toolName: 'get_onto_document_details',
				context,
				arguments: { document_id: entity.id }
			});
			return result('get_onto_document_details', payload);
		},
		async readRecord(entity) {
			const [toolName, key] = DETAIL_TOOL[entity.kind];
			const payload = await executeAgenticChatSharedReadToolV1({
				toolName,
				context,
				arguments: { [key]: entity.id }
			});
			return result(toolName, payload);
		}
	};
}

/** Replay: answers from the replay rows the entities were built from. */
export function replayReadPort(): ThreadReadPort {
	return {
		async readDoc(entity, anchors) {
			await new Promise((resolve) => setTimeout(resolve, 160));
			if (!anchors.length) return result('get_onto_document_details', entity.fullText);
			const text = entity.sections
				.filter((section) => section.anchor && anchors.includes(section.anchor))
				.map((section) => section.body)
				.join('\n\n');
			return result('read_document_section', text || '(no such section)');
		},
		async readRecord(entity) {
			await new Promise((resolve) => setTimeout(resolve, 120));
			return result(DETAIL_TOOL[entity.kind][0], entity.packet);
		}
	};
}
